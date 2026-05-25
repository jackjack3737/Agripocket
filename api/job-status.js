import { adminClient, getJobForUser } from "../web/server/jobs.mjs";
import { loadServerEnv } from "../web/server/serverEnv.mjs";
import { createClient } from "@supabase/supabase-js";

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

  const jobId = req.query?.jobId || req.query?.id;
  if (!jobId) {
    res.status(400).json({ error: "Parametro jobId richiesto" });
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

    const admin = adminClient(env);
    const job = await getJobForUser(admin, jobId, userData.user.id);
    if (!job) {
      res.status(404).json({ error: "Job non trovato" });
      return;
    }

    res.status(200).json({
      id: job.id,
      tipo: job.tipo,
      status: job.status,
      result: job.result,
      error: job.error_message,
      updatedAt: job.updated_at,
    });
  } catch (e) {
    console.error("[job-status]", e);
    res.status(500).json({ error: e.message || String(e) });
  }
}
