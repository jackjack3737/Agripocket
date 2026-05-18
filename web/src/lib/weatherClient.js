/** Meteo via API dev/proxy (chiave OpenWeather solo lato server) + cache client 1h */

const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheKey(city) {
  return `agripocket_meteo_${city.trim().toLowerCase()}`;
}

export async function fetchMeteoForCity(city) {
  const trimmed = city?.trim();
  if (!trimmed) throw new Error("Città mancante");

  try {
    const raw = sessionStorage.getItem(cacheKey(trimmed));
    if (raw) {
      const { at, bundle } = JSON.parse(raw);
      if (Date.now() - at < CACHE_TTL_MS) return bundle;
    }
  } catch {
    /* ignore */
  }

  const q = encodeURIComponent(trimmed);
  const res = await fetch(`/api/meteo?city=${q}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Meteo non disponibile");

  try {
    sessionStorage.setItem(cacheKey(trimmed), JSON.stringify({ at: Date.now(), bundle: data }));
  } catch {
    /* quota */
  }

  return data;
}
