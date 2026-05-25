import { waitUntil } from "@vercel/functions";
import { generaPianoStagionale } from "../web/server/pianoStagionale.mjs";
import { loadServerEnv } from "../web/server/serverEnv.mjs";
import { createJob, updateJob, adminClient } from "../web/server/jobs.mjs";
import { checkRateLimit } from "../web/server/rateLimit.mjs";
import { createClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 120,
};

async function runGeneraPianoJob(jobId, authHeader, env) {
  const admin = adminClient(env);
  try {
    await updateJob(admin, jobId, { status: "processing" });
    const result = await generaPianoStagionale({ authHeader, env });
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
    const env = loadServerEnv();
    const supabaseUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      res.status(401).json({ error: "Sessione non valida" });
      return;
    }

    const rl = checkRateLimit(userData.user.id, "genera_piano");
    if (!rl.ok) {
      res.status(429).json({
        error: `Tropo spesso. Rigenera il piano tra ${Math.ceil((rl.retryAfterSec || 600) / 60)} minuti.`,
      });
      return;
    }

    const admin = adminClient(env);
    const { job, tablesMissing } = await createJob(admin, userData.user.id, "genera_piano", {});

    if (tablesMissing || !job) {
      const result = await generaPianoStagionale({ authHeader: auth, env });
      res.status(200).json({ ...result, async: false });
      return;
    }

    waitUntil(runGeneraPianoJob(job.id, auth, env));

    res.status(202).json({
      async: true,
      jobId: job.id,
      status: "pending",
      message: "Generazione calendario avviata. AttendiÔÇª",
    });
  } catch (e) {
    console.error("[genera-piano]", e);
    res.status(500).json({ error: e.message || String(e) });
  }
}
