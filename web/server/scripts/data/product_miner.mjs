#!/usr/bin/env node
/**
 * Product Mining — etichette PDF/immagine → JSON strutturato → Supabase prodotti_mercato
 *
 * Pipeline: Ingestion → Gemini Analysis → Validation → DB Insert (+ match interventi)
 *
 * Uso (da web/):
 *   node server/scripts/data/product_miner.mjs
 *   node server/scripts/data/product_miner.mjs --dir server/scripts/etichette
 *   node server/scripts/data/product_miner.mjs --file path/etichetta.pdf --dry-run
 *
 * Env (web/.env.local):
 *   GEMINI_API_KEY o API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createRequire } from "module";
import { createHash } from "crypto";
import { readFile, readdir, stat } from "fs/promises";
import { join, dirname, extname, basename } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "../../..");
const DEFAULT_INPUT_DIR = join(WEB_ROOT, "server/scripts/etichette");

const CHAT_MODEL = process.env.PRODUCT_MINER_MODEL || "gemini-2.5-flash";
const GEMINI_SLEEP_MS = Number(process.env.PRODUCT_MINER_SLEEP_MS || 4000);

export const CATEGORIE_AGRONOMICHE = [
  "Biostimolante",
  "Concime NPK",
  "Correttivo",
  "Fungicida",
  "Diserbante",
  "Insetticida",
  "Bagnante",
  "Semente",
  "Altro",
];

const CATEGORIA_TO_MACRO = {
  Biostimolante: "Biostimolante",
  "Concime NPK": "N",
  Correttivo: "Correttivo",
  Fungicida: "Fungicida",
  Diserbante: "Diserbante",
  Insetticido: "Insetticida",
  Bagnante: "Bagnante",
  Semente: "Semente",
  Altro: "Altro",
};

const CATEGORIA_TO_INTERVENTO = {
  Biostimolante: "biostimolante",
  "Concime NPK": "concime",
  Correttivo: "trattamento",
  Fungicida: "trattamento",
  Diserbante: "diserbo",
  Insetticido: "trattamento",
  Bagnante: "umettante",
  Semente: "rinnovo",
  Altro: "altro",
};

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const PDF_EXT = new Set([".pdf"]);
const TEXT_EXT = new Set([".txt", ".md"]);

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

function getApiKey() {
  const k = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!k?.trim()) throw new Error("GEMINI_API_KEY mancante in web/.env.local");
  return k.trim();
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richiesti");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mimeForExt(ext) {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  if (e === ".bmp") return "image/bmp";
  return "image/jpeg";
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function geminiGenerate(apiKey, parts, { json = true, temperature = 0.2, maxOutputTokens = 4096 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const out =
    data?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
  if (!out.trim()) throw new Error("Risposta Gemini vuota");
  return out;
}

const OCR_PROMPT = `Sei un OCR agronomico. Estrai TUTTO il testo leggibile dall'etichetta (nome prodotto, produttore, composizione %, avvertenze, certificazioni bio).
Rispondi SOLO con il testo grezzo in italiano, senza commenti.`;

const ANALYSIS_PROMPT = (rawText, fileName) => `Analizza il testo di un'etichetta fitofarmaco / concime / biostimolante per prato e giardino.

File: ${fileName}

Testo etichetta:
---
${rawText.slice(0, 12000)}
---

Estrai SOLO ciò che è dichiarato o chiaramente deducibile dall'etichetta. Non inventare molecole o percentuali.

Rispondi SOLO JSON valido con questa forma esatta:
{
  "prodotto": "Nome commerciale",
  "produttore": "Azienda o stringa vuota se assente",
  "categoria_agronomica": "una tra: Biostimolante, Concime NPK, Correttivo, Fungicida, Diserbante, Insetticido, Bagnante, Semente, Altro",
  "composizione_molecolare_dichiarata": ["es: 5% Acidi Fulvici", "2% Amminoacidi"],
  "target_fisiologico": "stress termico, radicazione, … (stringa breve o elenco)",
  "is_bio": true,
  "confidence_score": 0.85
}

is_bio: true solo se etichetta indica bio, CE bio, reg. 834/2007 o equivalente.`;

const CATALOG_ANALYSIS_PROMPT = (rawText, fileName, defaultBrand = "Bottos") => `Analizza un catalogo commerciale prato/giardino e estrai TUTTI i prodotti commerciali citati con nome distinto.

File: ${fileName}
Marca di default (se non indicata in scheda): ${defaultBrand}

Testo:
---
${rawText.slice(0, 14000)}
---

Per ogni prodotto distinto (fitofarmaco, concime, biostimolante, semente, correttivo, ammendante, umettante) estrai quanto dichiarato. Non inventare percentuali.
Se il produttore non è scritto, usa "${defaultBrand}".

Rispondi SOLO JSON:
{
  "prodotti": [
    {
      "prodotto": "Nome commerciale",
      "produttore": "${defaultBrand} o altra azienda se indicata",
      "categoria_agronomica": "una tra: Biostimolante, Concime NPK, Correttivo, Fungicida, Diserbante, Insetticido, Bagnante, Semente, Altro",
      "composizione_molecolare_dichiarata": ["principio attivo o NPK se noto"],
      "target_fisiologico": ["uso indicato"],
      "is_bio": false,
      "confidence_score": 0.7
    }
  ]
}

Massimo 50 prodotti in questo blocco, senza duplicati. Se il testo non contiene prodotti, "prodotti": [].`;

function isCatalogFileName(fileName) {
  return /calendario|bottos|verde|faceb|herbatech|catalogo/i.test(fileName);
}

function splitCatalogChunks(rawText, chunkSize = 12000, overlap = 1500) {
  const t = rawText.replace(/\r\n/g, "\n").trim();
  if (t.length <= chunkSize) return [t];
  const chunks = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + chunkSize, t.length);
    if (end < t.length) {
      const slice = t.slice(start, end);
      const br = slice.lastIndexOf("\n\n");
      if (br > chunkSize * 0.5) end = start + br;
    }
    chunks.push(t.slice(start, end));
    if (end >= t.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function dedupeCatalogProducts(products) {
  const seen = new Map();
  for (const p of products) {
    const key = `${(p.produttore || "").toLowerCase()}|${p.prodotto.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// 1. Ingestion
// ---------------------------------------------------------------------------

/**
 * @param {string} filePath
 * @param {string} apiKey
 * @returns {Promise<{ rawText: string, sourceType: 'pdf'|'image'|'text', buffer: Buffer }>}
 */
