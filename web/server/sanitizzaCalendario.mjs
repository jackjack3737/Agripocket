/**
 * Sanitizzazione deterministica del piano (non delegare all'LLM).
 */

import { configLivelloImpegno, normalizzaLivelloImpegno } from "./livelloImpegno.mjs";

const ROUTINE_CATEGORIE = new Set(["taglio", "irrigazione"]);
const LIQUID_HINT = /liquid|liquido|umett|biostim|tryko|vigor|pre-stress|always|surfact/i;

export function isRoutineCategoria(categoria) {
  return ROUTINE_CATEGORIE.has(String(categoria || "").toLowerCase());
}

/** Rimuove taglio e irrigazione generica dal calendario DB. */
export function rimuoviRoutineCalendario(interventi) {
  return interventi.filter((i) => !isRoutineCategoria(i.categoria));
}

/** Luglio/Agosto: concime → biostimolante antistress (no azoto estivo). */
export function bloccoTermicoEstivo(interventi) {
  return interventi.map((i) => {
    if (String(i.categoria || "").toLowerCase() !== "concime") return i;
    const mese = new Date(`${i.data_prevista}T12:00:00`).getMonth() + 1;
    if (mese !== 7 && mese !== 8) return i;
    return {
      ...i,
      categoria: "biostimolante",
      prodotto_id: null,
      prodotto_nome: null,
      dose_totale: null,
      dose_unita: null,
      dose_per_mq: null,
      descrizione:
        "Sostituzione di sicurezza: vietato azoto nei mesi caldi per evitare patogeni. Convertito in biostimolante antistress. " +
        (i.descrizione || "").slice(0, 400),
    };
  });
}

function isLiquidIntervento(i) {
  const cat = String(i.categoria || "").toLowerCase();
  if (cat === "biostimolante" || cat === "umettante") return true;
  const blob = `${i.titolo} ${i.descrizione} ${i.prodotto_nome || ""}`;
  return LIQUID_HINT.test(blob) && cat === "concime";
}

/** Unisce prodotti liquidi compatibili nello stesso mese in un Tank-Mix. */
export function applicaTankMix(interventi) {
  const byMonth = new Map();
  const rest = [];

  for (const i of interventi) {
    if (!isLiquidIntervento(i)) {
      rest.push(i);
      continue;
    }
    const mk = i.data_prevista?.slice(0, 7) || "unknown";
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(i);
  }

  const out = [...rest];
  for (const [, items] of byMonth) {
    if (items.length < 2) {
      out.push(...items);
      continue;
    }
    items.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));
    const nomi = items
      .map((x) => x.prodotto_nome || x.titolo.replace(/^Tank-Mix:\s*/i, ""))
      .filter(Boolean);
    const titolo = `Tank-Mix: ${nomi.slice(0, 3).join(" + ")}`.slice(0, 120);
    const descrizione = items
      .map((x) => x.descrizione || x.prodotto_nome)
      .filter(Boolean)
      .join(" · ")
      .slice(0, 600);
    out.push({
      ...items[0],
      titolo,
      descrizione: descrizione || "Miscela liquida compatibile da applicare insieme.",
      categoria: "biostimolante",
      priorita: items.some((x) => x.priorita === "alta") ? "alta" : "media",
    });
  }

  return out.sort(
    (a, b) => a.data_prevista.localeCompare(b.data_prevista) || (a.ordine ?? 0) - (b.ordine ?? 0),
  );
}

export function capInterventiPerLivello(interventi, profilo) {
  const cfg = configLivelloImpegno(profilo);
  if (interventi.length <= cfg.maxInterventi) return interventi;
  const sorted = [...interventi].sort((a, b) => {
    const pa = { alta: 0, media: 1, bassa: 2 }[a.priorita] ?? 1;
    const pb = { alta: 0, media: 1, bassa: 2 }[b.priorita] ?? 1;
    if (pa !== pb) return pa - pb;
    return a.data_prevista.localeCompare(b.data_prevista);
  });
  return sorted.slice(0, cfg.maxInterventi);
}

