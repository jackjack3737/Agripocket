/** Meteo agronomico — da AgriManager (OpenWeather) + storico temperature (Open-Meteo) */

const IT_MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

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

async function geocodeCity(city, apiKey) {
  const q = encodeURIComponent(city.trim());
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${q}&limit=1&appid=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding meteo: ${res.status}`);
  const data = await res.json();
  if (!data?.length) throw new Error(`Località non trovata: ${city}`);
  return { lat: data[0].lat, lon: data[0].lon, name: data[0].name, country: data[0].country };
}

async function fetchCurrentWeather(city, apiKey) {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=it`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.cod !== 200) throw new Error(data.message || "Meteo non disponibile per questa località");
  return data;
}

/** Ultimi N giorni: min/max °C (Open-Meteo, gratuito) */
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
  const avgMax = rows.reduce((s, r) => s + (r.tMax ?? 0), 0) / rows.length;
  const avgMin = rows.reduce((s, r) => s + (r.tMin ?? 0), 0) / rows.length;
  const maxAbs = Math.max(...temps);
  const minAbs = Math.min(...temps);
  const frostDays = rows.filter((r) => r.tMin != null && r.tMin <= 2).length;
  const hotDays = rows.filter((r) => r.tMax != null && r.tMax >= 30).length;
  const rainyDays = rows.filter((r) => r.rainMm >= 5).length;

  return { days: rows.length, rows, avgMax, avgMin, maxAbs, minAbs, frostDays, hotDays, rainyDays };
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
  const monthName = IT_MONTHS[new Date().getMonth()];
  lines.push(`Mese corrente: ${monthName}.`);
  return lines.join("\n");
}

/**
 * @param {string} city - città o CAP
 * @param {string} [apiKey]
 */
export async function fetchWeatherBundle(city, apiKey) {
  const key = apiKey?.trim();
  if (!key) throw new Error("Manca OPENWEATHER_API_KEY (crawler/.env o variabili Vercel)");
  if (!city?.trim()) throw new Error("Inserisci città o CAP");

  const geo = await geocodeCity(city, key);
  const current = await fetchCurrentWeather(city, key);
  const history = await fetchRecentTemperatures(geo.lat, geo.lon, 14);
  const advice = getAgronomicAdvice(current);

  return {
    location: `${current.name}${geo.country ? `, ${geo.country}` : ""}`,
    geo,
    current,
    history,
    advice,
    summaryText: formatWeatherForPrompt({
      current,
      history,
      advice,
      location: current.name,
    }),
  };
}
