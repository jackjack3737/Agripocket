import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "../server/serverEnv.mjs";
import { adminClient } from "../server/jobs.mjs";
import { rispondiChatZona } from "../server/chatZonaRAG.mjs";

export const config = { maxDuration: 120 };

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

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: "JSON non valido" });
      return;
    }
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

    const admin = adminClient(env);
    const { data: profilo } = await admin
      .from("prato_profilo")
      .select("*")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const result = await rispondiChatZona(admin, userData.user.id, body?.domanda, {
      zonaId: body?.zonaId || body?.zona_id,
      profilo,
      env,
    });

    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
