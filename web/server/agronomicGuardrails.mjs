/**
 * Agronomic Guardrails — anti-sovrapposizione trattamenti e output strutturato calendario.
 */

import { inferMacroCategoriaProdotto } from "./prodottiCatalogo.mjs";
import {
  arricchisciInterventoTrattamento,
  buildDettaglioTrattamento,
} from "./trattamentoPipeline.mjs";

export { inferMacroCategoriaProdotto };

const GIORNI_ANTISOVRAPPOSIZIONE = 30;

/** Tetto applicazioni per macro_categoria e stagione (anno solare). */
export const CAPS_STAGIONALI = {
  K: { primavera: 1, estate: 1, autunno: 2, inverno: 0, anno: 3 },
  N: { primavera: 2, estate: 0, autunno: 1, inverno: 0, anno: 3 },
  P: { primavera: 1, estate: 0, autunno: 2, inverno: 0, anno: 2 },
  Biostimolante: { primavera: 2, estate: 2, autunno: 2, inverno: 1, anno: 6 },
  Correttivo: { primavera: 1, estate: 0, autunno: 1, inverno: 0, anno: 2 },
  Fungicida: { primavera: 1, estate: 1, autunno: 1, inverno: 0, anno: 3 },
  Insetticida: { primavera: 1, estate: 1, autunno: 1, inverno: 0, anno: 3 },
  Diserbante: { primavera: 1, estate: 0, autunno: 1, inverno: 0, anno: 2 },
  Semente: { primavera: 1, estate: 0, autunno: 2, inverno: 0, anno: 2 },
  Bagnante: { primavera: 1, estate: 2, autunno: 1, inverno: 0, anno: 4 },
  Altro: { primavera: 2, estate: 2, autunno: 2, inverno: 1, anno: 6 },
};

const PRIORITA_SCORE = { alta: 3, media: 2, bassa: 1 };

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function stagioneDaData(iso) {
  const m = new Date(`${iso || new Date().toISOString().slice(0, 10)}T12:00:00`).getMonth() + 1;
  if (m >= 3 && m <= 5) return "primavera";
  if (m >= 6 && m <= 8) return "estate";
  if (m >= 9 && m <= 11) return "autunno";
  return "inverno";
}

function annoDaData(iso) {
  return String(iso || "").slice(0, 4) || String(new Date().getFullYear());
}

function isFrazionamentoEsplicito(intervento) {
  const t = `${intervento?.titolo || ""} ${intervento?.descrizione || ""}`.toLowerCase();
  return /frazionat|micro.?dos|seconda passata|ripasso|split|metà dose|meta dose/i.test(t);
}

export function macroDaIntervento(intervento, prodottiById) {
  const det = intervento?.dettaglio_trattamento;
  const macroDet =
    typeof det === "object" && det?.macro_categoria
      ? det.macro_categoria
      : typeof det === "string"
        ? (() => {
            try {
              return JSON.parse(det)?.macro_categoria;
            } catch {
              return null;
            }
          })()
        : null;
  if (macroDet) return macroDet;
  if (intervento?.macro_categoria) return intervento.macro_categoria;
  if (intervento?.prodotto_id != null) {
    const p = prodottiById.get(intervento.prodotto_id);
    if (p) return inferMacroCategoriaProdotto(p, intervento);
  }
  const cat = String(intervento?.categoria || "").toLowerCase();
  if (cat === "concime") return "N";
  if (cat === "biostimolante") return "Biostimolante";
  if (cat === "umettante") return "Bagnante";
  if (cat === "trattamento") return "Fungicida";
  if (cat === "diserbo") return "Diserbante";
  if (cat === "rinnovo") return "Semente";
  return "Altro";
}

function indiceSalinita(intervento, prodottiById) {
  if (intervento?.prodotto_id != null) {
    const p = prodottiById.get(intervento.prodotto_id);
    if (p?.salt_index != null) return Number(p.salt_index);
  }
  const macro = macroDaIntervento(intervento, prodottiById);
  if (macro === "K" || macro === "N") return 40;
  if (macro === "Correttivo") return 25;
  return 10;
}

