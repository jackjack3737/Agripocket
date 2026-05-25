/**
 * Motore di matchmaking Solum: intervento agronomico ↔ prodotti_mercato.
 *
 * Scoring (punti assoluti):
 *  - +50 categoria/macro compatibile
 *  - +20 per ogni esigenza molecolare trovata in composizione/descrizione
 *  - +10 se il nome prodotto contiene parole chiave dell'esigenza
 *  - 0 e scarto se macro incompatibili
 *
 * Integrazione: generaPianoStagionale → trattamentoPipeline → scripts/link_prodotti_calendario.mjs
 */

/** Punteggio minimo per consigliare un prodotto (pure agronomy: niente match deboli). */
export const MIN_MATCH_SCORE = 50;

/** Massimo prodotti restituiti per intervento. */
export const MAX_PRODOTTI_MATCH = 3;

/** Punteggio teorico massimo (per normalizzazione DB 0–1). */
export const MAX_SCORE_TEORICO = 120;

const PUNTI_CATEGORIA = 50;
const PUNTI_MOLECOLA = 20;
const PUNTI_TITOLO = 10;

/** categoria_agronomica etichetta → macro Solum. */
export const MACRO_DA_CATEGORIA_AGRONOMICA = {
  Biostimolante: "Biostimolante",
  "Concime NPK": "N",
  Correttivo: "Correttivo",
  Fungicida: "Fungicida",
  Diserbante: "Diserbante",
  Insetticida: "Insetticida",
  Bagnante: "Bagnante",
  Semente: "Semente",
  Altro: "Altro",
};

/** categoria intervento prato → macro default. */
const MACRO_DA_CATEGORIA_INTERVENTO = {
  concime: "N",
  biostimolante: "Biostimolante",
  umettante: "Bagnante",
  trattamento: "Fungicida",
  diserbo: "Diserbante",
  rinnovo: "Semente",
  arieggiatura: "Altro",
  pulizia: "Altro",
  taglio: "Altro",
  irrigazione: "Altro",
  altro: "Altro",
};