export async function ingestFile(filePath, apiKey) {
  const ext = extname(filePath).toLowerCase();
  const buffer = await readFile(filePath);

  if (PDF_EXT.has(ext)) {
    const parsed = await pdfParse(buffer);
    const rawText = String(parsed?.text || "").trim();
    if (rawText.length < 40) {
      throw new Error(`PDF con poco testo estratto (${rawText.length} char): ${basename(filePath)}`);
    }
    return { rawText, sourceType: "pdf", buffer };
  }

  if (TEXT_EXT.has(ext)) {
    const rawText = buffer.toString("utf8").trim();
    if (rawText.length < 20) throw new Error(`File testo troppo corto: ${basename(filePath)}`);
    return { rawText, sourceType: "text", buffer };
  }

  if (IMAGE_EXT.has(ext)) {
    const b64 = buffer.toString("base64");
    const mimeType = mimeForExt(ext);
    const ocr = await geminiGenerate(
      apiKey,
      [
        { text: OCR_PROMPT },
        { inlineData: { mimeType, data: b64 } },
      ],
      { json: false, temperature: 0.1 },
    );
    const rawText = ocr.trim();
    if (rawText.length < 30) {
      throw new Error(`OCR insufficiente su immagine: ${basename(filePath)}`);
    }
    return { rawText, sourceType: "image", buffer };
  }

  throw new Error(`Formato non supportato: ${ext}`);
}

// ---------------------------------------------------------------------------
// 2. Gemini Analysis
// ---------------------------------------------------------------------------

function parseCatalogJson(out) {
  const attempts = [
    () => JSON.parse(out),
    () => {
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no object");
      return JSON.parse(m[0]);
    },
    () => {
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no object");
      const fixed = m[0].replace(/,\s*([\]}])/g, "$1");
      return JSON.parse(fixed);
    },
  ];
  for (const fn of attempts) {
    try {
      const parsed = fn();
      if (Array.isArray(parsed?.prodotti)) return parsed;
    } catch {
      /* next */
    }
  }
  throw new Error("JSON catalogo non parsabile");
}