/** Storico utente: completati + pianificati (ultimi N giorni e anno corrente). */
export async function loadStoricoTrattamenti(admin, userId, oggi) {
  if (!admin || !userId) return [];
  const da = addDays(oggi, -365);
  const { data, error } = await admin
    .from("prato_interventi")
    .select(
      "id, titolo, descrizione, categoria, stato, data_prevista, data_completamento, prodotto_id, prodotto_nome, macro_categoria, dettaglio_trattamento, fonte",
    )
    .eq("user_id", userId)
    .gte("data_prevista", da)
    .in("categoria", ["concime", "biostimolante", "umettante", "trattamento", "diserbo", "rinnovo"]);

  if (error) {
    console.warn("[guardrails] storico:", error.message);
    return [];
  }
  return data ?? [];
}

function dataRiferimento(i) {
  return i.data_completamento || i.data_prevista;
}

function macroUsataNeiUltimiGiorni(storico, macro, oggi, prodottiById, giorni = GIORNI_ANTISOVRAPPOSIZIONE) {
  const limite = addDays(oggi, -giorni);
  return storico.filter((s) => {
    const d = dataRiferimento(s);
    if (!d || d < limite || d > oggi) return false;
    return macroDaIntervento(s, prodottiById) === macro;
  });
}

function contaMacroStagione(lista, macro, stagione, anno, prodottiById) {
  return lista.filter((i) => {
    const d = dataRiferimento(i);
    if (!d) return false;
    if (anno && annoDaData(d) !== anno) return false;
    const matchMacro = macroDaIntervento(i, prodottiById) === macro;
    if (!stagione) return matchMacro;
    return matchMacro && stagioneDaData(d) === stagione;
  }).length;
}

function superaSaturazioneSalina(piano, prodottiById, soglia = 120) {
  const anno = String(new Date().getFullYear());
  let tot = 0;
  for (const i of piano) {
    const d = dataRiferimento(i);
    if (!d || annoDaData(d) !== anno) continue;
    if (!["concime", "biostimolante", "correttivo"].includes(String(i.categoria || "").toLowerCase())) continue;
    tot += indiceSalinita(i, prodottiById);
  }
  return tot > soglia;
}

/**
 * Verifica se un intervento può restare nel piano (30 gg + cap stagionale + salinità).
 */
export function valutaInterventoGuardrail(intervento, ctx) {
  const { storico = [], pianoAccettati = [], prodottiById, oggi, profilo } = ctx;
  const macro = macroDaIntervento(intervento, prodottiById);
  const caps = CAPS_STAGIONALI[macro] || CAPS_STAGIONALI.Altro;
  const stagione = stagioneDaData(intervento.data_prevista);
  const anno = annoDaData(intervento.data_prevista);

  const tutti = [...storico, ...pianoAccettati];
  const in30 = macroUsataNeiUltimiGiorni(tutti, macro, oggi, prodottiById);
  if (in30.length > 0 && !isFrazionamentoEsplicito(intervento)) {
    return {
      ok: false,
      motivo: `Già un trattamento ${macro} nei ultimi ${GIORNI_ANTISOVRAPPOSIZIONE} giorni (${in30[0].prodotto_nome || in30[0].titolo}).`,
      macro,
    };
  }

  const inStagione =
    contaMacroStagione(pianoAccettati, macro, stagione, anno, prodottiById) +
    contaMacroStagione(
      storico.filter((s) => s.stato === "completato"),
      macro,
      stagione,
      anno,
      prodottiById,
    );
  if (inStagione >= (caps[stagione] ?? 2)) {
    return {
      ok: false,
      motivo: `Tetto ${macro} per ${stagione} raggiunto (max ${caps[stagione]}).`,
      macro,
    };
  }

  const inAnno =
    contaMacroStagione(pianoAccettati, macro, null, anno, prodottiById) +
    contaMacroStagione(
      storico.filter((s) => s.stato === "completato"),
      macro,
      null,
      anno,
      prodottiById,
    );
  if (inAnno >= (caps.anno ?? 4)) {
    return { ok: false, motivo: `Tetto annuo ${macro} raggiunto (max ${caps.anno}).`, macro };
  }

  const pianoTest = [...pianoAccettati, { ...intervento, macro_categoria: macro }];
  if (superaSaturazioneSalina(pianoTest, prodottiById) && (macro === "K" || macro === "N")) {
    return {
      ok: false,
      motivo: "Saturazione sali nel suolo: riduci concimi salini nella stessa stagione.",
      macro,
    };
  }

  if (stagione === "estate" && macro === "N" && !isFrazionamentoEsplicito(intervento)) {
    return { ok: false, motivo: "Azoto non raccomandato in estate (stress termico).", macro };
  }

  return { ok: true, macro };
}

