/**
 * Motore predittivo agronomico: rischio fungino (finestra umido-caldo) e ET0 semplificata.
 *
 * Integrazione meteo:
 * - `fetchWeatherBundle` (weatherCore.mjs) fornisce `current` (OpenWeather o Open-Meteo)
 *   e `history.rows` (ultimi 14 gg da Open-Meteo archive: tMin, tMax, pioggia).
 * - OpenWeather 2.5 /weather non espone radiazione solare: stimiamo Ra (MJ/m²/d) con
 *   latitudine + giorno dell'anno (Hargreaves) oppure proxy da weather_code Open-Meteo.
 * - Per il rischio fungo servono previsioni: passare `meteoPrevisione` come array giornaliero
 *   (es. da Open-Meteo forecast API) con tMin e umidità relativa max.
 */

const PATTERN_OK = new Set(["circolare", "irregolare", "diffuso", "lineare", "nessuno"]);

/** Normalizza righe giornaliere da history Open-Meteo o previsioni custom. */
export function normalizzaGiornoMeteo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tMin = raw.tMin ?? raw.temperature_min ?? raw.temp_min ?? raw.main?.temp_min;
  const tMax = raw.tMax ?? raw.temperature_max ?? raw.temp_max ?? raw.main?.temp_max ?? raw.main?.temp;
  const humidity =
    raw.humidity ??
    raw.humidity_max ??
    raw.relative_humidity_2m_max ??
    raw.relative_humidity_2m ??
    raw.main?.humidity;
  const wind =
    raw.windSpeedMs ??
    raw.wind_speed_10m ??
    (raw.wind?.speed != null ? raw.wind.speed * 3.6 : null);
  const rainMm = raw.rainMm ?? raw.precipitation_sum ?? raw.rain?.["1h"];
  const code = raw.weather_code ?? raw.weather?.[0]?.id;
  if (tMin == null && tMax == null && humidity == null) return null;
  return {
    date: raw.date ?? raw.dt_txt?.slice?.(0, 10),
    tMin: tMin != null ? Number(tMin) : null,
    tMax: tMax != null ? Number(tMax) : null,
    humidity: humidity != null ? Number(humidity) : null,
    windSpeedMs: wind != null ? Number(wind) : null,
    rainMm: rainMm != null ? Number(rainMm) : 0,
    weather_code: code,
  };
}

/** Estrae array giorni da bundle weatherCore o da lista previsioni. */
export function giorniDaPrevisione(meteoPrevisione) {
  if (!meteoPrevisione) return [];
  if (Array.isArray(meteoPrevisione)) {
    return meteoPrevisione.map(normalizzaGiornoMeteo).filter(Boolean);
  }
  if (Array.isArray(meteoPrevisione?.daily)) {
    return meteoPrevisione.daily.map(normalizzaGiornoMeteo).filter(Boolean);
  }
  return [];
}

/** Ultimo giorno storico dal bundle (meteo «ieri»). */
export function meteoIeriDaBundle(bundle) {
  if (!bundle) return null;
  const last = bundle.history?.rows?.slice(-1)?.[0];
  const cur = bundle.current;
  if (!last && !cur) return null;
  return normalizzaGiornoMeteo({
    date: last?.date,
    tMin: last?.tMin,
    tMax: last?.tMax,
    humidity: cur?.main?.humidity,
    windSpeedMs: cur?.wind?.speed ?? null,
    rainMm: last?.rainMm,
    weather_code: cur?.weather?.[0]?.main === "Clear" ? 0 : 2,
  });
}

function dayOfYear(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

/** Radiazione extraterrestre Ra [MJ/m²/giorno] — approssimazione per Hargreaves. */
export function radiazioneExtraterrestre(latitudine, data = new Date()) {
  const phi = (latitudine * Math.PI) / 180;
  const j = dayOfYear(data);
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * j) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * j) / 365 - 1.39);
  const tanPhiTanDelta = Math.tan(phi) * Math.tan(delta);
  const omega = Math.acos(Math.max(-1, Math.min(1, -tanPhiTanDelta)));
  return (
    ((24 * 60) / Math.PI) *
    0.082 *
    dr *
    (omega * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(omega))
  );
}

/** Proxy radiazione da weather_code WMO (0=sereno → ~22 MJ, coperto → ~12). */
function radiazioneDaCodiceMeteo(code) {
  if (code == null) return 18;
  const c = Number(code);
  if (c === 0 || c === 1) return 22;
  if (c === 2) return 18;
  if (c === 3) return 12;
  if (c >= 61) return 8;
  return 15;
}