/** Coppie macro incompatibili (prodotto non idoneo per l'intervento). */
const MACRO_INCOMPATIBILI = new Set([
  "Diserbante|Biostimolante",
  "Diserbante|N",
  "Diserbante|P",
  "Diserbante|K",
  "Diserbante|Correttivo",
  "Diserbante|Semente",
  "Fungicida|Diserbante",
  "Fungicida|Semente",
  "Semente|Fungicida",
  "Semente|Diserbante",
  "Semente|Insetticida",
  "Insetticida|Semente",
  "Bagnante|Diserbante",
  "Bagnante|Fungicida",
]);

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function tokenize(s) {
  return normalizeText(s)
    .replace(/[^a-z0-9àèéìòù]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Macro categoria dell'intervento (input pipeline).
 * @param {object} intervento
 */
export function macroIntervento(intervento) {
  if (intervento?.macro_categoria) return String(intervento.macro_categoria).trim();
  const det = intervento?.dettaglio_trattamento;
  if (det && typeof det === "object" && det.macro_categoria) return det.macro_categoria;
  const cat = String(intervento?.categoria || "").toLowerCase();
  return MACRO_DA_CATEGORIA_INTERVENTO[cat] || "Altro";
}

/**
 * Macro categoria del prodotto catalogo.
 * @param {object} row — riga prodotti_mercato o shape normalizzato
 */
export function macroProdotto(row) {
  if (row?.macro_categoria) return String(row.macro_categoria).trim();
  const catAg = row?.categoria_agronomica || row?.categoria;
  return MACRO_DA_CATEGORIA_AGRONOMICA[catAg] || "Altro";
}

function coppiaIncompatibile(macroInt, macroProd) {
  if (!macroInt || !macroProd || macroInt === macroProd) return false;
  if (macroInt === "Altro" || macroProd === "Altro") return false;
  const a = `${macroInt}|${macroProd}`;
  const b = `${macroProd}|${macroInt}`;
  return MACRO_INCOMPATIBILI.has(a) || MACRO_INCOMPATIBILI.has(b);
}

const NPK_MACROS = new Set(["N", "P", "K"]);

function categoriaCombacia(intervento, prodottoNorm) {
  const macroInt = macroIntervento(intervento);
  const macroProd = prodottoNorm.macro_categoria;
  if (macroInt === macroProd) return true;
  if (
    prodottoNorm.categoria === "Concime NPK" &&
    NPK_MACROS.has(macroInt) &&
    (NPK_MACROS.has(macroProd) || macroProd === "N")
  ) {
    return true;
  }
  const catInt = String(intervento?.categoria || "").toLowerCase();
  const catProd = String(prodottoNorm.categoria_intervento || "").toLowerCase();
  if (catInt && catProd && catInt === catProd) return true;
  return false;
}

/**
 * Normalizza esigenze molecolari (stringhe o oggetti { nome, molecola, … }).
 * @param {unknown} esigenze
 * @returns {string[]}
 */
export function normalizzaEsigenzeMolecolari(esigenze) {
  if (!Array.isArray(esigenze)) return [];
  return esigenze
    .map((e) => {
      if (typeof e === "string") return e.trim();
      if (e && typeof e === "object") {
        return [e.nome, e.molecola, e.chimica, e.ruolo].filter(Boolean).join(" ").trim();
      }
      return "";
    })
    .filter((s) => s.length >= 2);
}

/**
 * Normalizza riga `prodotti_mercato` per il motore di scoring.
 * @param {object} row
 */
export function normalizzaProdottoMercato(row) {
  const compArr = row.composizione_molecolare_dichiarata;
  const comp =
    Array.isArray(compArr) && compArr.length
      ? compArr.join("; ")
      : String(row.composizione || "");
  const targetArr = row.target_fisiologico;
  const descrizione =
    (Array.isArray(targetArr) && targetArr.length ? targetArr.join("; ") : "") ||
    String(row.descrizione || row.raw_text_excerpt || "").trim();

  return {
    id: row.id,
    id_prodotto: row.id,
    nome_commerciale: String(row.prodotto || row.nome_commerciale || "").trim(),
    produttore: row.produttore || null,
    categoria: row.categoria_agronomica || row.categoria || "Altro",
    categoria_intervento: row.categoria_intervento || null,
    macro_categoria: macroProdotto(row),
    composizione: comp,
    descrizione,
    is_bio: !!row.is_bio,
    _raw: row,
  };
}

function termineInBlob(termine, blobNorm, nomeNorm) {
  const t = normalizeText(termine);
  if (t.length < 3) return false;
  if (blobNorm.includes(t)) return true;
  const tokens = tokenize(termine);
  if (!tokens.length) return false;
  const hitBlob = tokens.filter((w) => blobNorm.includes(w)).length;
  const hitNome = tokens.filter((w) => nomeNorm.includes(w)).length;
  return hitBlob >= Math.min(tokens.length, 2) || hitNome >= 1;
}

function buildMotivoSuggerimento({ categoriaOk, molHits, molTotal, titoloHits }) {
  const parts = [];
  if (categoriaOk) parts.push("categoria idonea");
  if (molTotal > 0) {
    const pct = Math.round((molHits / molTotal) * 100);
    parts.push(`contiene circa il ${pct}% delle molecole richieste`);
  } else if (molHits > 0) {
    parts.push(`${molHits} esigenze coperte in etichetta`);
  }
  if (titoloHits > 0) parts.push("nome prodotto in linea con il bisogno");
  return parts.length ? parts.join("; ") : "Match debole";
}

/**
 * Calcola match_score e motivo per una coppia intervento–prodotto.
 *
 * @param {object} intervento — macro_categoria, esigenze_molecolari[], categoria, titolo, …
 * @param {object} prodotto — riga prodotti_mercato o output di normalizzaProdottoMercato()
 * @returns {{ id_prodotto: string, nome_commerciale: string, match_score: number, motivo_suggerimento: string, match_score_db: number, dettaglio: object }}
 */
export function calcolaMatchScore(intervento, prodotto) {
  const prod = prodotto?.nome_commerciale ? prodotto : normalizzaProdottoMercato(prodotto);
  const macroInt = macroIntervento(intervento);
  const macroProd = prod.macro_categoria;

  if (coppiaIncompatibile(macroInt, macroProd)) {
    return {
      id_prodotto: prod.id,
      nome_commerciale: prod.nome_commerciale,
      match_score: 0,
      match_score_db: 0,
      motivo_suggerimento: "Categoria incompatibile con l'intervento",
      dettaglio: { macro_int: macroInt, macro_prod: macroProd, scartato: true },
    };
  }

  let score = 0;
  const categoriaOk = categoriaCombacia(intervento, prod);
  if (categoriaOk) score += PUNTI_CATEGORIA;

  const esigenze = normalizzaEsigenzeMolecolari(intervento.esigenze_molecolari);
  const blobNorm = normalizeText(`${prod.composizione} ${prod.descrizione}`);
  const nomeNorm = normalizeText(prod.nome_commerciale);

  let molHits = 0;
  let titoloHits = 0;
  const molecoleTrovate = [];

  for (const ess of esigenze) {
    if (termineInBlob(ess, blobNorm, nomeNorm)) {
      score += PUNTI_MOLECOLA;
      molHits += 1;
      molecoleTrovate.push(ess);
    } else {
      const tokens = tokenize(ess);
      if (tokens.some((w) => nomeNorm.includes(w))) {
        score += PUNTI_TITOLO;
        titoloHits += 1;
      }
    }
  }

  const motivo_suggerimento = buildMotivoSuggerimento({
    categoriaOk,
    molHits,
    molTotal: esigenze.length,
    titoloHits,
  });

  return {
    id_prodotto: prod.id,
    nome_commerciale: prod.nome_commerciale,
    match_score: score,
    match_score_db: normalizzaMatchScorePerDb(score),
    motivo_suggerimento,
    dettaglio: {
      macro_int: macroInt,
      macro_prod: macroProd,
      categoria_ok: categoriaOk,
      molecole_richieste: esigenze.length,
      molecole_trovate: molecoleTrovate,
      titolo_hits: titoloHits,
    },
  };
}

/** Converte punteggio assoluto in 0–1 per colonna prodotti_mercato_intervento.match_score. */
export function normalizzaMatchScorePerDb(score) {
  if (!score || score <= 0) return 0;
  return Math.min(1, Math.round((score / MAX_SCORE_TEORICO) * 1000) / 1000);
}

/**
 * TOP N prodotti per un intervento, ordinati per match_score decrescente.
 *
 * @param {object} intervento
 * @param {object[]} catalogoRows — righe prodotti_mercato (attive)
 * @param {{ max?: number, minScore?: number }} [opts]
 * @returns {Array<{ id_prodotto, nome_commerciale, match_score, motivo_suggerimento, match_score_db, dettaglio }>}
 */
export function matchProdottiPerIntervento(
  intervento,
  catalogoRows,
  { max = MAX_PRODOTTI_MATCH, minScore = MIN_MATCH_SCORE } = {},
) {
  if (!intervento || !catalogoRows?.length) return [];

  return catalogoRows
    .map((row) => calcolaMatchScore(intervento, row))
    .filter((m) => m.match_score >= minScore)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, max);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {object} intervento
 * @param {object} [opts]
 */
export async function matchProdottiPerInterventoDb(admin, intervento, opts = {}) {
  const { loadProdottiMercatoRows } = await import("./prodottiMercato.mjs");
  const rows = await loadProdottiMercatoRows(admin);
  return matchProdottiPerIntervento(intervento, rows, opts);
}

/**
 * Collegamenti per tabella prodotti_mercato_intervento (batch link script).
 * @param {object} interventoTemplate — riga calendario_base_intervento
 * @param {object[]} mercatoRows
 */
export function linksPerInterventoTemplate(interventoTemplate, mercatoRows, { max = 3 } = {}) {
  const matches = matchProdottiPerIntervento(interventoTemplate, mercatoRows, { max });
  return matches.map((m) => ({
    prodotto_mercato_id: m.id_prodotto,
    calendario_base_intervento_id: interventoTemplate.id,
    match_score: m.match_score_db,
    match_reason: `${m.motivo_suggerimento} (score=${m.match_score})`,
    match_auto: true,
  }));
}