/**
 * @param {string} rawText
 * @param {string} fileName
 * @param {string} apiKey
 */
export async function analyzeCatalogText(rawText, fileName, apiKey, defaultBrand = "Bottos") {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await geminiGenerate(
        apiKey,
        [{ text: CATALOG_ANALYSIS_PROMPT(rawText, fileName, defaultBrand) }],
        { json: true, maxOutputTokens: 8192 },
      );
      const parsed = parseCatalogJson(out);
      const list = Array.isArray(parsed?.prodotti) ? parsed.prodotti : [];
      return list
        .map((p) => normalizeProductJson(p))
        .map((p) => prepareProductFromWeb(p, defaultBrand))
        .filter((p) => p.prodotto?.length >= 2);
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await sleep(2000);
    }
  }
  throw lastErr;
}

export async function analyzeCatalogTextChunked(rawText, fileName, apiKey, defaultBrand = "Bottos") {
  const chunks = splitCatalogChunks(rawText);
  const all = [];
  for (let c = 0; c < chunks.length; c++) {
    console.log(`  [Gemini] blocco catalogo ${c + 1}/${chunks.length} (${chunks[c].length} car.)`);
    try {
      await sleep(GEMINI_SLEEP_MS);
      const part = await analyzeCatalogText(chunks[c], `${fileName}#chunk${c + 1}`, apiKey, defaultBrand);
      all.push(...part);
      console.log(`  [Gemini] +${part.length} (tot grezzo ${all.length})`);
    } catch (e) {
      console.warn(`  [Warn] blocco ${c + 1}/${chunks.length} saltato: ${e.message}`);
    }
  }
  return dedupeCatalogProducts(all);
}

export async function analyzeLabelText(rawText, fileName, apiKey) {
  const out = await geminiGenerate(
    apiKey,
    [{ text: ANALYSIS_PROMPT(rawText, fileName) }],
    { json: true },
  );
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("JSON Gemini non parsabile");
    parsed = JSON.parse(m[0]);
  }
  return normalizeProductJson(parsed);
}

