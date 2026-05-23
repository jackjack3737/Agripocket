import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "../server/serverEnv.mjs";
import { fetchWeatherBundle } from "../server/weatherCore.mjs";
import { calcolaIrrigazioneGiornalieraAsync } from "../server/motoreIrrigazione.mjs";
import { queryKnowledgeBasePrioritized } from "../server/kbQuery.mjs";

const EMBED_MODEL = "gemini-embedding-001";

async function geminiEmbed(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.embedding?.values;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
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
      res.status(400).json({ error: "Imposta la località nel profilo per il calcolo irrigazione." });
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
    const poligono = pratoZone?.poligono;
    const gps =
      Array.isArray(poligono) && poligono.length >= 3
        ? {
            lat: poligono.reduce((s, p) => s + Number(p.lat), 0) / poligono.length,
            lon: poligono.reduce((s, p) => s + Number(p.lng ?? p.lon), 0) / poligono.length,
          }
        : null;

    const weatherBundle = await fetchWeatherBundle(profilo.localita, null, {
      lat: gps?.lat,
      lon: gps?.lon,
    });

    const geminiKey = env.GEMINI_API_KEY?.trim();
    const embedFn = geminiKey
      ? (text) => geminiEmbed(text, geminiKey)
      : null;

    const risultato = await calcolaIrrigazioneGiornalieraAsync(profilo, weatherBundle, {
      admin,
      geminiEmbed: embedFn,
      queryKnowledgeBasePrioritized: geminiKey ? queryKnowledgeBasePrioritized : null,
    });

    const oggi = new Date().toISOString().slice(0, 10);
    try {
      await admin
        .from("prato_profilo")
        .update({
          irrigazione_oggi: { ...risultato, data: oggi },
          irrigazione_oggi_aggiornato: new Date().toISOString(),
        })
        .eq("user_id", userData.user.id);
    } catch {
      /* colonne opzionali — patch SQL */
    }

    res.status(200).json({ ...risultato, data_consiglio: oggi });
  } catch (e) {
    console.error("[irrigazione-giornaliera]", e);
    res.status(500).json({ error: e.message || String(e) });
  }
}
