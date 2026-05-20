/**
 * Color-matching sementi da vision.colore_dominante.
 */

const COLORI_OK = new Set([
  "verde_scuro",
  "verde_chiaro",
  "verde_brillante",
  "ingiallito_non_valutabile",
]);

const NOTA_MATCH =
  "Semente selezionata per match cromatico con il tuo prato attuale per evitare discromie.";

const SEMENTI_SCURO =
  /royal\s*blue\s*plus|royal\s*strong\s*plus|royal\s*strong|royal\s*shade\s*plus|strong\s*plus|blue\s*plus|scuro|dark|turf\s*dark/i;

const SEMENTI_CHIARO =
  /loietto|paco|trivialis|supina|maciste|chiaro|park|blend|shade(?!\s*plus)|royal\s*park|royal\s*blend/i;

const SEMENTI_BRILLANTE =
  /royal\s*sport|royal\s*golf|royal\s*sea|summer\s*k|super\s*turf|brillant|bright|golf\s*plus|regreen|verde\s*brill/i;

export function normalizzaColoreDominante(raw) {
  const v = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (COLORI_OK.has(v)) return v;
  if (/scuro|dark/.test(v)) return "verde_scuro";
  if (/chiaro|chiara|chiare/.test(v)) return "verde_chiaro";
  if (/brillant|bright|intenso/.test(v)) return "verde_brillante";
  if (/ingiall|giall|cloros|stress/.test(v)) return "ingiallito_non_valutabile";
  return null;
}

export function scoreMatchCromaticoSemente(prodotto, coloreDominante) {
  const colore = normalizzaColoreDominante(coloreDominante);
  if (!colore || colore === "ingiallito_non_valutabile") return 0;

  const nome = String(prodotto?.nome || "").toLowerCase();
  if (colore === "verde_scuro") {
    if (SEMENTI_SCURO.test(nome)) return 30;
    if (SEMENTI_BRILLANTE.test(nome)) return -15;
    return 0;
  }
  if (colore === "verde_chiaro" || colore === "verde_brillante") {
    if (SEMENTI_CHIARO.test(nome)) return 28;
    if (SEMENTI_BRILLANTE.test(nome)) return colore === "verde_brillante" ? 26 : 12;
    if (SEMENTI_SCURO.test(nome)) return -18;
    return 0;
  }
  return 0;
}

export function filtraPoolSementiPerColore(pool, vision) {
  const colore = normalizzaColoreDominante(vision?.colore_dominante);
  if (!colore || colore === "ingiallito_non_valutabile") return pool;

  const ranked = pool
    .map((p) => ({ p, s: scoreMatchCromaticoSemente(p, colore) }))
    .sort((a, b) => b.s - a.s);

  const top = ranked.filter((r) => r.s > 0).map((r) => r.p);
  return top.length ? top : pool;
}

export function appendNotaMatchCromatico(descrizione, vision, categoriaIntervento) {
  if (String(categoriaIntervento || "").toLowerCase() !== "rinnovo") return descrizione;
  const colore = normalizzaColoreDominante(vision?.colore_dominante);
  if (!colore || colore === "ingiallito_non_valutabile") return descrizione;
  const base = String(descrizione || "").trim();
  if (base.includes("match cromatico")) return base;
  return [base, NOTA_MATCH].filter(Boolean).join(" ").slice(0, 900);
}

export { NOTA_MATCH };