export function normalizeProductJson(obj) {
  const composizione = Array.isArray(obj?.composizione_molecolare_dichiarata)
    ? obj.composizione_molecolare_dichiarata.map((s) => String(s).trim()).filter(Boolean)
    : typeof obj?.composizione_molecolare_dichiarata === "string"
      ? obj.composizione_molecolare_dichiarata
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  let targets = [];
  if (Array.isArray(obj?.target_fisiologico)) {
    targets = obj.target_fisiologico.map((s) => String(s).trim()).filter(Boolean);
  } else if (obj?.target_fisiologico) {
    targets = String(obj.target_fisiologico)
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let cat = String(obj?.categoria_agronomica || "Altro").trim();
  if (!CATEGORIE_AGRONOMICHE.includes(cat)) {
    const lower = cat.toLowerCase();
    const hit = CATEGORIE_AGRONOMICHE.find((c) => c.toLowerCase() === lower);
    cat = hit || "Altro";
  }

  const conf = Number(obj?.confidence_score);
  return {
    prodotto: String(obj?.prodotto || "").trim(),
    produttore: String(obj?.produttore || "").trim() || null,
    categoria_agronomica: cat,
    composizione_molecolare_dichiarata: composizione,
    target_fisiologico: targets,
    is_bio: Boolean(obj?.is_bio),
    confidence_score: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : null,
  };
}

// ---------------------------------------------------------------------------
// 3. Validation
// ---------------------------------------------------------------------------

/**
 * @param {ReturnType<typeof normalizeProductJson>} product
 * @returns {{ status: 'valid'|'warning'|'rejected', notes: string[] }}
 */
export function validateProduct(product) {
  const notes = [];

  if (!product.prodotto || product.prodotto.length < 2) {
    notes.push("Nome prodotto mancante o troppo corto");
  }
  if (!product.produttore) {
    notes.push("Produttore non indicato");
  }
  if (!CATEGORIE_AGRONOMICHE.includes(product.categoria_agronomica)) {
    notes.push(`Categoria non valida: ${product.categoria_agronomica}`);
  }
  if (!product.composizione_molecolare_dichiarata?.length) {
    notes.push("Composizione molecolare dichiarata vuota");
  } else if (product.composizione_molecolare_dichiarata.length === 1 && /^Prodotto:/i.test(product.composizione_molecolare_dichiarata[0])) {
    /* catalogo legacy: accettato come warning implicito */
  }
  if (!product.target_fisiologico?.length) {
    notes.push("Target fisiologico non dedotto");
  }

  const compJoined = product.composizione_molecolare_dichiarata.join(" ").toLowerCase();
  if (product.categoria_agronomica === "Concime NPK") {
    const hasNpk = /(\bn\b|\bp\b|\bk\b|azoto|fosforo|potassio|npk)/i.test(compJoined);
    if (!hasNpk) notes.push("Concime NPK senza elementi N/P/K evidenti in composizione");
  }

  const hasHardError = notes.some(
    (n) =>
      n.startsWith("Nome prodotto") ||
      n.startsWith("Categoria non valida") ||
      n.startsWith("Composizione molecolare dichiarata vuota"),
  );

  if (hasHardError) return { status: "rejected", notes };
  if (notes.length) return { status: "warning", notes };
  return { status: "valid", notes: [] };
}

// ---------------------------------------------------------------------------
// 4. Match interventi template
// ---------------------------------------------------------------------------

function tokenize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/**
 * @param {object} product normalized product
 * @param {Array<{ id: number, titolo: string, categoria: string, macro_categoria: string|null, esigenze_molecolari: string[], fabbisogno_fisiologico: string }>} interventi
 */
export function scoreInterventoMatch(product, intervento) {
  const wantCat = CATEGORIA_TO_INTERVENTO[product.categoria_agronomica] || "altro";
  let score = 0;
  const reasons = [];

  if (intervento.categoria === wantCat) {
    score += 0.25;
    reasons.push(`categoria=${wantCat}`);
  }

  const macro = CATEGORIA_TO_MACRO[product.categoria_agronomica];
  if (macro && intervento.macro_categoria === macro) {
    score += 0.2;
    reasons.push(`macro=${macro}`);
  }

  const blob = [
    product.prodotto,
    product.produttore,
    ...product.composizione_molecolare_dichiarata,
    ...product.target_fisiologico,
    intervento.titolo,
    intervento.fabbisogno_fisiologico,
    ...(intervento.esigenze_molecolari || []),
  ]
    .join(" ")
    .toLowerCase();

  const prodTokens = new Set([
    ...tokenize(product.composizione_molecolare_dichiarata.join(" ")),
    ...tokenize(product.target_fisiologico.join(" ")),
  ]);

  const interTokens = tokenize(
    `${intervento.titolo} ${intervento.fabbisogno_fisiologico} ${(intervento.esigenze_molecolari || []).join(" ")}`,
  );

  let overlap = 0;
  for (const t of interTokens) {
    if (prodTokens.has(t) || blob.includes(t)) overlap++;
  }
  if (interTokens.length) {
    const lex = Math.min(0.45, (overlap / Math.max(interTokens.length, 1)) * 0.45);
    if (lex > 0.05) {
      score += lex;
      reasons.push(`token_overlap=${overlap}`);
    }
  }

  return { score: Math.min(1, score), reason: reasons.join("; ") || "debole" };
}

export async function fetchInterventiTemplate(admin) {
  const { data, error } = await admin
    .from("calendario_base_intervento")
    .select("id, titolo, categoria, macro_categoria, esigenze_molecolari, fabbisogno_fisiologico")
    .eq("attivo", true)
    .limit(500);
  if (error) throw new Error(`calendario_base_intervento: ${error.message}`);
  return data || [];
}

export function matchInterventi(product, interventi, { minScore = 0.35, maxMatches = 8 } = {}) {
  const scored = interventi
    .map((i) => {
      const { score, reason } = scoreInterventoMatch(product, i);
      return { intervento_id: i.id, match_score: score, match_reason: reason };
    })
    .filter((m) => m.match_score >= minScore)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, maxMatches);
  return scored;
}

// ---------------------------------------------------------------------------
// 5. DB Insert
// ---------------------------------------------------------------------------

