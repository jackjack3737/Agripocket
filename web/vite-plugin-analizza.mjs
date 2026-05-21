import { createClient } from "@supabase/supabase-js";
import { loadCrawlerEnv } from "./server/loadEnv.mjs";
import { analizzaPrato } from "./server/analizzaPratoCore.mjs";
import { generaPianoStagionale } from "./server/pianoStagionale.mjs";
import { resetProfiloUtente } from "./server/resetProfilo.mjs";
import { fetchWeatherBundle } from "./server/weatherCore.mjs";
import { rispondiChatZona } from "./server/chatZonaRAG.mjs";
import { createJob, updateJob, adminClient, getJobForUser } from "./server/jobs.mjs";
import { checkRateLimit } from "./server/rateLimit.mjs";

async function authUser(req, env) {
  const auth = req.headers.authorization || "";
  if (!auth || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await sb.auth.getUser();
  return data?.user ?? null;
}

async function runGeneraPianoJob(jobId, authHeader, env) {
  const admin = adminClient(env);
  try {
    await updateJob(admin, jobId, { status: "processing" });
    const result = await generaPianoStagionale({ authHeader, env });
    await updateJob(admin, jobId, { status: "completed", result, error_message: null });
  } catch (e) {
    await updateJob(admin, jobId, { status: "failed", error_message: e.message || String(e) });
  }
}

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
      notaUtente: body?.notaUtente,
    });
    await updateJob(admin, jobId, { status: "completed", result, error_message: null });
  } catch (e) {
    await updateJob(admin, jobId, { status: "failed", error_message: e.message || String(e) });
  }
}