/**
 * ET0 semplificata (Hargreaves-Samani) in mm/giorno ≈ acqua persa dal tappeto.
 * @param {object} meteoIeri - output di meteoIeriDaBundle o { tMax, tMin, humidity, windSpeedMs, lat?, weather_code? }
 */
export function calcolaDeficitIdrico(meteoIeri, opts = {}) {
  const g = normalizzaGiornoMeteo(meteoIeri);
  if (!g || g.tMax == null) {
    return {
      et0_mm: null,
      acqua_persa_mm: null,
      metodo: "hargreaves",
      note: "Dati termici insufficienti per ET0.",
    };
  }

  const tMax = g.tMax;
  const tMin = g.tMin ?? tMax - 8;
  const lat = opts.latitudine ?? opts.lat ?? 45;
  const Ra =
    opts.radiazioneMj ??
    (g.weather_code != null
      ? radiazioneDaCodiceMeteo(g.weather_code)
      : radiazioneExtraterrestre(lat));

  let et0 = 0.0023 * Ra * (tMax + 17.8) * Math.sqrt(Math.max(0.5, tMax - tMin));

  const wind = g.windSpeedMs ?? 2;
  et0 *= 1 + 0.04 * Math.max(0, wind - 2);

  const rh = g.humidity ?? 60;
  if (rh > 85) et0 *= 0.88;
  else if (rh > 70) et0 *= 0.94;

  if (g.rainMm >= 5) et0 *= 0.75;

  const mm = Math.round(et0 * 100) / 100;

  return {
    et0_mm: mm,
    acqua_persa_mm: mm,
    deficit_idrico_mm: mm,
    metodo: "hargreaves_samani_simplified",
    input: { tMax, tMin, humidity: rh, wind_ms: wind, Ra_MJ: Math.round(Ra * 100) / 100 },
    note:
      mm >= 5
        ? `Evapotraspirazione stimata ${mm} mm/giorno: irrigare se assenza pioggia.`
        : `ET0 bassa (${mm} mm/g): fabbisogno idrico limitato.`,
  };
}

/**
 * Rischio fungino da finestra notturna umida e calda (Pythium / stress da ritenzione fogliare).
 * @param {object|null} meteoStorico - bundle.history o { rows: [...] }
 * @param {object[]|object|null} meteoPrevisione - prossimi 3-7 giorni con tMin e humidity
 */
export function calcolaRischioFungo(meteoStorico, meteoPrevisione) {
  const storicoRows =
    meteoStorico?.rows ??
    (Array.isArray(meteoStorico) ? meteoStorico : []).map(normalizzaGiornoMeteo).filter(Boolean);
  const previsioni = giorniDaPrevisione(meteoPrevisione);

  const giorni = [...storicoRows.slice(-3), ...previsioni].filter(
    (g) => g.tMin != null || g.humidity != null,
  );

  if (!giorni.length) {
    return {
      rischio: "non_valutabile",
      patologia_probabile: null,
      giorni_consecutivi_critici: 0,
      note: "Servono previsioni con temperatura minima e umidità (Open-Meteo forecast o bundle esteso).",
    };
  }

  let consecutive = 0;
  let maxConsecutive = 0;
  const critici = [];

  for (const g of giorni) {
    const tMin = g.tMin ?? 99;
    const u = g.humidity ?? 0;
    const notteCaldaUmida = tMin > 20 && u > 80;
    if (notteCaldaUmida) {
      consecutive += 1;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
      critici.push(g.date || "?");
    } else {
      consecutive = 0;
    }
  }

  if (maxConsecutive >= 2) {
    return {
      rischio: "alto",
      patologia_probabile: "Pythium",
      giorni_consecutivi_critici: maxConsecutive,
      date_critiche: critici.slice(-maxConsecutive),
      note:
        "Tmin >20°C e UR >80% per almeno 2 giorni: alta probabilità di patogeni da stress (Pythium, in parte Rhizoctonia su prato stressato).",
    };
  }

  const unoCritico = giorni.some((g) => (g.tMin ?? 0) > 18 && (g.humidity ?? 0) > 75);
  if (unoCritico) {
    return {
      rischio: "medio",
      patologia_probabile: "Dollar spot / Rhizoctonia (monitorare)",
      giorni_consecutivi_critici: 1,
      note: "Un giorno con notte calda-umida: monitorare macchie circolari e ritenzione fogliare.",
    };
  }

  return {
    rischio: "basso",
    patologia_probabile: null,
    giorni_consecutivi_critici: 0,
    note: "Nessuna finestra critica umido-caldo prolungata nelle previsioni analizzate.",
  };
}

export { PATTERN_OK };
