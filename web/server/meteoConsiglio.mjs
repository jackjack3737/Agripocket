/** Testi utente quando il consiglio usa dati meteo reali. */

const GIORNI_BREVI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export function meteoDisponibilePerCalcolo(weatherBundle) {
  if (!weatherBundle) return false;
  const ag = weatherBundle.agronomic || weatherBundle.meteo_agronomico;
  if (ag?.et0_mm_oggi != null || ag?.et0_mm_media_7g != null) return true;
  if (ag?.forecast_daily?.length) return true;
  if (weatherBundle.current?.main?.temp != null) return true;
  return false;
}

/**
 * Badge + frase per TreatmentCard / dettaglio trattamento.
 */
export function buildNotaMeteoTrattamento(meteoCtx, weatherBundle, profilo) {
  if (!meteoDisponibilePerCalcolo(weatherBundle)) return null;

  const parti = [];
  const luogo = profilo?.localita?.trim() || weatherBundle?.geo?.name || "la tua zona";
  parti.push(`Consiglio calibrato con il meteo di ${luogo}.`);

  const dettagli = [];
  if (meteoCtx?.stagione) dettagli.push(`stagione ${meteoCtx.stagione}`);
  if (meteoCtx?.et0 != null) dettagli.push(`evaporazione ~${meteoCtx.et0} mm/g`);
  if (meteoCtx?.tSuolo != null) dettagli.push(`suolo ~${Math.round(meteoCtx.tSuolo)} °C`);
  if (meteoCtx?.gdd30 != null) dettagli.push(`gradi giorno cumulati (30 gg) ${Math.round(meteoCtx.gdd30)}`);
  if (meteoCtx?.umiditaAlta) dettagli.push("umidità elevata (attenzione funghi)");

  if (dettagli.length) {
    parti.push(`Nel calcolo abbiamo considerato: ${dettagli.join(", ")}.`);
  }

  parti.push(
    "Se il giorno dell'intervento piove forte o fa caldo estremo, valuta di spostare di 1–2 giorni.",
  );

  return parti.join(" ").slice(0, 520);
}

export { GIORNI_BREVI };