export function toDbRow(product, meta) {
  const macro = CATEGORIA_TO_MACRO[product.categoria_agronomica] || "Altro";
  const catInt = CATEGORIA_TO_INTERVENTO[product.categoria_agronomica] || "altro";
  return {
    prodotto: product.prodotto,
    produttore: product.produttore,
    categoria_agronomica: product.categoria_agronomica,
    composizione_molecolare_dichiarata: product.composizione_molecolare_dichiarata,
    target_fisiologico: product.target_fisiologico,
    is_bio: product.is_bio,
    macro_categoria: macro,
    categoria_intervento: catInt,
    source_type: meta.sourceType,
    source_file: meta.sourceFile,
    source_hash: meta.sourceHash,
    raw_text_excerpt: meta.rawTextExcerpt,
    extracted_json: meta.extractedJson,
    gemini_model: CHAT_MODEL,
    confidence_score: product.confidence_score,
    validation_status: meta.validationStatus,
    validation_notes: meta.validationNotes,
    ingest_batch_id: meta.ingestBatchId || null,
    attivo: meta.validationStatus !== "rejected",
  };
}

export function prepareProductFromWeb(product, defaultBrand) {
  const p = { ...product };
  if (!p.produttore?.trim() && defaultBrand) p.produttore = defaultBrand;
  if (!p.composizione_molecolare_dichiarata?.length && p.prodotto) {
    p.composizione_molecolare_dichiarata = [`Scheda commerciale: ${p.prodotto}`];
  }
  if (!p.target_fisiologico?.length) {
    p.target_fisiologico = ["Manutenzione prato e tappeto erboso"];
  }
  return p;
}

export async function persistProduct(product, ctx) {
  const { admin, dryRun, ingestBatchId, sourceType, sourceFile, sourceHash, rawTextExcerpt, interventi } = ctx;

  const { status, notes } = validateProduct(product);
  if (status === "rejected") {
    console.log(`  [Reject] ${product.prodotto}: ${notes.join("; ")}`);
    return { ok: false, status, notes, product };
  }

  if (!dryRun && admin) {
    const { data: existing } = await admin
      .from("prodotti_mercato")
      .select("id, prodotto")
      .eq("source_hash", sourceHash)
      .maybeSingle();
    if (existing?.id) {
      console.log(`  [Skip] ${product.prodotto} (hash esistente)`);
      return { ok: true, skipped: true, id: existing.id, product, status };
    }
  }

  const matches = matchInterventi(product, interventi);
  const row = toDbRow(product, {
    sourceType,
    sourceFile,
    sourceHash,
    rawTextExcerpt,
    extractedJson: product,
    validationStatus: status,
    validationNotes: notes,
    ingestBatchId,
  });

  if (dryRun) {
    return { ok: true, dryRun: true, matches, product, status };
  }

  const { data: inserted, error } = await admin.from("prodotti_mercato").insert(row).select("id").single();
  if (error) throw new Error(`insert prodotti_mercato: ${error.message}`);

  if (matches.length) {
    const links = matches.map((m) => ({
      prodotto_mercato_id: inserted.id,
      calendario_base_intervento_id: m.intervento_id,
      match_score: m.match_score,
      match_reason: m.match_reason,
      match_auto: true,
    }));
    const { error: linkErr } = await admin.from("prodotti_mercato_intervento").insert(links);
    if (linkErr) console.warn(`  [Warn] link: ${linkErr.message}`);
  }

  console.log(`  [DB] ${product.prodotto} (${status})`);
  return { ok: true, id: inserted.id, matches, product, status };
}

/**
 * Pipeline completa su un file.
 */
