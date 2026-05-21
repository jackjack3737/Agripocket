import { waitUntil } from "@vercel/functions";
import { analizzaPrato } from "../server/analizzaPratoCore.mjs";
import { loadServerEnv } from "../server/serverEnv.mjs";
import { createJob, updateJob, adminClient } from "../server/jobs.mjs";
import { checkRateLimit } from "../server/rateLimit.mjs";
import { createClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 120,
};

async function runAnalizzaJob(jobId, body, authHeader, env) {
  const admin = adminClient(env);
  try {
    await updateJob(admin, jobId, { status: "processing" });
    const result = await analizzaPrato({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType || "image/jpeg",
      authHeader,
      env,
      modalita: body?.modalita || "prato",
      zonaId: body?.zonaId,
      zonaNome: body?.zonaNome,
    });
    await updateJob(admin, jobId, {
      status: "completed",
      result,
      error_message: null,
    });
  } catch (e) {
    await updateJob(admin, jobId, {
      status: "failed",
      error_message: e.message || String(e),
    });
  }
}

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
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const env = loadServerEnv();
    const supabaseUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      res.status(401).json({ error: "Sessione non valida" });
      return;
    }

    const rl = checkRateLimit(userData.user.id, "analizza_foto");
    if (!rl.ok) {
      res.status(429).json({
        error: `Troppe analisi foto. Riprova tra ${Math.ceil((rl.retryAfterSec || 300) / 60)} minuti.`,
      });
      return;
    }

    const admin = adminClient(env);
    const { job, tablesMissing } = await createJob(admin, userData.user.id, "analizza_foto", {
      mimeType: body?.mimeType,
    });

    if (tablesMissing || !job) {
      const result = await analizzaPrato({
        imageBase64: body?.imageBase64,
        mimeType: body?.mimeType || "image/jpeg",
        authHeader: auth,
        env,
        modalita: body?.modalita || "prato",
        zonaId: body?.zonaId,
        zonaNome: body?.zonaNome,
      });
      res.status(200).json({ ...result, async: false });
      return;
    }

    waitUntil(runAnalizzaJob(job.id, body, auth, env));

    res.status(202).json({
      async: true,
      jobId: job.id,
      status: "pending",
      message: "Analisi foto avviata. Attendi…",
    });
  } catch (e) {
    console.error("[analizza-prato]", e);
    res.status(500).json({ error: e.message || String(e) });
  }
}
