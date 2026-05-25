import { createClient } from "@supabase/supabase-js";
import { adminClient } from "../web/server/jobs.mjs";
import { createSignedFotoUrl } from "../web/server/fotoStorage.mjs";
import { loadServerEnv } from "../web/server/serverEnv.mjs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = req.headers.authorization || "";
  if (!auth) {
    res.status(401).json({ error: "Non autenticato" });
    return;
  }

  const path = (req.query?.path || "").trim();
  if (!path || path.includes("..")) {
    res.status(400).json({ error: "Path non valido" });
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

    const prefix = `${userData.user.id}/`;
    if (!path.startsWith(prefix)) {
      res.status(403).json({ error: "Accesso negato" });
      return;
    }

    const admin = adminClient(env);
    const signedUrl = await createSignedFotoUrl(admin, path);
    if (!signedUrl) {
      res.status(404).json({ error: "Foto non trovata" });
      return;
    }

    res.status(200).json({ signedUrl, expiresIn: 900 });
  } catch (e) {
    res.status(500).json({ error: e.message || "Errore foto" });
  }
}
