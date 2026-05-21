#!/usr/bin/env node
/**
 * Ingest manuali universitari Turfgrass (PDF) → tgif_knowledge_base (RAG Supabase).
 *
 * Flusso: PDF → chunk 600-800 parole → Gemini Flash (sanitizza/traduci IT) → embedding → insert.
 *
 * Uso:
 *   cd web
 *   npm install
 *   node scripts/ingest_books.mjs
 *
 * Env (crawler/.env o web/.env.local):
 *   GEMINI_API_KEY o API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY o SUPABASE_KEY
 *
 * Opzioni:
 *   --dry-run              Nessun insert Supabase
 *   --skip-sanitize        Salta Gemini (solo test PDF/chunk)
 *   --book <substring>     Solo un libro
 *   --from-chunk <n>       Riprendi dal chunk n (1-based)
 *   --no-skip-existing     Non saltare chunk già in DB
 *   --force                Ignora lock se un altro ingest è attivo
 */

import { createRequire } from "module";
import { readFile, readdir, writeFile, unlink } from "fs/promises";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  MIN_WORDS_IT,
  chunkDbKey,
  isGeminiRifiutoAgronomia,
  parseLibroMetadata,
  soluzioneHash,
} from "./ingest_kb_shared.mjs";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRI_DIR = join(__dirname, "libri");
const LOCK_FILE = join(__dirname, ".ingest_books.lock");

const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";

const MIN_WORDS = 600;
const MAX_WORDS = 800;
const OVERLAP_WORDS = 80;
const SANITIZE_SLEEP_MS = Number(process.env.INGEST_SANITIZE_MS || 2800);
const EMBED_SLEEP_MS = Number(process.env.INGEST_EMBED_MS || 600);
const MAX_RETRIES = 4;

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
    /* file assente */
  }
}

async function loadConfig() {
  const candidates = [
    join(__dirname, "../.env.local"),
    join(__dirname, "../../crawler/.env"),
    join(__dirname, "../.env"),
  ];
  for (const p of candidates) await loadEnvFile(p);

  const geminiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    ""
  ).trim();

  if (!geminiKey) throw new Error("Manca GEMINI_API_KEY o API_KEY in crawler/.env o web/.env.local");
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Mancano SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_KEY)");
  }

  return { geminiKey, supabaseUrl, supabaseKey };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Gemini (stessa API di pianoStagionale.mjs)
// ---------------------------------------------------------------------------

async function geminiEmbed(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
    }),
  });
  if (!res.ok) throw new Error(`Embedding ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length < 100) {
    throw new Error("Embedding vuoto o dimensione inattesa");
  }
  return values;
}

async function geminiGenerate(apiKey, text, opts = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.25,
        maxOutputTokens: opts.maxTokens ?? 4096,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
  if (!out.trim()) throw new Error("Risposta Gemini vuota");
  return out.trim();
}

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      const backoff = attempt * 4000;
      if (/429|503|quota|rate|timeout/i.test(msg) && attempt < MAX_RETRIES) {
        console.warn(`  [retry ${attempt}/${MAX_RETRIES}] ${label}: ${msg.slice(0, 80)} — attendo ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// PDF e chunking
// ---------------------------------------------------------------------------

function pulisciTestoPdf(raw) {
  return String(raw || "")
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function estraiTestoPdf(filePath) {
  const buf = await readFile(filePath);
  const data = await pdfParse(buf, { max: 0 });
  const pages = data.numpages ?? "?";
  const text = pulisciTestoPdf(data.text);
  return { text, pages, info: data.info };
}

function chunkByWords(text, minWords = MIN_WORDS, maxWords = MAX_WORDS, overlap = OVERLAP_WORDS) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 120) return [];

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    const slice = words.slice(start, end);
    if (slice.length < 120 && chunks.length > 0) break;
    if (slice.length >= 120) {
      chunks.push(slice.join(" "));
    }
    if (end >= words.length) break;
    start += maxWords - overlap;
  }

  return chunks;
}

