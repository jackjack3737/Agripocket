/** Avvisi sicurezza (allineati al server). */

export const AVVISO_FITOFARMACO =
  "⚠️ Trattamento fitosanitario: non calcoliamo dosi automatiche. Verifica etichetta, normativa PAN e valuta un agronomo o giardiniere qualificato prima di applicare.";

export const AVVISO_MQ_MANCANTI =
  "⚠️ Imposta i m² del prato nel profilo (mappa) per calcolare dosi di concimi e biostimolanti in sicurezza.";

export const DISCLAIMER_LEGALE = `AgriPocket è uno strumento informativo in fase beta: non sostituisce la diagnosi di un agronomo, le etichette dei prodotti né la normativa sui fitofarmaci (PAN / patentino). Le dosi automatiche riguardano solo concimi e prodotti non fitosanitari, e solo se hai indicato i m² del prato. Per fungicidi, diserbanti e insetticidi mostriamo solo riferimenti di catalogo, senza quantità da applicare. L'uso dei consigli è sotto la tua responsabilità.`;

const FITO_CATEGORIE = new Set(["diserbo", "trattamento"]);

export function isInterventoFitofarmaco(item) {
  const cat = String(item?.categoria || "").toLowerCase();
  if (FITO_CATEGORIE.has(cat)) return true;
  const desc = item?.descrizione || "";
  return desc.includes("fitosanitario") || desc.includes("non calcoliamo dosi automatiche");
}

export function superficieMqVerificata(profilo) {
  const n = Number(profilo?.superficie_mq);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return null;
}
