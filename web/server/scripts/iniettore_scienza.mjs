#!/usr/bin/env node
/**
 * Iniettore Scienza — knowledge_base_raw.json → embedding Gemini → tgif_knowledge_base
 *
 * Uso (da web/):
 *   node server/scripts/iniettore_scienza.mjs
 *   node server/scripts/iniettore_scienza.mjs --dry-run --limit 3
 *   node server/scripts/iniettore_scienza.mjs --from-chunk 500
 *
 * Env: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (in web/.env.local o crawler/.env)
 */

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = join(__dirname, "knowledge_base_raw.json");

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DELAY_MS = Math.max(500, Number(process.env.INIETTORE_EMBED_MS || 500));
const MAX_RETRIES = 3;
const FONTE_PREFIX = "fonte_scientifica_openalex";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

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

async function loadConfig() {
  const candidates = [
    join(__dirname, "../../.env.local"),
    join(__dirname, "../../../crawler/.env"),
    join(__dirname, "../../.env"),
  ];
  for (const p of candidates) await loadEnvFile(p);

  const geminiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    ""
  ).trim();

  if (!geminiKey) throw new Error("Manca GEMINI_API_KEY in web/.env.local o crawler/.env");
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Mancano SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  }

  return { geminiKey, supabaseUrl, supabaseKey };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function chunkDbKey(doi, chunkIndex) {
  return `${doi}|${chunkIndex}`;
}

function soluzioneHash(soluzione) {
  return createHash("sha256").update(String(soluzione || "")).digest("hex");
}

