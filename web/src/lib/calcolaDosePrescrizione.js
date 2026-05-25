/**
 * Calcolo dose prescrizionale per m² (ex Farmacia → Calendario Dispensa).
 */

import { parseMqInput } from "./parseMq.js";

/** Dose indicative g/m² o ml/m² quando il catalogo non ha dosaggio_standard_mq. */
const DOSE_RIFERIMENTO_MACRO = {
  K: { dose_mq: 30, unita: "g" },
  N: { dose_mq: 20, unita: "g" },
  P: { dose_mq: 25, unita: "g" },
  Biostimolante: { dose_mq: 2.5, unita: "g" },
  Correttivo: { dose_mq: 40, unita: "g" },
  Bagnante: { dose_mq: 1, unita: "ml" },
  Altro: { dose_mq: 25, unita: "g" },
};

export function mqUtente(userMq) {
  if (userMq == null || userMq === "") return null;
  const parsed = typeof userMq === "number" ? userMq : parseMqInput(userMq);
  if (parsed != null && parsed > 0) return Math.round(parsed);
  const n = Number(userMq);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return null;
}

export function doseMqDaMacro(macro) {
  const key = String(macro || "").trim();
  if (!key) return null;
  return DOSE_RIFERIMENTO_MACRO[key] ?? DOSE_RIFERIMENTO_MACRO.Altro;
}

export function calcolaDoseFarmacia(prodotto, userMq) {
  const mq = Math.max(1, mqUtente(userMq) ?? 150);
  const doseMq = Number(prodotto.dose_mq) || 0;
  const formato = Math.max(1, Number(prodotto.formato_vendita) || 1);
  const fabbisogno_totale = doseMq * mq;
  const confezioni_suggerite = Math.ceil(fabbisogno_totale / formato);
  const unita = (prodotto.unita_misura || "g").toLowerCase();

  let quantitaLabel;
  if (unita === "g" && fabbisogno_totale >= 1000) {
    const kg = fabbisogno_totale / 1000;
    quantitaLabel = `${kg % 1 === 0 ? kg : kg.toFixed(1)} kg`;
  } else if (unita === "ml" && fabbisogno_totale >= 1000) {
    const l = fabbisogno_totale / 1000;
    quantitaLabel = `${l % 1 === 0 ? l : l.toFixed(1)} L`;
  } else {
    quantitaLabel = `${Math.round(fabbisogno_totale)} ${unita}`;
  }

  const confezioneLabel =
    confezioni_suggerite === 1 ? "1 confezione" : `${confezioni_suggerite} confezioni`;

  return {
    fabbisogno_totale,
    confezioni_suggerite,
    quantitaLabel,
    confezioneLabel,
    unita,
    testoRiga: `Per i tuoi ${mq} m² servono ${quantitaLabel}. Solum consiglia ${confezioneLabel}.`,
  };
}

function parseNumeroIt(s) {
  if (s == null || s === "") return 0;
  const m = String(s).match(/([\d]+(?:[.,]\d+)?)/);
  if (!m) return 0;
  return parseFloat(m[1].replace(",", "."));
}

/** Estrae dose/m² da payload API o testi tipo "30 g/m²". */
export function estraiDoseMq(prodotto) {
  const diretta = Number(prodotto?.dose_mq);
  if (diretta > 0) return diretta;

  const std = Number(prodotto?.dosaggio_standard_mq);
  if (std > 0) return std;

  const perMq = prodotto?.dose_per_mq;
  if (typeof perMq === "number" && perMq > 0) return perMq;
  if (typeof perMq === "string") {
    const n = parseNumeroIt(perMq);
    if (n > 0) return n;
  }

  const ref = doseMqDaMacro(prodotto?.macro_categoria);
  return ref?.dose_mq > 0 ? ref.dose_mq : 0;
}

export function unitaProdotto(prodotto) {
  const u = (prodotto?.unita_misura || "").toLowerCase();
  if (u === "g" || u === "ml" || u === "kg" || u === "l") return u === "l" ? "ml" : u;
  const ref = doseMqDaMacro(prodotto?.macro_categoria);
  return ref?.unita || "g";
}

function formatoConfezioneDefault(prodotto, unita) {
  const f = Number(prodotto?.formato_vendita);
  if (f > 0) return f;
  return unita === "ml" ? 1000 : 10000;
}

export function linkAcquistoProdotto(prodotto) {
  return (
    prodotto?.link_partner ||
    prodotto?.url_acquisto ||
    prodotto?.link_acquisto ||
    prodotto?.url_shop ||
    null
  );
}

/**
 * Testo UI prescrizione Solum + metadati per CTA.
 * @returns {{ testo: string, confezioni: number|null, link: string|null, haCalcolo: boolean }}
 */
export function prescrizioneDoseUI(prodotto, userMq) {
  const mq = mqUtente(userMq);
  const link = linkAcquistoProdotto(prodotto);

  if (!mq) {
    return {
      testo: "📐 Imposta i m² del prato nel profilo (mappa o onboarding) per calcolare kg e confezioni.",
      confezioni: null,
      link,
      haCalcolo: false,
    };
  }

  const doseMq = estraiDoseMq(prodotto);
  const unita = unitaProdotto(prodotto);
  const haDoseCatalogo =
    Number(prodotto?.dose_mq) > 0 ||
    Number(prodotto?.dosaggio_standard_mq) > 0 ||
    (typeof prodotto?.dose_per_mq === "string" && parseNumeroIt(prodotto.dose_per_mq) > 0) ||
    (typeof prodotto?.dose_per_mq === "number" && prodotto.dose_per_mq > 0);
  const usaRiferimento = !haDoseCatalogo && doseMq > 0;

  if (doseMq > 0) {
    const formato = formatoConfezioneDefault(prodotto, unita);
    const calc = calcolaDoseFarmacia(
      { dose_mq: doseMq, formato_vendita: formato, unita_misura: unita },
      mq,
    );
    const conf =
      calc.confezioni_suggerite === 1
        ? "1 confezione"
        : `${calc.confezioni_suggerite} confezioni`;
    const notaRif = usaRiferimento
      ? ` (stima ~${doseMq} ${unita}/m² per questo tipo di trattamento; verifica in etichetta)`
      : "";
    return {
      testo: `📐 Per i tuoi ${mq} m²: servono ${calc.quantitaLabel}.${notaRif} Solum consiglia ${conf}.`,
      confezioni: calc.confezioni_suggerite,
      link,
      haCalcolo: true,
    };
  }

  if (prodotto?.dose_totale_calcolata) {
    const testoLegacy = String(prodotto.dose_totale_calcolata);
    if (!/imposta i m²/i.test(testoLegacy)) {
      return {
        testo: `📐 Per i tuoi ${mq} m²: ${testoLegacy}`,
        confezioni: null,
        link,
        haCalcolo: true,
      };
    }
  }

  return {
    testo: "📐 Dose non disponibile per questo prodotto: chiedi in garden center citando il nome sopra.",
    confezioni: null,
    link,
    haCalcolo: false,
  };
}
