/**
 * Sanitizzazione deterministica del piano (non delegare all'LLM).
 */

import { configLivelloImpegno, normalizzaLivelloImpegno } from "./livelloImpegno.mjs";
import { applicaGuardrailsCalendario, macroDaIntervento } from "./agronomicGuardrails.mjs";
import { arricchisciInterventoEsigenze, derivaEsigenzeMolecolari } from "./esigenzeAgronomiche.mjs";

function derivaEsigenzeDaItem(item) {
  return item.esigenze_molecolari?.length ? item.esigenze_molecolari : derivaEsigenzeMolecolari(item);
}

const ROUTINE_CATEGORIE = new Set(["taglio", "irrigazione"]);
const LIQUID_HINT = /liquid|liquido|umett|biostim|surfact|fogliar|miscela/i;

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
      dettaglio_trattamento: null,
      spiegazione_semplice: null,
      dosaggio_calcolato: null,
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
    const esigenze = [
      ...new Set(
        items.flatMap((x) => x.esigenze_molecolari || derivaEsigenzeDaItem(x)).filter(Boolean),
      ),
    ];
    const titolo = "Miscela fogliare compatibile".slice(0, 120);
    const descrizione = [
      items.map((x) => x.fabbisogno_fisiologico || x.descrizione).filter(Boolean).join(" · "),
      esigenze.length ? `Esigenze: ${esigenze.join(" · ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 600);
    out.push(
      arricchisciInterventoEsigenze({
        ...items[0],
        titolo,
        descrizione: descrizione || "Miscela liquida compatibile da applicare insieme.",
        esigenze_molecolari: esigenze,
        categoria: "biostimolante",
        priorita: items.some((x) => x.priorita === "alta") ? "alta" : "media",
      }),
    );
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

function interventoHaMacroN(i, prodottiById) {
  const macro = macroDaIntervento(i, prodottiById);
  if (macro === "N") return true;
  const blob = `${i.titolo} ${i.descrizione}`.toLowerCase();
  return /azot|nitrogen|npk.*\bn\b|concim.*azot|rinverd|spinta vegetativa/i.test(blob);
}

function prossimaDataStagionale(mese, giorno, oggi) {
  const from = new Date(`${oggi}T12:00:00`);
  let d = new Date(from.getFullYear(), mese - 1, giorno);
  if (d <= from) d = new Date(from.getFullYear() + 1, mese - 1, giorno);
  return d.toISOString().slice(0, 10);
}

/** Inietta N autunnale/primaverile se l'LLM li ha omessi (P0 revisione Gemini). */
export function ensureMatriceNPKObbligatoria(interventi, oggi, prodottiById = new Map()) {
  const list = [...interventi];

  const haNAutunno = list.some((i) => {
    const m = new Date(`${i.data_prevista}T12:00:00`).getMonth() + 1;
    return (m >= 9 && m <= 11) && interventoHaMacroN(i, prodottiById);
  });
  const haNPrimavera = list.some((i) => {
    const m = new Date(`${i.data_prevista}T12:00:00`).getMonth() + 1;
    return (m >= 3 && m <= 5) && interventoHaMacroN(i, prodottiById);
  });

  if (!haNAutunno) {
    list.push({
      titolo: "Concimazione azotata autunnale (ripresa vegetativa)",
      descrizione:
        "Apporto di azoto per densità e colore dopo l'estate. Inserito automaticamente dal motore fisiologico Solum perché mancava nel piano generato.",
      categoria: "concime",
      priorita: "alta",
      data_prevista: prossimaDataStagionale(9, 25, oggi),
      ordine: 4100,
      fonte: "calendario_stagionale",
      macro_categoria: "N",
    });
  }

  if (!haNPrimavera) {
    list.push({
      titolo: "Concimazione azotata primaverile",
      descrizione:
        "Spinta vegetativa di ripresa dopo l'inverno. Inserito automaticamente dal motore fisiologico Solum se assente nel piano LLM.",
      categoria: "concime",
      priorita: "alta",
      data_prevista: prossimaDataStagionale(4, 5, oggi),
      ordine: 1200,
      fonte: "calendario_stagionale",
      macro_categoria: "N",
    });
  }

  return list.sort(
    (a, b) => (a.data_prevista || "").localeCompare(b.data_prevista || "") || (a.ordine ?? 0) - (b.ordine ?? 0),
  );
}

/** Pipeline post-generazione Gemini + catalogo + guardrails agronomici. */
export async function sanitizzaPianoCompleto(interventi, profilo, oggi, opts = {}) {
  const prodottiById = new Map((opts.prodotti || []).map((p) => [p.id, p]));
  let list = [...interventi];
  list = rimuoviRoutineCalendario(list);
  list = bloccoTermicoEstivo(list);
  list = applicaTankMix(list);
  list = ensureMatriceNPKObbligatoria(list, oggi, prodottiById);
  list = capInterventiPerLivello(list, profilo);

  const {
    storico = [],
    prodotti = [],
    vision,
    weatherBundle,
    pureAgronomy = false,
    indiceProdottiIntervento = null,
  } = opts;
  if (pureAgronomy) {
    list = list.map((i) => arricchisciInterventoEsigenze(i, { weatherBundle }));
  }
  const { interventi: conGuardrails, bloccati, deduped } = await applicaGuardrailsCalendario(list, {
    storico,
    prodotti: pureAgronomy ? [] : prodotti,
    profilo,
    vision,
    weatherBundle,
    pureAgronomy,
    indiceProdottiIntervento,
    oggi: oggi || new Date().toISOString().slice(0, 10),
  });
  if (bloccati > 0 || deduped > 0) {
    console.info(`[guardrails] bloccati=${bloccati} dedupe=${deduped}`);
  }
  return conGuardrails;
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
      "Supporto antistress 3 giorni dopo il trattamento curativo: Acidi umici/fulvici e amminoacidi per recupero fogliare.",
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
