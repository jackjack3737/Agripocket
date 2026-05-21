/** Meteo Open-Meteo via API (ET0, GDD, T suolo) + cache client 1h */

const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheKey(city, opts = {}) {
  const base = (city || "coords").trim().toLowerCase();
  const z = opts.zonaId ? `_z${opts.zonaId}` : "";
  const c =
    opts.lat != null && opts.lon != null ? `_${opts.lat.toFixed(3)}_${opts.lon.toFixed(3)}` : "";
  return `agripocket_meteo_v3_${base}${z}${c}`;
}

/**
 * @param {string} city - città o CAP
 * @param {{ zonaId?: string, lat?: number, lon?: number }} [opts]
 */
export async function fetchMeteoForCity(city, opts = {}) {
  const trimmed = city?.trim();
  if (!trimmed && (opts.lat == null || opts.lon == null)) {
    throw new Error("Città o coordinate mancanti");
  }

  try {
    const raw = sessionStorage.getItem(cacheKey(trimmed || "zona", opts));
    if (raw) {
      const { at, bundle } = JSON.parse(raw);
      if (Date.now() - at < CACHE_TTL_MS) return bundle;
    }
  } catch {
    /* ignore */
  }

  const params = new URLSearchParams();
  if (trimmed) params.set("city", trimmed);
  if (opts.zonaId) params.set("zonaId", opts.zonaId);
  const lat = Number(opts.lat);
  const lon = Number(opts.lon ?? opts.lng);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    params.set("lat", String(lat));
    params.set("lon", String(lon));
  }

  const res = await fetch(`/api/meteo?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Meteo non disponibile");

  try {
    sessionStorage.setItem(
      cacheKey(trimmed || "zona", opts),
      JSON.stringify({ at: Date.now(), bundle: data }),
    );
  } catch {
    /* quota */
  }

  return data;
}
