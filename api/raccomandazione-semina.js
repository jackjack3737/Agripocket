import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "../web/server/serverEnv.mjs";
import { loadProdotti } from "../web/server/prodottiCatalogo.mjs";
import { buildRaccomandazioneSemina } from "../web/server/raccomandazioneSementi.mjs";

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
      res.status(400).json({ error: "Completa la localitÃ  nel profilo prima di calcolare la semina." });
      return;
    }

    const prodotti = await loadProdotti(admin);
    const { data: ultimaAnalisi } = await admin
      .from("prato_analisi")
      .select("vision_json")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = await buildRaccomandazioneSemina(profilo, prodotti, ultimaAnalisi?.vision_json ?? null);
    res.status(200).json(result);
  } catch (e) {
    console.error("[raccomandazione-semina]", e);
    res.status(500).json({ error: e.message || String(e) });
  }
}
