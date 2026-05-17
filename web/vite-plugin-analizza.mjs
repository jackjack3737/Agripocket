import { loadCrawlerEnv } from "./server/loadEnv.mjs";
import { analizzaPrato } from "./server/analizzaPratoCore.mjs";
import { generaPianoStagionale } from "./server/pianoStagionale.mjs";
import { fetchWeatherBundle } from "./server/weatherCore.mjs";

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
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/json");

        if (req.method !== "GET" || !city) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Parametro city richiesto" }));
          return;
        }

        try {
          const bundle = await fetchWeatherBundle(city, env.OPENWEATHER_API_KEY);
          res.statusCode = 200;
          res.end(JSON.stringify(bundle));
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

            console.log("[analizza-prato] analisi avviata…");
            const result = await analizzaPrato({
              imageBase64: body.imageBase64,
              mimeType: body.mimeType || "image/jpeg",
              authHeader: auth,
              env,
            });
            console.log("[analizza-prato] completata, chunks:", result.chunksUsed);
            res.statusCode = 200;
            res.end(JSON.stringify(result));
          } catch (e) {
            console.error("[analizza-prato]", e);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message || String(e) }));
          }
        });
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
          console.log("[genera-piano] avvio calendario annuale…");
          const result = await generaPianoStagionale({ authHeader: auth, env });
          console.log("[genera-piano] ok,", result.count, "interventi");
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (e) {
          console.error("[genera-piano]", e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message || String(e) }));
        }
      });

      if (env.GEMINI_API_KEY) {
        console.log(
          "[agripocket] API: /api/analizza-prato · /api/genera-piano · meteo: /api/meteo?city=...",
        );
      } else {
        console.warn("[agripocket] Manca crawler/.env — foto prato non funzionerà");
      }
    },
  };
}
