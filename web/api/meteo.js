import { fetchWeatherBundle } from "../server/weatherCore.mjs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const city = req.query?.city;
  const zonaId = req.query?.zonaId || req.query?.zona_id;
  const lat = req.query?.lat != null ? Number(req.query.lat) : null;
  const lon = req.query?.lon != null ? Number(req.query.lon) : null;

  if (!city && (lat == null || lon == null)) {
    res.status(400).json({ error: "Parametro city oppure lat/lon richiesti" });
    return;
  }

  try {
    const bundle = await fetchWeatherBundle(city || "Zona", null, {
      zonaId: zonaId || undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
    });
    res.status(200).json(bundle);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
