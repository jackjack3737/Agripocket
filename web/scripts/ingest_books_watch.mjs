#!/usr/bin/env node
/**
 * Attende quota Gemini (embedding) e rilancia ingest senza sanitizzazione.
 * Uso: node scripts/ingest_books_watch.mjs
 * Env: INGEST_WATCH_INTERVAL_MS (default 900000 = 15 min)
 */

import { spawn } from "child_process";
import { readFile, writeFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG = join(__dirname, "ingest_watch.log");
const INTERVAL = Number(process.env.INGEST_WATCH_INTERVAL_MS || 900_000);

async function loadEnvFile(path) {
  try {
    const raw = await readFile(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* assente */
  }
}

async function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    await writeFile(LOG, line, { flag: "a" });
  } catch {
    /* log bloccato da Tee-Object esterno */
  }
}

async function testEmbed(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: "test quota agripocket" }] },
    }),
  });
  if (res.ok) return true;
  const body = await res.text();
  if (/429|quota|exceeded|RESOURCE_EXHAUSTED/i.test(body)) return false;
  throw new Error(`Embed test ${res.status}: ${body.slice(0, 150)}`);
}

function runIngest() {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/ingest_books.mjs", "--skip-sanitize"], {
      cwd: join(__dirname, ".."),
      stdio: "inherit",
      shell: true,
      env: { ...process.env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  for (const p of [join(__dirname, "../.env.local"), join(__dirname, "../../crawler/.env")]) {
    await loadEnvFile(p);
  }
  const apiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  if (!apiKey) {
    console.error("Manca GEMINI_API_KEY");
    process.exit(1);
  }

  await log(`Watcher avviato (check ogni ${Math.round(INTERVAL / 60000)} min)`);

  while (true) {
    try {
      const ok = await testEmbed(apiKey);
      if (!ok) {
        await log("Quota embedding ancora esaurita — attendo...");
        await new Promise((r) => setTimeout(r, INTERVAL));
        continue;
      }
      await log("Quota OK — avvio ingest --skip-sanitize");
      try {
        await unlink(join(__dirname, ".ingest_books.lock"));
      } catch {
        /* */
      }
      const code = await runIngest();
      await log(`Ingest terminato con exit code ${code}`);
      if (code === 0) {
        await log("Completato con successo. Watcher esce.");
        process.exit(0);
      }
      await log("Ingest non completato — nuovo tentativo dopo pausa");
    } catch (e) {
      await log(`Errore watcher: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
