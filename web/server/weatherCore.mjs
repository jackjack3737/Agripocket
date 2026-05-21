/** Meteo agronomico — Open-Meteo (gratuito, senza API key) */

import {
  fetchOpenMeteoAgronomic,
  formatAgronomicForPrompt,
} from "./agronomicMeteo.mjs";
import { persistMeteoZona } from "./zoneMeteo.mjs";

const IT_MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const WMO_IT = {
  0: "sereno",
  1: "prevalentemente sereno",
  2: "parzialmente nuvoloso",
  3: "coperto",
  45: "nebbia",
  48: "nebbia con brina",
  51: "pioggerella leggera",
  53: "pioggerella",
  55: "pioggerella intensa",
  61: "pioggia leggera",
  63: "pioggia moderata",
  65: "pioggia forte",
  71: "neve leggera",
  73: "neve moderata",
  75: "neve forte",
  80: "rovesci",
  95: "temporale",
};

function wmoCategory(code) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  if ([45, 48].includes(code)) return "Mist";
  return "Clear";
}

/** @param {import('openweather').Weather | null} weather */
export function getAgronomicAdvice(weather) {
  if (!weather?.main) return { status: "…", advice: "Meteo non disponibile", color: "#999" };

  const currentMonth = new Date().getMonth() + 1;
  const isWinterOffSeason = currentMonth === 12 || currentMonth === 1 || currentMonth === 2;
  const temp = weather.main.temp;
  const main = weather.weather?.[0]?.main ?? "";

  if (isWinterOffSeason || main === "Snow" || temp <= 5) {
    return { status: "Riposo invernale", advice: "Fuori stagione (dic–feb). Prato a riposo.", color: "#90A4AE" };
  }
  if (main === "Rain" || main === "Drizzle" || main === "Thunderstorm") {
    return { status: "Pioggia", advice: "Spegni irrigazione. Evita trattamenti.", color: "#42A5F5" };
  }
  if (temp > 5 && temp < 12) {
    return { status: "Bassa crescita", advice: "Taglio alto. Assorbimento lento.", color: "#7986CB" };
  }
  if (temp >= 28) {
    return { status: "Stress termico", advice: "Irriga al mattino. Alza il taglio.", color: "#D32F2F" };
  }
  return { status: "Tempo favorevole", advice: "Buono per taglio e concime.", color: "#2E7D32" };
}

function isItalianCap(value) {
  return /^\d{5}$/.test(String(value || "").trim());
}