export async function runPipeline(
  filePath,
  { admin, apiKey, dryRun = false, ingestBatchId = null, catalogMode = false, defaultBrand = "Bottos" },
) {
  const fileName = basename(filePath);
  const useCatalog = catalogMode || isCatalogFileName(fileName);
  console.log(`\n── ${fileName}${useCatalog ? " [catalogo]" : ""} ──`);

  const { rawText, sourceType, buffer } = await ingestFile(filePath, apiKey);
  console.log(`  [Ingestion] ${sourceType}, ${rawText.length} caratteri`);

  const interventi = dryRun || !admin ? [] : await fetchInterventiTemplate(admin);
  const fileHash = sha256(buffer);

  if (useCatalog) {
    const products =
      rawText.length > 15000
        ? await analyzeCatalogTextChunked(rawText, fileName, apiKey, defaultBrand)
        : await (async () => {
            await sleep(GEMINI_SLEEP_MS);
            return analyzeCatalogText(rawText, fileName, apiKey, defaultBrand);
          })();
    console.log(`  [Gemini] ${products.length} prodotti estratti (unici)`);
    if (!products.length) return { ok: false, fileName, inserted: 0, rejected: 1, catalog: true };

    let inserted = 0;
    let rejected = 0;
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const sourceHash = sha256(`${fileHash}:${i}:${product.prodotto}`);
      const r = await persistProduct(product, {
        admin,
        dryRun,
        ingestBatchId,
        sourceType: "pdf",
        sourceFile: `${fileName}#${i + 1}`,
        sourceHash,
        rawTextExcerpt: rawText.slice(0, 800),
        interventi,
      });
      if (r.ok && !r.skipped) inserted++;
      if (r.status === "rejected") rejected++;
      await sleep(Math.min(GEMINI_SLEEP_MS, 2500));
    }
    return { ok: true, fileName, inserted, rejected, catalog: true };
  }

  await sleep(GEMINI_SLEEP_MS);
  const product = await analyzeLabelText(rawText, fileName, apiKey);
  console.log(`  [Gemini] ${product.prodotto} — ${product.categoria_agronomica}`);

  const r = await persistProduct(product, {
    admin,
    dryRun,
    ingestBatchId,
    sourceType,
    sourceFile: fileName,
    sourceHash: fileHash,
    rawTextExcerpt: rawText.slice(0, 2000),
    interventi,
  });
  if (!r.ok) return { ok: false, fileName, ...r };
  return { ok: true, fileName, inserted: r.skipped ? 0 : 1, ...r };
}

async function listFiles(dir) {
  const names = await readdir(dir);
  const out = [];
  for (const n of names) {
    const p = join(dir, n);
    const st = await stat(p);
    if (st.isFile()) out.push(p);
  }
  return out.sort();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const catalogMode = args.includes("--catalog");
  const brandIdx = args.indexOf("--brand");
  const defaultBrand = brandIdx >= 0 ? args[brandIdx + 1] : "Bottos";
  const fileIdx = args.indexOf("--file");
  const dirIdx = args.indexOf("--dir");

  await loadEnvFile(join(WEB_ROOT, ".env.local"));
  await loadEnvFile(join(WEB_ROOT, "../crawler/.env"));

  const apiKey = getApiKey();
  const admin = dryRun ? null : getSupabaseAdmin();

  const inputDir = dirIdx >= 0 ? args[dirIdx + 1] : DEFAULT_INPUT_DIR;
  const files =
    fileIdx >= 0
      ? [args[fileIdx + 1]]
      : await listFiles(inputDir).catch(() => {
          throw new Error(`Cartella input assente: ${inputDir} — creala o usa --file`);
        });

  const supported = files.filter((f) => {
    const e = extname(f).toLowerCase();
    return PDF_EXT.has(e) || IMAGE_EXT.has(e) || TEXT_EXT.has(e);
  });

  if (!supported.length) {
    console.log(`Nessun PDF/immagine in ${inputDir}`);
    process.exit(0);
  }

  let batchId = null;
  if (!dryRun && admin) {
    const { data: batch, error } = await admin
      .from("prodotti_mercato_ingest_batch")
      .insert({
        label: `mine ${new Date().toISOString()}`,
        files_total: supported.length,
      })
      .select("id")
      .single();
    if (!error) batchId = batch.id;
  }

  let ok = 0;
  let rejected = 0;
  for (const f of supported) {
    try {
      const r = await runPipeline(f, {
        admin,
        apiKey,
        dryRun,
        ingestBatchId: batchId,
        catalogMode: catalogMode || isCatalogFileName(basename(f)),
        defaultBrand,
      });
      if (r.ok) ok += r.inserted ?? (r.skipped ? 0 : 1);
      if (r.status === "rejected" || r.rejected) rejected += r.rejected ?? 1;
      await sleep(GEMINI_SLEEP_MS);
    } catch (e) {
      console.error(`  [ERR] ${basename(f)}: ${e.message}`);
      rejected++;
    }
  }

  if (batchId && admin) {
    await admin
      .from("prodotti_mercato_ingest_batch")
      .update({
        files_ok: ok,
        files_rejected: rejected,
        finished_at: new Date().toISOString(),
      })
      .eq("id", batchId);
  }

  console.log(`\nFine: ${ok} ok, ${rejected} errori/rejected su ${supported.length} file`);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") ===
    process.argv[1].replace(/\\/g, "/");

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
