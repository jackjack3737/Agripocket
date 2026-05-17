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