/** CAP italiano: Open-Meteo non li risolve (es. 40100 → Dax FR). */
async function geocodeItalianCap(cap) {
  const zip = cap.trim();
  const url =
    `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}` +
    `&country=Italy&format=jsonv2&addressdetails=1&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "AgriPocket/1.0 (turfgrass app; contact: support@agripocket.local)" },
  });
  if (!res.ok) throw new Error(`Geocoding CAP: ${res.status}`);
  const data = await res.json();
  const hit = data?.[0];
  if (!hit) throw new Error(`CAP non trovato in Italia: ${zip}`);
  const addr = hit.address ?? {};
  const comune = addr.city || addr.town || addr.municipality || addr.village || hit.name || zip;
  return {
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    name: comune,
    comune,
    country: "IT",
    admin1: addr.state || addr.region,
  };
}

async function geocodeOpenMeteo(city) {
  const q = city.trim();
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=8&language=it`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding meteo: ${res.status}`);
  const data = await res.json();
  const hit =
    data.results?.find((r) => r.country_code === "IT") ||
    data.results?.[0];
  if (!hit) throw new Error(`Località non trovata: ${city}`);
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    name: hit.name,
    comune: hit.name,
    country: hit.country_code ?? "IT",
    admin1: hit.admin1,
  };
}

async function fetchCurrentOpenMeteo(lat, lon, placeName) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Meteo attuale non disponibile");
  const data = await res.json();
  const c = data.current;
  if (!c) throw new Error("Meteo attuale non disponibile");
  const code = c.weather_code ?? 0;
  const main = wmoCategory(code);
  return {
    name: placeName,
    main: {
      temp: c.temperature_2m,
      feels_like: c.apparent_temperature ?? c.temperature_2m,
      humidity: c.relative_humidity_2m ?? 0,
    },
    weather: [{ main, description: WMO_IT[code] ?? "variabile" }],
    wind: { speed: (c.wind_speed_10m ?? 0) / 3.6 },
  };
}

function historyFromAgronomic(agronomic) {
  const rows = agronomic?.gdd?.serie ?? [];
  if (!rows.length) return null;
  const temps = rows.flatMap((r) => [r.tMax, r.tMin].filter((t) => t != null));
  return {
    days: rows.length,
    rows: rows.map((r) => ({
      date: r.date,
      tMax: r.tMax,
      tMin: r.tMin,
      rainMm: r.rain_mm ?? 0,
      et0_mm: r.et0_mm,
    })),
    avgMax: rows.reduce((s, r) => s + (r.tMax ?? 0), 0) / rows.length,
    avgMin: rows.reduce((s, r) => s + (r.tMin ?? 0), 0) / rows.length,
    maxAbs: Math.max(...temps),
    minAbs: Math.min(...temps),
    frostDays: rows.filter((r) => r.tMin != null && r.tMin <= 2).length,
    hotDays: rows.filter((r) => r.tMax != null && r.tMax >= 30).length,
    rainyDays: rows.filter((r) => (r.rain_mm ?? 0) >= 5).length,
  };
}

async function fetchRecentTemperatures(lat, lon, days = 14) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const fmt = (d) => d.toISOString().slice(0, 10);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const daily = data.daily;
  if (!daily?.time?.length) return null;

  const rows = daily.time.map((date, i) => ({
    date,
    tMax: daily.temperature_2m_max[i],
    tMin: daily.temperature_2m_min[i],
    rainMm: daily.precipitation_sum?.[i] ?? 0,
  }));

  const temps = rows.flatMap((r) => [r.tMax, r.tMin].filter((t) => t != null));
  return {
    days: rows.length,
    rows,
    avgMax: rows.reduce((s, r) => s + (r.tMax ?? 0), 0) / rows.length,
    avgMin: rows.reduce((s, r) => s + (r.tMin ?? 0), 0) / rows.length,
    maxAbs: Math.max(...temps),
    minAbs: Math.min(...temps),
    frostDays: rows.filter((r) => r.tMin != null && r.tMin <= 2).length,
    hotDays: rows.filter((r) => r.tMax != null && r.tMax >= 30).length,
    rainyDays: rows.filter((r) => r.rainMm >= 5).length,
  };
}

export function formatWeatherForPrompt(bundle) {
  if (!bundle) return "";
  const { current, history, advice, location } = bundle;
  const lines = [
    `## Meteo sito — ${location}`,
    `Ora: ${Math.round(current.main.temp)}°C (percepita ${Math.round(current.main.feels_like)}°C), ${current.weather[0].description}, umidità ${current.main.humidity}%, vento ${Math.round(current.wind?.speed ?? 0)} m/s.`,
    `Consiglio meteo: ${advice.status} — ${advice.advice}`,
  ];
  if (history) {
    lines.push(
      `Ultimi ${history.days} giorni: min media ${history.avgMin.toFixed(1)}°C, max media ${history.avgMax.toFixed(1)}°C, assoluto ${history.minAbs.toFixed(1)}–${history.maxAbs.toFixed(1)}°C.`,
      `Giorni con gelo (min ≤2°C): ${history.frostDays}, giorni caldi (max ≥30°C): ${history.hotDays}, giorni con pioggia ≥5mm: ${history.rainyDays}.`,
    );
    const last5 = history.rows.slice(-5);
    lines.push(
      "Dettaglio recente: " +
        last5.map((r) => `${r.date}: ${r.tMin?.toFixed(0)}–${r.tMax?.toFixed(0)}°C`).join("; "),
    );
  }
  lines.push(`Mese corrente: ${IT_MONTHS[new Date().getMonth()]}.`);
  if (bundle.agronomic) {
    lines.push(formatAgronomicForPrompt(bundle.agronomic));
  }
  return lines.join("\n");
}

/** Geocoding solo Open-Meteo + Nominatim (CAP IT). */
async function resolveGeo(city) {
  const q = city.trim();
  if (isItalianCap(q)) return geocodeItalianCap(q);
  return geocodeOpenMeteo(q);
}

/**
 * Bundle meteo completo (Open-Meteo + ET0/GDD/T suolo).
 * @param {string} city - città o CAP
 * @param {string} [_legacyApiKey] - ignorato (OpenWeather dismesso)
 * @param {{ zonaId?: string, lat?: number, lon?: number }} [opts]
 */
export async function fetchWeatherBundle(city, _legacyApiKey, opts = {}) {
  let geo;
  if (opts.lat != null && opts.lon != null) {
    geo = {
      lat: Number(opts.lat),
      lon: Number(opts.lon),
      name: city?.trim() || "Zona",
      comune: city?.trim() || null,
      country: "IT",
    };
  } else {
    if (!city?.trim()) throw new Error("Inserisci città o CAP");
    geo = await resolveGeo(city.trim());
  }

  const agronomic = await fetchOpenMeteoAgronomic(geo.lat, geo.lon);
  const current = await fetchCurrentOpenMeteo(geo.lat, geo.lon, geo.name);
  const history = historyFromAgronomic(agronomic) ?? (await fetchRecentTemperatures(geo.lat, geo.lon, 14));
  const advice = getAgronomicAdvice(current);
  const location = geo.admin1
    ? `${current.name}, ${geo.admin1}`
    : `${current.name}${geo.country ? `, ${geo.country}` : ""}`;

  const bundle = {
    location,
    geo,
    current,
    history,
    agronomic,
    advice,
    provider: "open-meteo",
  };
  bundle.summaryText = formatWeatherForPrompt({ ...bundle, location });

  if (opts.zonaId) {
    bundle.zonaPersisted = await persistMeteoZona(opts.zonaId, agronomic, geo);
  }

  return bundle;
}
