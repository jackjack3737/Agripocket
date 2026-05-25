/**
 * Calcolo dose prescrizionale per m² utente.
 * @param {{ dose_mq: number, formato_vendita: number, unita_misura?: string }} prodotto
 * @param {number} userMq
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
    testoRiga: `Per i tuoi ${mq} m² servono ${quantitaLabel}. Consigliato: acquistare ${confezioneLabel}.`,
  };
}
