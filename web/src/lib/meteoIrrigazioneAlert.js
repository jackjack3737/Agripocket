/**
 * Confronto meteo attuale vs ultimo calcolo irrigazione → alert in stato clinico.
 */

/** @param {object|null} weather */
export function estraiSnapshotMeteo(weather) {
  if (!weather) return null;
  const ag = weather.agronomic;
  const rows = ag?.forecast_daily || ag?.gdd?.serie || [];
  const oggi = new Date().toISOString().slice(0, 10);

  let precipOggi = 0;
  let precip3g = 0;
  for (let i = 0; i < rows.length; i++) {
    const mm = Number(rows[i]?.rain_mm ?? rows[i]?.rainMm ?? rows[i]?.precipitation_sum ?? 0);
    if (i < 3) precip3g += mm;
    if (rows[i]?.date === oggi) precipOggi = mm;
  }

  const main = weather.current?.weather?.[0]?.main;
  const pioggia_in_corso =
    main === "Rain" || main === "Drizzle" || main === "Thunderstorm";

  return {
    et0_mm: ag?.et0_mm_oggi ?? ag?.et0_mm_media_7g ?? null,
    precip_oggi_mm: precipOggi,
    precip_prossimi_3gg_mm: Math.round(precip3g * 10) / 10,
    pioggia_in_corso,
    et0_media_7g: ag?.et0_mm_media_7g ?? null,
    temp_c: weather.current?.main?.temp ?? null,
  };
}

/** @param {object|null} irrigazionePayload risultato API / cache */
export function estraiSnapshotDaIrrigazione(irrigazionePayload) {
  if (!irrigazionePayload) return null;
  if (irrigazionePayload.meteo_snapshot) return irrigazionePayload.meteo_snapshot;
  const m = irrigazionePayload.meteo;
  if (!m) return null;
  return {
    et0_mm: m.et0_mm,
    precip_oggi_mm: m.precip_oggi_mm ?? 0,
    precip_prossimi_3gg_mm: null,
    pioggia_in_corso: !!m.pioggia_in_corso,
    et0_media_7g: null,
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deltaSignificativo(vecchio, nuovo, sogliaAssoluta, sogliaPct = 0.2) {
  const a = num(vecchio);
  const b = num(nuovo);
  if (a == null || b == null) return false;
  const d = Math.abs(b - a);
  if (d >= sogliaAssoluta) return true;
  if (a > 0.5 && d / a >= sogliaPct) return true;
  return false;
}

/**
 * @param {{ weather?: object, irrigazioneUltima?: object, irrigazioneProfilo?: object }} opts
 */
export function valutaAlertMeteoIrrigazione({
  weather,
  irrigazioneUltima,
  irrigazioneProfilo,
} = {}) {
  if (!weather) return null;

  const ultimo = irrigazioneUltima || irrigazioneProfilo;
  const vecchio = estraiSnapshotDaIrrigazione(ultimo);
  const nuovo = estraiSnapshotMeteo(weather);

  if (!nuovo) return null;

  const calcolatoIl = ultimo?.calcolato_il || ultimo?.data_consiglio || null;
  const oreDaCalcolo = calcolatoIl
    ? (Date.now() - new Date(calcolatoIl).getTime()) / 3600000
    : null;

  if (!vecchio) {
    if (ultimo?.azione_irrigazione) return null;
    return null;
  }

  const motivi = [];

  if (deltaSignificativo(vecchio.et0_mm, nuovo.et0_mm, 1, 0.18)) {
    motivi.push(
      `ET0 ${vecchio.et0_mm ?? "—"} → ${nuovo.et0_mm ?? "—"} mm/g: fabbisogno idrico diverso.`,
    );
  }

  if (deltaSignificativo(vecchio.precip_prossimi_3gg_mm, nuovo.precip_prossimi_3gg_mm, 4, 0.35)) {
    motivi.push(
      `Pioggia prevista nei prossimi giorni aggiornata (${vecchio.precip_prossimi_3gg_mm ?? 0} → ${nuovo.precip_prossimi_3gg_mm ?? 0} mm).`,
    );
  }

  const pioggiaOggiVecchia = (vecchio.precip_oggi_mm ?? 0) >= 5;
  const pioggiaOggiNuova = (nuovo.precip_oggi_mm ?? 0) >= 5;
  if (pioggiaOggiVecchia !== pioggiaOggiNuova) {
    motivi.push(
      pioggiaOggiNuova
        ? "Oggi è prevista pioggia utile: valuta di spegnere o ridurre la centralina."
        : "La pioggia prevista per oggi è diminuita: potrebbe servire più irrigazione.",
    );
  }

  if (Boolean(vecchio.pioggia_in_corso) !== Boolean(nuovo.pioggia_in_corso)) {
    motivi.push(
      nuovo.pioggia_in_corso
        ? "Pioggia in corso ora: non era prevista all'ultimo calcolo."
        : "La pioggia è cessata rispetto all'ultimo calcolo.",
    );
  }

  const cambioModerato = motivi.length > 0;
  const cambioLieve =
    !cambioModerato &&
    oreDaCalcolo != null &&
    oreDaCalcolo >= 8 &&
    (deltaSignificativo(vecchio.et0_mm, nuovo.et0_mm, 0.5, 0.12) ||
      deltaSignificativo(vecchio.precip_prossimi_3gg_mm, nuovo.precip_prossimi_3gg_mm, 2, 0.25));

  if (!cambioModerato && !cambioLieve) return null;

  return {
    livello: cambioModerato ? "attenzione" : "info",
    motivi,
    ore_da_calcolo: oreDaCalcolo != null ? Math.round(oreDaCalcolo) : null,
    consiglia_irrigazione: true,
    consiglia_programma: cambioModerato,
  };
}