/** Pipeline post-generazione Gemini + catalogo. */
export function sanitizzaPianoCompleto(interventi, profilo, _oggi) {
  let list = [...interventi];
  list = rimuoviRoutineCalendario(list);
  list = bloccoTermicoEstivo(list);
  list = applicaTankMix(list);
  list = capInterventiPerLivello(list, profilo);
  return list;
}

/** Patologia fungina visibile in foto. */
export function visionePatologiaFungina(vision) {
  if (!vision || typeof vision !== "object") return false;
  const mal = vision.malattie_sospette || [];
  if (Array.isArray(mal) && mal.length > 0) return true;
  const prob = vision.problemi_rilevati || [];
  if (
    prob.some(
      (p) =>
        /fungh|oidio|patogen|marcium|rossore/i.test(`${p?.problema} ${p?.dettaglio}`) &&
        ["media", "alta"].includes(String(p?.gravita || "").toLowerCase()),
    )
  ) {
    return true;
  }
  return /fungh|oidio|patogen|macchl/i.test(String(vision.sintesi_visiva || ""));
}

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Override emergenza patologia dopo analisi foto.
 * @returns {{ aggiunti: object[], concimiRimossi: number }}
 */
export function buildInterventiPatologiaEmergenza(vision, profilo, oggi) {
  if (!visionePatologiaFungina(vision)) return { aggiunti: [], concimiRimossi: 0 };

  const curativo = {
    titolo: "Trattamento fungicida urgente (da foto)",
    descrizione:
      "Evidenza di patologia fogliare in analisi foto. Valuta prodotto idoneo PFNPO su etichetta; non sostituisce diagnosi in campo.",
    categoria: "trattamento",
    priorita: "alta",
    data_prevista: oggi,
    ordine: 0,
    fonte: "ia_foto",
    manual_override: true,
  };

  const recupero = {
    titolo: "Biostimolante recupero post-trattamento",
    descrizione:
      "Supporto antistress 3 giorni dopo il trattamento curativo per aiutare il recupero fogliare (es. Always o equivalente).",
    categoria: "biostimolante",
    priorita: "media",
    data_prevista: addDaysIso(oggi, 3),
    ordine: 1,
    fonte: "ia_foto",
    manual_override: true,
  };

  return { aggiunti: [curativo, recupero], concimiRimossi: 0, finestraGiorni: 21 };
}

const MESE_AEREGG = /ariegg|scarific|svasatur|feltro|thatch/i;

function meseKey(iso) {
  return (iso || "").slice(0, 7);
}

/**
 * Rinnovo/trasemina solo se nello stesso mese c'è arieggiatura o scarifica.
 * Rimuove interventi rinnovo isolati generati dall'LLM.
 */
export function applicaRegolaTrasemina(interventi) {
  const byMonth = new Map();
  for (const i of interventi) {
    const mk = meseKey(i.data_prevista);
    if (!mk) continue;
    if (!byMonth.has(mk)) byMonth.set(mk, { rinnovi: [], arieggiatura: false });
    const bucket = byMonth.get(mk);
    const cat = String(i.categoria || "").toLowerCase();
    if (cat === "rinnovo") bucket.rinnovi.push(i);
    else if (cat === "arieggiatura" || MESE_AEREGG.test(`${i.titolo} ${i.descrizione}`)) {
      bucket.arieggiatura = true;
    }
  }

  const rinnoviOrfani = new Set();
  for (const [, bucket] of byMonth) {
    if (bucket.rinnovi.length && !bucket.arieggiatura) {
      for (const r of bucket.rinnovi) rinnoviOrfani.add(r);
    }
  }

  if (!rinnoviOrfani.size) return interventi;

  return interventi.filter((i) => !rinnoviOrfani.has(i));
}

export { normalizzaLivelloImpegno };
