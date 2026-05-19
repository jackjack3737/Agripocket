/** Regole sicurezza dosi e fitofarmaci (PAN / patentino). */

export const AVVISO_FITOFARMACO =
  "⚠️ Trattamento fitosanitario: non calcoliamo dosi automatiche. Verifica etichetta, normativa PAN e valuta un agronomo o giardiniere qualificato prima di applicare.";

export const AVVISO_MQ_MANCANTI =
  "⚠️ Imposta i m² del prato nel profilo (mappa) per calcolare dosi di concimi e biostimolanti in sicurezza.";

const CATEGORIE_FITOFARMACO = new Set([
  "FUNGICIDA",
  "FUNGICIDA BIO",
  "DISERBANTE SELETTIVO",
  "DISERBANTE",
  "DISERBANTE PRE-EMERGENZA",
  "DISERBANTE PFnPE",
  "INSETTICIDA",
  "INSETTICIDA BIO",
  "INSETTICIDA PFnPE",
]);

/** Fitofarmaci ammessi in app B2C (PFNPO / uso domestico — no PAN professionale). */
const CATEGORIE_FITO_CONSUMER = new Set([
  "FUNGICIDA BIO",
  "DISERBANTE PFnPE",
  "DISERBANTE PRE-EMERGENZA",
  "INSETTICIDA BIO",
  "INSETTICIDA PFnPE",
]);

const INTERVENTI_FITOFARMACO = new Set(["diserbo", "trattamento"]);

export function isProdottoFitofarmaco(prodotto) {
  return CATEGORIE_FITOFARMACO.has(String(prodotto?.categoria || "").toUpperCase());
}

export function isInterventoFitofarmaco(categoriaIntervento) {
  return INTERVENTI_FITOFARMACO.has(String(categoriaIntervento || "").toLowerCase());
}

/** m² dal profilo — nessun fallback per le dosi. */
export function superficieMqVerificata(profilo) {
  const n = Number(profilo?.superficie_mq);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return null;
}

export function puoCalcolareDose(prodotto, profilo) {
  if (isProdottoFitofarmaco(prodotto) || isInterventoFitofarmaco(prodotto?._categoriaIntervento)) {
    return false;
  }
  return superficieMqVerificata(profilo) != null;
}

/** Classificazione legale (DB `categoria_legale` o euristica su `categoria`). */
export function inferCategoriaLegale(prodotto) {
  const db = String(prodotto?.categoria_legale || "").toUpperCase();
  if (db) return db;
  const cat = String(prodotto?.categoria || "").toUpperCase();
  if (
    cat.includes("CONCIME") ||
    cat === "SEMENTI" ||
    cat === "BAGNANTE" ||
    cat === "BIOSTIMOLANTE" ||
    cat === "BIOATTIVATO" ||
    cat === "AMMENDANTE"
  ) {
    return "CONCIME";
  }
  if (CATEGORIE_FITO_CONSUMER.has(cat)) return "PFNPO";
  if (isProdottoFitofarmaco(prodotto)) return "PROFESSIONALE";
  return "ALTRO";
}

/** Esclude fitofarmaci solo uso professionale / patentino. */
export function isProdottoAmmessoConsumer(prodotto) {
  const legale = inferCategoriaLegale(prodotto);
  if (legale === "PROFESSIONALE") return false;
  if (!isProdottoFitofarmaco(prodotto)) return true;
  if (legale === "PFNPO") return true;
  const cat = String(prodotto?.categoria || "").toUpperCase();
  if (CATEGORIE_FITO_CONSUMER.has(cat)) return true;
  const blob = `${prodotto?.nome || ""} ${prodotto?.descrizione || ""} ${prodotto?.composizione || ""}`.toLowerCase();
  if (/pfnp|libera vendita|uso domestico|giardino/.test(blob)) return true;
  if (/professionale|solo patentino|agronom|greenkeeper|stadio|campo da golf/.test(blob)) return false;
  return false;
}

export function filtraProdottiConsumer(pool) {
  return (pool || []).filter(isProdottoAmmessoConsumer);
}

export const AVVISO_PRODOTTO_PROFESSIONALE =
  "Prodotto fitosanitario da uso professionale (PAN): non suggerito in app. Consulta un agronomo o rivenditore abilitato.";
