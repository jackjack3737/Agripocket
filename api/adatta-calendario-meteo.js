import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "../web/server/serverEnv.mjs";
import { fetchWeatherBundle } from "../web/server/weatherCore.mjs";
import { adattaDateCalendarioPerSuolo } from "../web/server/pianoAdattivo.mjs";
import { lawnCentroid } from "../web/server/pratoZone.mjs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = req.headers.authorization || "";
  if (!auth) {
    res.status(401).json({ error: "Non autenticato" });
    return;
  }

  try {
    const env = loadServerEnv();
    const supabaseUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      res.status(401).json({ error: "Sessione non valida" });
      return;
    }

    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: profilo } = await admin
      .from("prato_profilo")
      .select("*")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!profilo?.localita?.trim()) {
      res.status(400).json({ error: "Imposta la localitÃ  nel profilo." });
      return;
    }

    let pratoZone = profilo?.prato_zone;
    if (typeof pratoZone === "string") {
      try {
        pratoZone = JSON.parse(pratoZone);
      } catch {
        pratoZone = null;
      }
    }
    const c = lawnCentroid(pratoZone);
    const gps = c ? { lat: c.lat, lon: c.lng } : null;

    const weatherBundle = await fetchWeatherBundle(profilo.localita, null, {
      lat: gps?.lat,
      lon: gps?.lon,
    });

    const suolo = await adattaDateCalendarioPerSuolo(admin, userData.user.id, profilo, weatherBundle);

    const spostati = suolo?.spostati ?? 0;
    const messaggio =
      spostati > 0
        ? `Calendario aggiornato: ${spostati} lavor${spostati === 1 ? "o" : "i"} spostat${spostati === 1 ? "o" : "i"} in base al meteo attuale.`
        : "Nessuna data da spostare oggi; il calendario Ã¨ giÃ  allineato al meteo.";

    res.status(200).json({
      spostati,
      temperatura_suolo_c: suolo?.temperatura_suolo_c ?? null,
      messaggio,
    });
  } catch (e) {
    console.error("[adatta-calendario-meteo]", e);
    res.status(500).json({ error: e.message || String(e) });
  }
}