function parseMetadata(soluzione) {
  const m = String(soluzione || "").match(/metadata:(\{[\s\S]*\})\s*$/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function formattaSoluzioneRag(chunk) {
  const metadata = {
    fonte: FONTE_PREFIX,
    doi: chunk.doi,
    titolo: chunk.titolo,
    anno: chunk.anno ?? null,
    chunk_index: chunk.chunk_index,
    query_origine: chunk.query_origine ?? null,
    open_access: true,
  };
  return `[${FONTE_PREFIX}:${chunk.doi}]\n${chunk.text}\n\n---\nmetadata:${JSON.stringify(metadata)}`;
}

function inferPatologia(testo) {
  const t = String(testo || "").toLowerCase();
  if (/pythium|rhizoctonia|dollar spot|oidio|fusarium|patogen|fungh|mildew/.test(t)) {
    return "patologia_fungina";
  }
  if (/nutriz|azoto|fosfor|potass|cloros|npk|fertil|humic|fulvic|amino acid/.test(t)) {
    return "nutrizione_tappeto";
  }
  if (/irrig|idric|evapotraspir|siccit|stress idric|drought/.test(t)) return "gestione_idrica";
  if (/mycorrhiz|rhizosphere|microbial|soil microbi/.test(t)) return "suolo_e_rizosfera";
  if (/taglio|mower|thatch|scarific|ariegg|turfgrass/.test(t)) return "cultura_tappeto_erboso";
  return "biochimica_tappeto_erboso";
}

function isQuotaExhausted(msg) {
  const m = String(msg || "").toLowerCase();
  return /429|quota|resource_exhausted|rate limit/i.test(m);
}

async function loadExistingScienceKeys(admin) {
  const keys = new Set();
  const hashes = new Set();
  let from = 0;
  const pageSize = 500;

  while (true) {
    const { data, error } = await admin
      .from("tgif_knowledge_base")
      .select("soluzione")
      .ilike("soluzione", `%[${FONTE_PREFIX}:%`)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Lettura KB esistente: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      hashes.add(soluzioneHash(row.soluzione));
      const meta = parseMetadata(row.soluzione);
      if (meta?.doi != null && meta.chunk_index != null) {
        keys.add(chunkDbKey(meta.doi, meta.chunk_index));
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { keys, hashes };
}

function createEmbedClient(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  return model;
}

async function embedChunk(model, text) {
  const input = String(text || "").slice(0, 8000);
  const result = await model.embedContent({
    content: { role: "user", parts: [{ text: input }] },
  });
  const values = result?.embedding?.values;
  if (!Array.isArray(values) || values.length < 100) {
    throw new Error("Embedding vuoto o dimensione inattesa");
  }
  return values;
}

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      if (isQuotaExhausted(msg)) {
        const err = new Error(msg);
        err.code = "QUOTA_EXCEEDED";
        throw err;
      }
      if (/429|503|timeout|rate/i.test(msg) && attempt < MAX_RETRIES) {
        const backoff = Math.min(attempt * 8000, 45_000);
        console.warn(`  ↻ retry ${attempt}/${MAX_RETRIES} ${label} — ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipExisting = !args.includes("--no-skip-existing");
  const fromChunk = Math.max(1, parseInt(argValue(args, "--from-chunk") || "1", 10) || 1);
  const limit = argValue(args, "--limit");
  const maxChunks = limit ? Math.max(1, parseInt(limit, 10) || 1) : Infinity;

  console.log("=== Iniettore Scienza → tgif_knowledge_base ===");
  console.log(`Input:  ${INPUT_PATH}`);
  console.log(`Model:  ${EMBED_MODEL} (@google/generative-ai)`);
  console.log(`Delay:  ${EMBED_DELAY_MS}ms tra embedding`);
  console.log(`Dry-run: ${dryRun} | skip-existing: ${skipExisting}\n`);

  const rawJson = await readFile(INPUT_PATH, "utf8");
  const payload = JSON.parse(rawJson);
  let chunks = Array.isArray(payload?.chunks) ? payload.chunks : [];
  if (!chunks.length) throw new Error("Nessun chunk in knowledge_base_raw.json");

  if (fromChunk > 1) chunks = chunks.filter((c) => (c.chunk_index ?? 0) + 1 >= fromChunk);
  if (Number.isFinite(maxChunks)) chunks = chunks.slice(0, maxChunks);

  const total = chunks.length;
  console.log(`Chunk da processare: ${total} (su ${payload?.meta?.total_chunks ?? "?"} nel file)\n`);

  const { geminiKey, supabaseUrl, supabaseKey } = await loadConfig();
  const admin = createClient(supabaseUrl, supabaseKey);
  const embedModel = createEmbedClient(geminiKey);

  let existing = { keys: new Set(), hashes: new Set() };
  if (skipExisting && !dryRun) {
    process.stdout.write("Indice chunk scientifici già in DB... ");
    existing = await loadExistingScienceKeys(admin);
    console.log(`${existing.keys.size} chiavi, ${existing.hashes.size} hash\n`);
  }

  const hashVisti = new Set(existing.hashes);
  const stats = { inseriti: 0, saltati: 0, giaDb: 0, errori: 0, quotaStop: false };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const n = i + 1;
    const titoloBreve =
      String(chunk.titolo || "Senza titolo").length > 70
        ? `${String(chunk.titolo).slice(0, 67)}…`
        : chunk.titolo || "Senza titolo";
    const dbKey = chunkDbKey(chunk.doi, chunk.chunk_index);

    if (skipExisting && existing.keys.has(dbKey)) {
      stats.giaDb += 1;
      console.log(`⏭️  Chunk ${n} di ${total}: già in DB — ${titoloBreve}`);
      continue;
    }

    const soluzione = formattaSoluzioneRag(chunk);
    const hash = soluzioneHash(soluzione);
    if (hashVisti.has(hash)) {
      stats.saltati += 1;
      console.log(`⏭️  Chunk ${n} di ${total}: duplicato hash — ${titoloBreve}`);
      continue;
    }

    if (dryRun) {
      console.log(`✅ [dry-run] Chunk ${n} di ${total}: ${titoloBreve}`);
      hashVisti.add(hash);
      stats.inseriti += 1;
      continue;
    }

    let embedding;
    try {
      embedding = await withRetry(() => embedChunk(embedModel, soluzione), "embed");
      await sleep(EMBED_DELAY_MS);
    } catch (e) {
      if (e.code === "QUOTA_EXCEEDED" || isQuotaExhausted(e.message)) {
        console.error(`\n⚠️  Quota Gemini esaurita al chunk ${n}/${total}. Interruzione.`);
        stats.quotaStop = true;
        break;
      }
      console.error(`❌ Chunk ${n} di ${total}: embedding fallito — ${e.message}`);
      stats.errori += 1;
      continue;
    }

    const row = {
      patologia: inferPatologia(chunk.text),
      specie: "tappeto_erboso",
      soluzione,
      embedding,
    };

    const { error } = await admin.from("tgif_knowledge_base").insert(row);
    if (error) {
      console.error(`❌ Chunk ${n} di ${total}: insert — ${error.message}`);
      stats.errori += 1;
      continue;
    }

    hashVisti.add(hash);
    existing.keys.add(dbKey);
    stats.inseriti += 1;
    console.log(`✅ Iniettato chunk ${n} di ${total}: ${titoloBreve}`);
  }

  console.log("\n=== Riepilogo ===");
  console.log(`Inseriti:   ${stats.inseriti}`);
  console.log(`Già in DB:  ${stats.giaDb}`);
  console.log(`Saltati:    ${stats.saltati}`);
  console.log(`Errori:     ${stats.errori}`);
  if (stats.quotaStop) console.log("Stop per quota API — riprendi con --from-chunk <n>");
  if (dryRun) console.log("(dry-run: nessuna riga scritta)");
}

main().catch((e) => {
  console.error("\n[ERRORE FATALE]", e.message);
  process.exit(1);
});
