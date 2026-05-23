/**
 * Fitofarmaci curativi (fungicidi, insetticidi, diserbi post-emergenza)
 * solo con evidenza da foto o problemi dichiarati nel profilo.
 * Antigerminanti (pre-emergenza) ammessi nel calendario stagionale.
 */

import { PREFERENZA_BOTTOS_FITO } from "./bottosFitofarmaci.mjs";
import {
  isProfiloUsoConsumer,
  filtraProdottiConsumerStrict,
  messaggioPrincipioAttivoProfessionale,
} from "./sicurezzaProdotti.mjs";

export { isProfiloUsoConsumer, filtraProdottiConsumerStrict, messaggioPrincipioAttivoProfessionale };

const PROBLEMI_FITO = new Set(["funghi", "larve_parassiti", "erbacee", "muschio"]);

/** Visione foto con difetti che giustificano trattamenti curativi. */
export function visioneMostraDifetti(vision) {
  if (!vision || typeof vision !== "object") return false;

  const stato = String(vision.stato_generale || "").toLowerCase();
  if (stato === "critico" || stato === "discreto") return true;

  const prob = vision.problemi_rilevati || [];
  if (prob.some((p) => ["alta", "media"].includes(String(p?.gravita || "").toLowerCase()))) return true;

  if (Array.isArray(vision.malattie_sospette) && vision.malattie_sospette.length > 0) return true;

  const par = vision.parassiti_sottoprato || [];
  if (
    par.some((p) => {
      if (typeof p === "string") return p.trim().length > 2;
      const g = String(p?.gravita || "").toLowerCase();
      return g === "alta" || g === "media" || (p?.segni && String(p.segni).trim().length > 3);
    })
  ) {
    return true;
  }

  if (vision.feltro_thatch?.presente) return true;
  if (vision.stress_idrici?.segni && String(vision.sintesi_visiva || "").match(/fungh|marcium|patogen|larv|parassit|erbace|infest/i)) {
    return true;
  }

  const sintesi = String(vision.sintesi_visiva || "");
  if (
    /fungh|marcium|oidio|patogen|larv[eoa]|popillia|maggiolino|otiorrinco|infest|erbace|diserb|tarassac|trifoglio/i.test(
      sintesi,
    )
  ) {
    return true;
  }

  return false;
}

export function profiloGiustificaFitofarmaco(profilo) {
  const prob = profilo?.problemi_noti;
  if (!Array.isArray(prob)) return false;
  return prob.some((k) => PROBLEMI_FITO.has(k));
}

export function haEvidenzaFitofarmaco({ vision, profilo } = {}) {
  return visioneMostraDifetti(vision) || profiloGiustificaFitofarmaco(profilo);
}

/** Pre-emergenza / antigerminanti annuali: sempre ammessi nel piano stagionale. */
export function isDiserboPreEmergenzaIntervento(intervento) {
  if (String(intervento?.categoria || "").toLowerCase() !== "diserbo") return false;
  const blob = `${intervento.titolo || ""} ${intervento.descrizione || ""}`.toLowerCase();
  return /pre.?emerg|antigermin|setaria|digitaria|panico|annualit|prima della germin/i.test(blob);
}

export function isInterventoFitofarmacoCurativo(intervento) {
  const cat = String(intervento?.categoria || "").toLowerCase();
  if (cat === "trattamento") return true;
  if (cat === "diserbo" && !isDiserboPreEmergenzaIntervento(intervento)) return true;
  return false;
}

/** Rimuove fungicidi/insetticidi/post-emergenza se non c'è evidenza foto/profilo. */
export function filtraInterventiFitofarmacoCurativo(interventi, opts = {}) {
  if (haEvidenzaFitofarmaco(opts)) return interventi;

  return interventi.filter((i) => {
    if (!isInterventoFitofarmacoCurativo(i)) return true;
    if (isDiserboPreEmergenzaIntervento(i)) return true;
    return false;
  });
}

/** Esclude fungicidi/insetticidi dall'integrazione automatica catalogo. */
export function catalogoAmmessoSenzaFoto(prodotto) {
  const cat = String(prodotto?.categoria || "").toUpperCase();
  if (/^FUNGICIDA/.test(cat) || /^INSETTICIDA/.test(cat)) return false;
  if (cat === "DISERBANTE" || cat === "DISERBANTE SELETTIVO") return false;
  if (cat === "DISERBANTE PRE-EMERGENZA" || cat === "DISERBANTE PFnPE") return true;
  return true;
}

/** Pool catalogo ammesso in base al profilo (consumer = solo PFNPO). */
export function poolProdottiPerProfiloFitofarmaci(prodotti, profilo) {
  return filtraProdottiConsumerStrict(prodotti, profilo);
}

export const REGOLE_FITOFARMACI_PROMPT = `REGOLE FITOFARMACI (obbligatorie):
- NON inserire fungicidi, insetticidi né diserbi post-emergenza preventivi nel calendario senza evidenza (foto o problemi dichiarati).
- Inserisci trattamenti curativi (categoria trattamento) SOLO se malattie, parassiti, danni visibili o problemi dichiarati (funghi, larve, erbacce gravi).
- Sono SEMPRE ammessi: diserbi PRE-EMERGENZA / antigerminanti (es. setaria, digitaria) nelle finestre meteo.
- ${PREFERENZA_BOTTOS_FITO}
- Preferisci anche concimi, ferro, biostimolanti, taglio, irrigazione, arieggiatura e rinnovo ombra da mappa.`;
