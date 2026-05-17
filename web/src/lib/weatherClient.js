/** Meteo via API dev/proxy (chiave OpenWeather solo lato server) */

export async function fetchMeteoForCity(city) {
  const q = encodeURIComponent(city.trim());
  const res = await fetch(`/api/meteo?city=${q}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Meteo non disponibile");
  return data;
}
