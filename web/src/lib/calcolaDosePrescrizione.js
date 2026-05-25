/**
 * Calcolo dose prescrizionale per m² (ex Farmacia → Calendario Dispensa).
 */

export function calcolaDoseFarmacia(prodotto, userMq) {
  const mq = Math.max(1, Number(userMq) || 150);
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

/** Estrae dose/m² da payload API (dose_mq, dose_per_mq, dosaggio_standard_mq). */
export function estraiDoseMq(prodotto) {
  const diretta = Number(prodotto?.dose_mq);
  if (diretta > 0) return diretta;

  const std = Number(prodotto?.dosaggio_standard_mq);
  if (std > 0) return std;

  const perMq = prodotto?.dose_per_mq;
  if (typeof perMq === "number" && perMq > 0) return perMq;
  if (typeof perMq === "string") {
    const m = perMq.match(/([\d.,]+)/);
    if (m) return parseFloat(m[1].replace(",", "."));
  }
  return 0;
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
  const mq = Math.max(1, Number(userMq) || 150);
  const doseMq = estraiDoseMq(prodotto);
  const unita = (prodotto?.unita_misura || "g").toLowerCase();
  const formato = Number(prodotto?.formato_vendita) || 0;
  const link = linkAcquistoProdotto(prodotto);

  if (doseMq > 0 && formato > 0) {
    const calc = calcolaDoseFarmacia(
      { dose_mq: doseMq, formato_vendita: formato, unita_misura: unita },
      mq,
    );
    const conf =
      calc.confezioni_suggerite === 1
        ? "1 confezione"
        : `${calc.confezioni_suggerite} confezioni`;
    return {
      testo: `📐 Per i tuoi ${mq} m²: servono ${calc.quantitaLabel}. Solum consiglia ${conf}.`,
      confezioni: calc.confezioni_suggerite,
      link,
      haCalcolo: true,
    };
  }

  if (doseMq > 0) {
    const calc = calcolaDoseFarmacia(
      { dose_mq: doseMq, formato_vendita: doseMq * mq, unita_misura: unita },
      mq,
    );
    return {
      testo: `📐 Per i tuoi ${mq} m²: servono ${calc.quantitaLabel}.`,
      confezioni: null,
      link,
      haCalcolo: true,
    };
  }

  if (prodotto?.dose_totale_calcolata) {
    return {
      testo: `📐 Per i tuoi ${mq} m²: ${prodotto.dose_totale_calcolata}`,
      confezioni: null,
      link,
      haCalcolo: true,
    };
  }

  return {
    testo: "📐 Imposta i m² del prato nel profilo per calcolare la dose su misura.",
    confezioni: null,
    link,
    haCalcolo: false,
  };
}