function titoloLibro(filename) {
  return basename(filename, ".pdf")
    .replace(/_ \(z-library[^)]*\)/i, "")
    .replace(/_/g, " ")
    .trim()
    .slice(0, 120);
}

function buildSanitizePrompt(chunk) {
  return `Sei un redattore tecnico agronomico italiano. Compito: estrarre e riscrivere in italiano SOLO contenuto agronomico utile per gestione tappeti erbosi (fisiologia, suolo, acqua, nutrienti, patogeni, sintomi, clima, pratiche meccaniche).

REGOLE TASSATIVE:
- Vietato nominare pesticidi, erbicidi o fungicidi commerciali (USA o altri).
- NON scrivere preamboli, disclaimer, "come agronomo", "il testo fornito", "non contiene agronomia", "regole tassative", "certo ecco", saluti ai colleghi.
- NON commentare il chunk: scrivi direttamente il riassunto tecnico, come un articolo di agronomia.
- Se il brano è solo chimica generica senza legame al prato, rispondi esattamente con una sola riga: SKIP_NO_AGRONOMY

Testo sorgente (inglese):
${chunk.slice(0, 12000)}`;
}

function formattaSoluzioneRag(libro, chunkIndex, testoPulito, metadata) {
  const metaLine = JSON.stringify(metadata);
  return `[libro_universitario:${libro}]\n${testoPulito}\n\n---\nmetadata:${metaLine}`;
}

function inferPatologia(testo) {
  const t = testo.toLowerCase();
  if (/pythium|rhizoctonia|dollar spot|oidio|fusarium|patogen|fungh|mildew/.test(t)) {
    return "patologia_fungina";
  }
  if (/nutriz|azoto|fosfor|potass|cloros|npk|fertil/.test(t)) return "nutrizione_tappeto";
  if (/irrig|idric|evapotraspir|siccit|stress idric/.test(t)) return "gestione_idrica";
  if (/taglio|mower|altezza|thatch|feltro|scarific|ariegg/.test(t)) return "manutenzione_meccanica";
  if (/seme|germin|overseed|establishment|turfgrass species/.test(t)) return "specie_e_semina";
  return "cultura_tappeto_erboso";
}

// ---------------------------------------------------------------------------
// Main ingest
// ---------------------------------------------------------------------------

async function listPdfFiles(bookFilter) {
  const entries = await readdir(LIBRI_DIR);
  let pdfs = entries.filter((f) => f.toLowerCase().endsWith(".pdf")).map((f) => join(LIBRI_DIR, f));
  if (bookFilter) {
    const needle = bookFilter.toLowerCase();
    pdfs = pdfs.filter((p) => basename(p).toLowerCase().includes(needle));
  }
  return pdfs.sort();
}

function processAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireIngestLock(force) {
  try {
    const raw = await readFile(LOCK_FILE, "utf8");
    const pid = parseInt(raw.trim(), 10);
    if (!processAlive(pid)) {
      await unlink(LOCK_FILE).catch(() => {});
    } else if (pid !== process.pid) {
      if (!force) {
        throw new Error(`Ingest già in esecuzione (PID ${pid}). Usa --force per sostituire.`);
      }
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* già terminato */
      }
      await sleep(800);
      await unlink(LOCK_FILE).catch(() => {});
    }
  } catch (e) {
    if (e.code === "ENOENT") {
      /* nessun lock */
    } else if (String(e.message || "").includes("già in esecuzione")) {
      throw e;
    } else if (e.code !== "ENOENT") {
      throw e;
    }
  }
  await writeFile(LOCK_FILE, String(process.pid), "utf8");
  const release = async () => {
    try {
      const raw = await readFile(LOCK_FILE, "utf8");
      if (parseInt(raw.trim(), 10) === process.pid) await unlink(LOCK_FILE);
    } catch {
      /* ok */
    }
  };
  process.on("exit", () => {
    release().catch(() => {});
  });
  process.on("SIGINT", () => {
    release().finally(() => process.exit(130));
  });
}

