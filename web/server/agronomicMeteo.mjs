/**
 * Dati agronomici da Open-Meteo: ET0 FAO, T suolo 10 cm, GDD (Growing Degree Days).
 */

import { normalizzaGiornoMeteo } from "./agronomicPredictor.mjs";

/** GDD giornaliero: max(0, (Tmax + Tmin) / 2 − Tbase). Default Tbase 10 °C (tappeto temperato). */
export function calcolaGDDGiorno(tMax, tMin, baseTemp = 10) {
  if (tMax == null || tMin == null) return null;
  const avg = (Number(tMax) + Number(tMin)) / 2;
  return Math.max(0, Math.round((avg - baseTemp) * 10) / 10);
}

/**
 * Serie GDD da righe giornaliere { date, tMax, tMin }.
 * @returns {{ rows: object[], gdd_cumul_stagione: number, gdd_cumul_30g: number }}
 */
export function calcolaSerieGDD(dailyRows, opts = {}) {
  const base = opts.baseTemp ?? 10;
  const rows = [];
  let cumul = 0;

  for (const raw of dailyRows || []) {
    const g = normalizzaGiornoMeteo(raw);
    if (!g?.date || g.tMax == null) continue;
    const gddDay = calcolaGDDGiorno(g.tMax, g.tMin ?? g.tMax - 6, base);
    if (gddDay == null) continue;
    cumul += gddDay;
    rows.push({
      date: g.date,
      tMax: g.tMax,
      tMin: g.tMin,
      gdd_day: gddDay,
      gdd_cumul: Math.round(cumul * 10) / 10,
      et0_mm: raw.et0_mm ?? null,
      rain_mm: g.rainMm ?? 0,
    });
  }

  const last30 = rows.slice(-30);
  const gdd30 = last30.reduce((s, r) => s + r.gdd_day, 0);

  return {
    rows,
    gdd_cumul_stagione: rows.length ? rows[rows.length - 1].gdd_cumul : 0,
    gdd_cumul_30g: Math.round(gdd30 * 10) /  10,
    base_temp: base,
  };
}

/** Ultimo valore orario non nullo da array Open-Meteo. */
function ultimoValoreOrario(times, values) {
  if (!times?.length || !values?.length) return null;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) return { time: times[i], value: values[i] };
  }
  return null;
}

/**
 * Fetch forecast Open-Meteo con variabili agronomiche.
 * @param {number} lat
 * @param {number} lon
 */
export async function fetchOpenMeteoAgronomic(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&hourly=soil_temperature_6cm,relative_humidity_2m` +
    `&daily=temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration,precipitation_sum` +
    `&past_days=14&forecast_days=7&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo agronomico: ${res.status}`);
  const data = await res.json();

  const daily = data.daily;
  const historyRows = [];
  if (daily?.time?.length) {
    for (let i = 0; i < daily.time.length; i++) {
      historyRows.push({
        date: daily.time[i],
        tMax: daily.temperature_2m_max[i],
        tMin: daily.temperature_2m_min[i],
        rainMm: daily.precipitation_sum?.[i] ?? 0,
        et0_mm: daily.et0_fao_evapotranspiration?.[i] ?? null,
        weather_code: null,
      });
    }
  }

  const gdd = calcolaSerieGDD(historyRows);
  const todayRow = historyRows[historyRows.length - 1];
  const soil = ultimoValoreOrario(data.hourly?.time, data.hourly?.soil_temperature_6cm);

  const et0Oggi = todayRow?.et0_mm ?? null;
  const et0Media7 =
    historyRows.slice(-7).filter((r) => r.et0_mm != null).length > 0
      ? Math.round(
          (historyRows.slice(-7).reduce((s, r) => s + (r.et0_mm ?? 0), 0) /
            historyRows.slice(-7).filter((r) => r.et0_mm != null).length) *
            100,
        ) / 100
      : null;

  return {
    provider: "open-meteo",
    fetched_at: new Date().toISOString(),
    et0_mm_oggi: et0Oggi,
    et0_mm_media_7g: et0Media7,
    soil_temperature_10cm_c: soil?.value ?? null,
    soil_depth_cm: 6,
    soil_temperature_at: soil?.time ?? null,
    gdd: {
      base_temp: gdd.base_temp,
      oggi: todayRow ? calcolaGDDGiorno(todayRow.tMax, todayRow.tMin, gdd.base_temp) : null,
      cumul_30g: gdd.gdd_cumul_30g,
      cumul_stagione: gdd.gdd_cumul_stagione,
      serie: gdd.rows.slice(-14),
    },
    forecast_daily: historyRows.slice(-7),
    raw_current: data.current,
    raw_hourly_sample: soil,
  };
}

/** Payload compatto da salvare su zone_prato.meteo_agronomico */
export function meteoAgronomicoPerStorage(agronomic, geo = {}) {
  if (!agronomic) return null;
  return {
    provider: agronomic.provider,
    fetched_at: agronomic.fetched_at,
    lat: geo.lat ?? null,
    lon: geo.lon ?? null,
    comune: geo.comune ?? geo.name ?? null,
    et0_mm_oggi: agronomic.et0_mm_oggi,
    et0_mm_media_7g: agronomic.et0_mm_media_7g,
    soil_temperature_10cm_c: agronomic.soil_temperature_10cm_c,
    soil_depth_cm: agronomic.soil_depth_cm ?? 6,
    gdd_oggi: agronomic.gdd?.oggi,
    gdd_cumul_30g: agronomic.gdd?.cumul_30g,
    gdd_cumul_stagione: agronomic.gdd?.cumul_stagione,
    gdd_base_temp: agronomic.gdd?.base_temp,
    forecast_daily: agronomic.forecast_daily,
  };
}

export function formatAgronomicForPrompt(agronomic) {
  if (!agronomic) return "";
  const lines = ["## Meteo agronomico (Open-Meteo)"];
  if (agronomic.et0_mm_oggi != null) {
    lines.push(`ET0 oggi (FAO): ${agronomic.et0_mm_oggi} mm/giorno.`);
  }
  if (agronomic.et0_mm_media_7g != null) {
    lines.push(`ET0 media ultimi 7 giorni: ${agronomic.et0_mm_media_7g} mm/g.`);
  }
  if (agronomic.soil_temperature_10cm_c != null) {
    lines.push(
      `Temperatura suolo ~${agronomic.soil_depth_cm ?? 6} cm: ${agronomic.soil_temperature_10cm_c}°C.`,
    );
  }
  if (agronomic.gdd) {
    const g = agronomic.gdd;
    lines.push(
      `GDD (base ${g.base_temp ?? 10}°C): oggi ${g.oggi ?? "—"}, cumulo 30 gg ${g.cumul_30g ?? "—"}, stagione ${g.cumul_stagione ?? "—"}.`,
    );
  }
  return lines.join("\n");
}