/** Alias esplicito: blocco stessa macro_categoria entro 30 giorni (salvo micro-dosi). */
export const verificaAntiSovrapposizione30Giorni = valutaInterventoGuardrail;

function scoreMantieni(i) {
  return (PRIORITA_SCORE[i.priorita] ?? 1) * 10 + (i.prodotto_id ? 5 : 0) + (i.dose_totale ? 2 : 0);
}

/** Una sola voce per macro_categoria per mese-calendario (evita 3 concimi K in luglio). */
export function dedupeMacroPerMese(interventi, prodottiById) {
  const byKey = new Map();
  const senzaMacro = [];

  for (const i of interventi) {
    const catInt = String(i.categoria || "").toLowerCase();
    if (!["concime", "biostimolante", "umettante", "trattamento", "diserbo"].includes(catInt)) {
      senzaMacro.push(i);
      continue;
    }
    const macro = macroDaIntervento(i, prodottiById);
    const mese = (i.data_prevista || "").slice(0, 7) || "unknown";
    const key = `${mese}|${macro}`;
    const prev = byKey.get(key);
    if (!prev || scoreMantieni(i) > scoreMantieni(prev)) {
      byKey.set(key, { ...i, macro_categoria: macro });
    }
  }

  return [...senzaMacro, ...byKey.values()].sort(
    (a, b) => (a.data_prevista || "").localeCompare(b.data_prevista || "") || (a.ordine ?? 0) - (b.ordine ?? 0),
  );
}

const TEMPLATE_UX = {
  K: {
    titolo: "Protezione del prato dal caldo estivo",
    razionale:
      "Apporto di potassio per rinforzare le pareti cellulari e migliorare la ritenzione idrica sotto stress termico.",
    messaggio:
      "Il grande caldo è in arrivo. Distribuisci il prodotto nelle ore più fresche per aiutare le radici a trattenere umidità e limitare l'ingiallimento.",
  },
  N: {
    titolo: "Rinverdimento e spinta vegetativa",
    razionale: "Apporto controllato di azoto per ricostruire la massa fogliare dopo il risveglio primaverile.",
    messaggio:
      "Dopo l'inverno il prato ha bisogno di energia. Spargi il concime su prato asciutto e irriga leggermente se non piove entro 48 ore.",
  },
  P: {
    titolo: "Radici più forti in autunno",
    razionale: "Fosforo per favorire l'anchorage radicale e la riserva prima del riposo invernale.",
    messaggio:
      "In autunno le radici lavorano di più. Applica in giornata mite e non tagliare per 3–4 giorni dopo il trattamento.",
  },
  Biostimolante: {
    titolo: "Sostegno al prato sotto stress",
    razionale: "Biostimolanti per migliorare la risposta fisiologica a caldo, siccità o passaggio frequente.",
    messaggio:
      "Un aiuto mirato per il tappeto: applica con irrigazione leggera o su foglia umida al mattino, senza eccessi.",
  },
  Fungicida: {
    titolo: "Protezione da malattie fungine",
    razionale: "Intervento preventivo o curativo allineato ai protocolli su umidità fogliare e temperatura.",
    messaggio:
      "Controlla il meteo: meglio trattare con foglia asciutta e senza pioggia per 24 ore. Rispetta sempre l'etichetta.",
  },
  default: {
    titolo: null,
    razionale: null,
    messaggio:
      "Segui la data indicata e le condizioni del meteo. In dubbio, riduci la dose e preferisci le ore serali.",
  },
};

/**
 * Fasi 1–2 senza prodotti (per valutazione guardrail pre-match catalogo).
 */