async function loadExistingIngested(admin) {
  const chunkKeys = new Set();
  const hashes = new Set();
  let from = 0;
  const pageSize = 500;

  while (true) {
    const { data, error } = await admin
      .from("tgif_knowledge_base")
      .select("soluzione")
      .ilike("soluzione", "%[libro_universitario:%")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      hashes.add(soluzioneHash(row.soluzione));
      const key = chunkDbKey(parseLibroMetadata(row.soluzione));
      if (key) chunkKeys.add(key);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { chunkKeys, hashes };
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipSanitize = args.includes("--skip-sanitize");
  const skipExisting = !args.includes("--no-skip-existing");
  const force = args.includes("--force");
  const bookFilter = argValue(args, "--book");
  const fromChunk = Math.max(1, parseInt(argValue(args, "--from-chunk") || "1", 10) || 1);

  await acquireIngestLock(force);

  const { geminiKey, supabaseUrl, supabaseKey } = await loadConfig();
  const admin = createClient(supabaseUrl, supabaseKey);

  const pdfs = await listPdfFiles(bookFilter);
  if (!pdfs.length) {
    console.error(`Nessun PDF in ${LIBRI_DIR}. Metti i manuali PDF in web/scripts/libri/`);
    process.exit(1);
  }

  let existing = { chunkKeys: new Set(), hashes: new Set() };
  if (skipExisting && !dryRun) {
    process.stdout.write("Carico indice chunk già in DB... ");
    existing = await loadExistingIngested(admin);
    console.log(`${existing.chunkKeys.size} chunk, ${existing.hashes.size} hash\n`);
  }

  console.log("=== Ingest manuali Turfgrass → tgif_knowledge_base ===");
  console.log(
    `Libri: ${pdfs.length} | dry-run: ${dryRun} | skip-sanitize: ${skipSanitize} | skip-existing: ${skipExisting}`,
  );
  console.log(
    `Chunk: ${MIN_WORDS}-${MAX_WORDS} parole | min IT: ${MIN_WORDS_IT} | pause sanitize ${SANITIZE_SLEEP_MS}ms embed ${EMBED_SLEEP_MS}ms`,
  );
  if (fromChunk > 1) console.log(`Riprendo da chunk >= ${fromChunk} (solo primo libro nel batch)\n`);
  else console.log("");

  const hashVisti = new Set(existing.hashes);
  const stats = {
    libri: 0,
    chunk: 0,
    inseriti: 0,
    saltati: 0,
    giaDb: 0,
    rifiutati: 0,
    errori: 0,
  };

  let applyFromChunk = fromChunk;

  for (let bi = 0; bi < pdfs.length; bi++) {
    const pdfPath = pdfs[bi];
    const libro = titoloLibro(basename(pdfPath));
    console.log(`\n[${bi + 1}/${pdfs.length}] ${libro}`);
    console.log(`  File: ${basename(pdfPath)}`);

    let pdfData;
    try {
      pdfData = await estraiTestoPdf(pdfPath);
      console.log(`  Pagine PDF: ${pdfData.pages} | caratteri: ${pdfData.text.length}`);
    } catch (e) {
      console.error(`  ERRORE lettura PDF: ${e.message}`);
      stats.errori += 1;
      continue;
    }

    if (pdfData.text.length < 500) {
      console.warn("  Testo troppo corto, salto.");
      continue;
    }

    const chunks = chunkByWords(pdfData.text);
    console.log(`  Chunk generati: ${chunks.length}`);
    stats.libri += 1;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunkIndex = ci + 1;
      if (bi === 0 && chunkIndex < applyFromChunk) continue;

      const chunkRaw = chunks[ci];
      stats.chunk += 1;
      const progress = `  [chunk ${chunkIndex}/${chunks.length}]`;
      const fileName = basename(pdfPath);
      const dbKey = `${fileName}|${chunkIndex}`;

      if (skipExisting && existing.chunkKeys.has(dbKey)) {
        console.log(`${progress} già in DB (${dbKey}), salto`);
        stats.giaDb += 1;
        continue;
      }

      let testoPulito = chunkRaw;
      if (!skipSanitize) {
        process.stdout.write(`${progress} sanitizzazione Gemini... `);
        try {
          const prompt = buildSanitizePrompt(chunkRaw);
          testoPulito = (
            await withRetry(
              () => geminiGenerate(geminiKey, prompt, { maxTokens: 3072, temperature: 0.2 }),
              "sanitize",
            )
          ).trim();

          if (isGeminiRifiutoAgronomia(testoPulito)) {
            console.log("SKIP — meta-commento o senza agronomia utile");
            stats.rifiutati += 1;
            await sleep(SANITIZE_SLEEP_MS);
            continue;
          }

          console.log(`OK (${testoPulito.split(/\s+/).length} parole IT)`);
          await sleep(SANITIZE_SLEEP_MS);
        } catch (e) {
          console.log(`FALLITO: ${e.message}`);
          stats.errori += 1;
          continue;
        }
      } else {
        console.log(`${progress} (skip sanitize) ${chunkRaw.slice(0, 60)}...`);
      }

      if (isGeminiRifiutoAgronomia(testoPulito)) {
        console.warn(`${progress} output non agronomico o troppo corto, salto`);
        stats.rifiutati += 1;
        continue;
      }

      const metadata = {
        fonte: "libro_universitario_turfgrass",
        libro,
        file: fileName,
        chunk_index: chunkIndex,
        chunk_total: chunks.length,
        parole_originali: chunkRaw.split(/\s+/).length,
        parole_italiano: testoPulito.split(/\s+/).length,
        sanitizzato_eu: true,
      };

      const soluzione = formattaSoluzioneRag(libro, chunkIndex, testoPulito, metadata);
      const hash = soluzioneHash(soluzione);
      if (hashVisti.has(hash)) {
        console.log(`${progress} duplicato hash, salto`);
        stats.saltati += 1;
        continue;
      }

      if (dryRun) {
        console.log(`${progress} [dry-run] ${testoPulito.slice(0, 100)}...`);
        hashVisti.add(hash);
        stats.inseriti += 1;
        continue;
      }

      process.stdout.write(`${progress} embedding... `);
      let embedding;
      try {
        embedding = await withRetry(() => geminiEmbed(soluzione, geminiKey), "embed");
        console.log(`dim ${embedding.length}`);
        await sleep(EMBED_SLEEP_MS);
      } catch (e) {
        console.log(`FALLITO: ${e.message}`);
        stats.errori += 1;
        continue;
      }

      const row = {
        patologia: inferPatologia(testoPulito),
        specie: "tappeto_erboso",
        soluzione,
        embedding,
      };

      process.stdout.write(`${progress} insert Supabase... `);
      const { error } = await admin.from("tgif_knowledge_base").insert(row);
      if (error) {
        console.log(`ERRORE: ${error.message}`);
        stats.errori += 1;
        continue;
      }

      hashVisti.add(hash);
      existing.chunkKeys.add(dbKey);
      stats.inseriti += 1;
      console.log("OK");
    }

    applyFromChunk = 1;
  }

  console.log("\n=== Riepilogo ===");
  console.log(`Libri processati: ${stats.libri}`);
  console.log(`Chunk elaborati:  ${stats.chunk}`);
  console.log(`Inseriti:         ${stats.inseriti}`);
  console.log(`Già in DB:        ${stats.giaDb}`);
  console.log(`Saltati:          ${stats.saltati}`);
  console.log(`Rifiutati (IA):   ${stats.rifiutati}`);
  console.log(`Errori:           ${stats.errori}`);
  if (dryRun) console.log("\n(dry-run: nessuna riga scritta su Supabase)");
}

main().catch((e) => {
  console.error("\n[FATAL]", e.message || e);
  process.exit(1);
});
