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
  if (!city) {
    res.status(400).json({ error: "Parametro city richiesto" });
    return;
  }
  try {
    const bundle = await fetchWeatherBundle(city, process.env.OPENWEATHER_API_KEY);
    res.status(200).json(bundle);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