/** API analisi prato + meteo integrata in Vite */
export function analizzaPratoPlugin() {
  return {
    name: "agripocket-analizza-prato",
    configureServer(server) {
      const env = loadCrawlerEnv();

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/meteo")) return next();

        const url = new URL(req.url, "http://localhost");
        const city = url.searchParams.get("city");
        const zonaId = url.searchParams.get("zonaId");
        const lat = url.searchParams.get("lat");
        const lon = url.searchParams.get("lon");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");

        if (req.method !== "GET" || (!city && (!lat || !lon))) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Parametro city oppure lat/lon richiesti" }));
          return;
        }

        try {
          const bundle = await fetchWeatherBundle(city || "Zona", null, {
            zonaId: zonaId || undefined,
            lat: lat != null ? Number(lat) : undefined,
            lon: lon != null ? Number(lon) : undefined,
          });
          res.statusCode = 200;
          res.end(JSON.stringify(bundle));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message || String(e) }));
        }
      });

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/job-status")) return next();

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }

        const url = new URL(req.url, "http://localhost");
        const jobId = url.searchParams.get("jobId");
        if (!jobId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Parametro jobId richiesto" }));
          return;
        }

        try {
          const user = await authUser(req, env);
          if (!user) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Non autenticato" }));
            return;
          }
          const admin = adminClient(env);
          const job = await getJobForUser(admin, jobId, user.id);
          if (!job) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Job non trovato" }));
            return;
          }
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              id: job.id,
              tipo: job.tipo,
              status: job.status,
              result: job.result,
              error: job.error_message,
              updatedAt: job.updated_at,
            }),
          );
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message || String(e) }));
        }
      });

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/analizza-prato")) return next();

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
          res.end();
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }

        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");

          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const auth = req.headers.authorization || "";
            if (!auth) {
              res.statusCode = 401;
              res.end(JSON.stringify({ error: "Non autenticato" }));
              return;
            }

            const user = await authUser(req, env);
            if (!user) {
              res.statusCode = 401;
              res.end(JSON.stringify({ error: "Sessione non valida" }));
              return;
            }

            const rl = checkRateLimit(user.id, "analizza_foto");
            if (!rl.ok) {
              res.statusCode = 429;
              res.end(
                JSON.stringify({
                  error: `Troppe analisi foto. Riprova tra ${Math.ceil((rl.retryAfterSec || 300) / 60)} minuti.`,
                }),
              );
              return;
            }

            const admin = adminClient(env);
            const { job, tablesMissing } = await createJob(admin, user.id, "analizza_foto", {
              mimeType: body?.mimeType,
            });

            if (tablesMissing || !job) {
              console.log("[analizza-prato] sync (no prato_jobs)…");
              const result = await analizzaPrato({
                imageBase64: body.imageBase64,
                mimeType: body.mimeType || "image/jpeg",
                authHeader: auth,
                env,
                modalita: body?.modalita || "prato",
                zonaId: body?.zonaId,
                zonaNome: body?.zonaNome,
                notaUtente: body?.notaUtente,
              });
              res.statusCode = 200;
              res.end(JSON.stringify({ ...result, async: false }));
              return;
            }

            console.log("[analizza-prato] job async", job.id);
            runAnalizzaJob(job.id, body, auth, env).catch(console.error);
            res.statusCode = 202;
            res.end(
              JSON.stringify({
                async: true,
                jobId: job.id,
                status: "pending",
                message: "Analisi foto avviata. Attendi…",
              }),
            );
          } catch (e) {
            console.error("[analizza-prato]", e);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message || String(e) }));
          }
        });
      });

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/reset-profilo")) return next();

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");
        const auth = req.headers.authorization || "";
        if (!auth) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: "Non autenticato" }));
          return;
        }

        try {
          const user = await authUser(req, env);
          if (!user) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Sessione non valida" }));
            return;
          }
          const result = await resetProfiloUtente({ authHeader: auth, env });
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (e) {
          console.error("[reset-profilo]", e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message || String(e) }));
        }
      });

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/chat-zona")) return next();

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
        res.setHeader("Content-Type", "application/json");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const auth = req.headers.authorization || "";
        if (!auth) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: "Non autenticato" }));
          return;
        }

        try {
          const user = await authUser(req, env);
          if (!user) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Sessione non valida" }));
            return;
          }

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");

          const admin = adminClient(env);
          const { data: profilo } = await admin
            .from("prato_profilo")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

          const result = await rispondiChatZona(admin, user.id, body?.domanda, {
            zonaId: body?.zonaId || body?.zona_id,
            profilo,
            env,
          });
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message || String(e) }));
        }
      });

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/genera-piano")) return next();

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");
        const auth = req.headers.authorization || "";
        if (!auth) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: "Non autenticato" }));
          return;
        }

        try {
          const user = await authUser(req, env);
          if (!user) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Sessione non valida" }));
            return;
          }

          const rl = checkRateLimit(user.id, "genera_piano");
          if (!rl.ok) {
            res.statusCode = 429;
            res.end(
              JSON.stringify({
                error: `Troppo spesso. Rigenera il piano tra ${Math.ceil((rl.retryAfterSec || 600) / 60)} minuti.`,
              }),
            );
            return;
          }

          const admin = adminClient(env);
          const { job, tablesMissing } = await createJob(admin, user.id, "genera_piano", {});

          if (tablesMissing || !job) {
            console.log("[genera-piano] sync (no prato_jobs)…");
            const result = await generaPianoStagionale({ authHeader: auth, env });
            res.statusCode = 200;
            res.end(JSON.stringify({ ...result, async: false }));
            return;
          }

          console.log("[genera-piano] job async", job.id);
          runGeneraPianoJob(job.id, auth, env).catch(console.error);
          res.statusCode = 202;
          res.end(
            JSON.stringify({
              async: true,
              jobId: job.id,
              status: "pending",
              message: "Generazione calendario avviata. Attendi…",
            }),
          );
        } catch (e) {
          console.error("[genera-piano]", e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message || String(e) }));
        }
      });

      if (env.GEMINI_API_KEY) {
        console.log(
          "[agripocket] API: analizza-prato · genera-piano · chat-zona · reset-profilo · job-status · meteo",
        );
      } else {
        console.warn("[agripocket] Manca crawler/.env — foto prato non funzionerà");
      }
    },
  };
}
