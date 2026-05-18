/** Avvisi sicurezza (allineati al server). */

export const AVVISO_FITOFARMACO =
  "⚠️ Trattamento fitosanitario: non calcoliamo dosi automatiche. Verifica etichetta, normativa PAN e valuta un agronomo o giardiniere qualificato prima di applicare.";

export const AVVISO_MQ_MANCANTI =
  "⚠️ Imposta i m² del prato nel profilo (mappa) per calcolare dosi di concimi e biostimolanti in sicurezza.";

export const DISCLAIMER_LEGALE = `AgriPocket è uno strumento informativo in fase beta: non sostituisce la diagnosi di un agronomo abilitato, le etichette dei prodotti né la normativa sui fitofarmaci (D.Lgs. 150/2012 — PAN / patentino).

Le dosi automatiche riguardano solo concimi e biostimolanti non fitosanitari, e solo se hai indicato i m² del prato sulla mappa (nessun valore presunto).

Per fungicidi, diserbanti e insetticidi mostriamo solo riferimenti di catalogo a uso domestico (PFNPO), senza quantità da applicare. Non acquistare né applicare prodotti professionali senza patentino.

Le foto del giardino possono essere conservate per l'analisi. L'uso dei consigli è sotto la tua esclusiva responsabilità.`;

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
