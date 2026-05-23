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

export const AVVISO_PRINCIPIO_ATTIVO_PROFESSIONALE =
  "Per questo problema servono fitofarmaci da uso professionale (patentino). Ti indichiamo il principio attivo da citare in garden center o da un agronomo abilitato — senza dosaggio automatico.";

export function isProfiloUsoConsumer(profilo) {
  const uso = String(profilo?.uso || "giardino").toLowerCase();
  return uso === "giardino" || uso === "ornamentale";
}

export function isProdottoPFNPO(prodotto) {
  const legale = String(prodotto?.categoria_legale || inferCategoriaLegale(prodotto)).toUpperCase();
  if (legale === "PFNPO") return true;
  const cat = String(prodotto?.categoria || "").toUpperCase();
  if (
    cat.includes("PFNPO") ||
    cat.includes("PFnPE") ||
    cat === "FUNGICIDA BIO" ||
    cat === "INSETTICIDA BIO" ||
    cat === "DISERBANTE PRE-EMERGENZA" ||
    cat === "DISERBANTE PFnPE" ||
    cat === "INSETTICIDA PFnPE"
  ) {
    return true;
  }
  const blob = `${prodotto?.nome || ""} ${prodotto?.descrizione || ""} ${prodotto?.composizione || ""}`.toLowerCase();
  return /pfnp|pfnpe|libera vendita|uso domestico|piante ornamentali/.test(blob);
}

export function estraiPrincipioAttivo(prodotto) {
  const comp = String(prodotto?.composizione || prodotto?.descrizione || "").trim();
  if (!comp) return null;
  const m = comp.match(/([A-Za-zÀ-ÿ][\w\-àèéìòù]+(?:\s+[A-Za-zÀ-ÿ][\w\-àèéìòù]+){0,3})\s*[\d,.]+\s*%/);
  if (m) return m[1].trim();
  const short = comp.split(/[,;]/)[0]?.trim();
  return short && short.length >= 4 && short.length <= 80 ? short : null;
}

export function messaggioPrincipioAttivoProfessionale(prodotto, problema) {
  const pa = estraiPrincipioAttivo(prodotto) || "principio attivo idoneo alla patologia";
  const prob = problema ? ` per «${problema}»` : "";
  return `${AVVISO_PRINCIPIO_ATTIVO_PROFESSIONALE} Principio attivo di riferimento${prob}: ${pa}. Rivolgiti a un garden center o agronomo abilitato.`;
}

export function filtraProdottiConsumerStrict(pool, profilo) {
  const list = pool || [];
  if (!isProfiloUsoConsumer(profilo)) return list;
  return list.filter((p) => {
    if (!isProdottoFitofarmaco(p)) return true;
    return isProdottoPFNPO(p) && isProdottoAmmessoConsumer(p);
  });
}