export function strutturaEducazioneSenzaProdotti(intervento, profilo, opts = {}) {
  const { vision, weatherBundle } = opts;
  const det = buildDettaglioTrattamento(intervento, {
    profilo,
    prodotti: [],
    vision,
    weatherBundle,
    includeProdotti: false,
  });
  return {
    ...intervento,
    titolo: String(det.tipo_intervento).slice(0, 120),
    macro_categoria: det.macro_categoria,
    spiegazione_semplice: det.spiegazione_semplice,
    messaggio_ux: det.spiegazione_semplice,
    razionale_scientifico: det.razionale_scientifico,
    dettaglio_trattamento: null,
    prodotto_id: null,
    prodotto_nome: null,
  };
}

/**
 * Struttura output Educazione → Soluzione (dopo guardrail: educazione + 1–2 prodotti).
 */
export async function strutturaOutputCalendario(intervento, _prodotto, profilo, opts = {}) {
  if (intervento?.dettaglio_trattamento?.tipo_intervento) {
    return {
      ...intervento,
      macro_categoria: intervento.macro_categoria || intervento.dettaglio_trattamento.macro_categoria,
    };
  }
  const { prodotti = [], vision, weatherBundle } = opts;
  if (prodotti.length) {
    return arricchisciInterventoTrattamento(intervento, profilo, prodotti, vision, weatherBundle);
  }
  const macro = macroDaIntervento(intervento, new Map());
  const tpl = TEMPLATE_UX[macro] || TEMPLATE_UX.default;
  return {
    ...intervento,
    titolo: (tpl.titolo || intervento.titolo || "Intervento prato").slice(0, 120),
    macro_categoria: macro,
    razionale_scientifico: (tpl.razionale || intervento.descrizione || "").slice(0, 800),
    messaggio_ux: (tpl.messaggio || "").slice(0, 600),
    spiegazione_semplice: (tpl.messaggio || "").slice(0, 600),
    prodotto_id: null,
    prodotto_nome: null,
  };
}

/**
 * Pipeline guardrails: filtro 30gg + cap stagionale + dedupe mese/macro + output strutturato.
 */
export async function applicaGuardrailsCalendario(interventi, opts = {}) {
  const {
    storico = [],
    prodotti = [],
    profilo,
    vision,
    weatherBundle,
    oggi = new Date().toISOString().slice(0, 10),
  } = opts;
  const prodottiById = new Map(prodotti.map((p) => [p.id, p]));

  const trattamenti = interventi.filter((i) =>
    ["concime", "biostimolante", "umettante", "trattamento", "diserbo", "rinnovo"].includes(
      String(i.categoria || "").toLowerCase(),
    ),
  );
  const altri = interventi.filter(
    (i) =>
      !["concime", "biostimolante", "umettante", "trattamento", "diserbo", "rinnovo"].includes(
        String(i.categoria || "").toLowerCase(),
      ),
  );

  const ctx = { storico, pianoAccettati: [], prodottiById, oggi, profilo };
  const accettati = [];
  let bloccati = 0;

  const sorted = [...trattamenti].sort(
    (a, b) => (PRIORITA_SCORE[b.priorita] ?? 1) - (PRIORITA_SCORE[a.priorita] ?? 1),
  );

  for (const i of sorted) {
    const bozza = strutturaEducazioneSenzaProdotti(i, profilo, { vision, weatherBundle });
    const val = valutaInterventoGuardrail(
      { ...bozza, macro_categoria: macroDaIntervento(bozza, prodottiById) },
      ctx,
    );
    if (!val.ok) {
      bloccati += 1;
      continue;
    }
    const strutturato = await strutturaOutputCalendario(
      { ...i, macro_categoria: val.macro || i.macro_categoria },
      null,
      profilo,
      { prodotti, vision, weatherBundle },
    );
    ctx.pianoAccettati.push(strutturato);
    accettati.push(strutturato);
  }

  const deduped = dedupeMacroPerMese(accettati, prodottiById);
  const finali = [...altri, ...deduped].sort(
    (a, b) => (a.data_prevista || "").localeCompare(b.data_prevista || "") || (a.ordine ?? 0) - (b.ordine ?? 0),
  );

  return { interventi: finali, bloccati, deduped: accettati.length - deduped.length };
}
