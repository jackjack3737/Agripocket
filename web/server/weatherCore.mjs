/** Meteo agronomico — Open-Meteo (gratuito) + OpenWeather opzionale se c'è API key */

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

async function geocodeOpenMeteo(city) {
  const q = city.trim();
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=5&language=it`;
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

async function geocodeOpenWeather(city, apiKey) {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city.trim())}&limit=1&appid=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding meteo: ${res.status}`);
  const data = await res.json();
  if (!data?.length) throw new Error(`Località non trovata: ${city}`);
  return { lat: data[0].lat, lon: data[0].lon, name: data[0].name, country: data[0].country };
}

async function fetchCurrentOpenWeather(city, apiKey) {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=it`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.cod !== 200) throw new Error(data.message || "Meteo non disponibile per questa località");
  return data;
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
  return lines.join("\n");
}

/**
 * @param {string} city - città o CAP
 * @param {string} [apiKey] - OpenWeather opzionale
 */
export async function fetchWeatherBundle(city, apiKey) {
  if (!city?.trim()) throw new Error("Inserisci città o CAP");

  const key = apiKey?.trim();
  let geo;
  let current;

  if (key) {
    try {
      geo = await geocodeOpenWeather(city, key);
      current = await fetchCurrentOpenWeather(city, key);
    } catch {
      geo = await geocodeOpenMeteo(city);
      current = await fetchCurrentOpenMeteo(geo.lat, geo.lon, geo.name);
    }
  } else {
    geo = await geocodeOpenMeteo(city);
    current = await fetchCurrentOpenMeteo(geo.lat, geo.lon, geo.name);
  }

  const history = await fetchRecentTemperatures(geo.lat, geo.lon, 14);
  const advice = getAgronomicAdvice(current);
  const location = geo.admin1
    ? `${current.name}, ${geo.admin1}`
    : `${current.name}${geo.country ? `, ${geo.country}` : ""}`;

  return {
    location,
    geo,
    current,
    history,
    advice,
    summaryText: formatWeatherForPrompt({ current, history, advice, location }),
  };
}
