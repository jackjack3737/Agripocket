#!/usr/bin/env node
/**
 * Cacciatore Scienza — ingest paper open-access (OpenAlex) per RAG Solum.
 *
 * Uso (da cartella web/):
 *   node server/scripts/cacciatore_scienza.mjs
 *
 * Output: server/scripts/knowledge_base_raw.json
 */

import { writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "knowledge_base_raw.json");

const OPENALEX_BASE = "https://api.openalex.org/works";
const RATE_LIMIT_MS = 1000;
const PER_PAGE = 25;
const MAX_PAGES_PER_QUERY = 4;
const MAX_CHUNK_BODY_CHARS = 800;

/** Query mirate: tappeto erboso, suolo, biochimica nutrizionale. */
const QUERIES_RICERCA = [
  "turfgrass summer stress amino acids",
  "humic acid cation exchange capacity turf",
  "nitrogen slow release biochemistry poaceae",
  "mycorrhizae turfgrass root development",
  "turfgrass drought stress osmolytes potassium",
  "fulvic acid soil chelation micronutrients grass",
  "poaceae nitrogen uptake physiology turf",
  "turfgrass soil microbial community rhizosphere",
  "iron chlorosis turfgrass chelated micronutrients",
  "overseeding cool season grass establishment phosphorus",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ricostruisce l'abstract da abstract_inverted_index (formato OpenAlex). */
export function abstractDaOpenAlex(work) {
  const inv = work?.abstract_inverted_index;
  if (!inv || typeof inv !== "object") return null;

  let maxPos = -1;
  for (const positions of Object.values(inv)) {
    if (Array.isArray(positions)) {
      for (const p of positions) if (p > maxPos) maxPos = p;
    }
  }
  if (maxPos < 0) return null;

  const tokens = new Array(maxPos + 1);
  for (const [word, positions] of Object.entries(inv)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) tokens[p] = word;
  }
  return tokens.filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || null;
}

function normalizzaDoi(work) {
  const raw = work?.doi || work?.ids?.doi;
  if (!raw) return null;
  return String(raw)
    .replace(/^https?:\/\/doi\.org\//i, "")
    .trim()
    .toLowerCase();
}

function titoloDaWork(work) {
  const t = work?.title || work?.display_name;
  return t ? String(t).replace(/\s+/g, " ").trim() : null;
}

/**
 * Divide il testo in segmenti senza spezzare le frasi (fallback su parole).
 * @param {string} text
 * @param {number} maxLen lunghezza massima corpo chunk (escluso meta-tag)
 */
export function dividiTestoInBlocchi(text, maxLen = MAX_CHUNK_BODY_CHARS) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  if (normalized.length <= maxLen) return [normalized];

  const sentenceParts = normalized.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const chunks = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = "";
  };

  const pushWords = (segment) => {
    const words = segment.split(/\s+/).filter(Boolean);
    let part = "";
    for (const w of words) {
      const next = part ? `${part} ${w}` : w;
      if (next.length <= maxLen) {
        part = next;
      } else {
        if (part) chunks.push(part);
        if (w.length > maxLen) {
          for (let i = 0; i < w.length; i += maxLen) chunks.push(w.slice(i, i + maxLen));
          part = "";
        } else {
          part = w;
        }
      }
    }
    return part;
  };

  for (const sentence of sentenceParts) {
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (candidate.length <= maxLen) {
      buffer = candidate;
      continue;
    }
    flush();
    if (sentence.length <= maxLen) {
      buffer = sentence;
    } else {
      buffer = pushWords(sentence);
    }
  }
  flush();
  if (buffer.trim()) chunks.push(buffer.trim());

  return chunks.length ? chunks : [normalized.slice(0, maxLen)];
}

/**
 * Prepara chunk RAG con meta-tag obbligatorio.
 * @param {string} abstract
 * @param {string} titolo
 * @returns {string[]}
 */
export function preparaChunkPerRAG(abstract, titolo) {
  const body = String(abstract || "").trim();
  const title = String(titolo || "Senza titolo").trim() || "Senza titolo";
  if (!body) return [];

  const blocchi = dividiTestoInBlocchi(body, MAX_CHUNK_BODY_CHARS);
  const meta = `[Fonte Scientifica: ${title}] `;
  return blocchi.map((b) => `${meta}${b}`);
}

async function fetchOpenAlexPage(query, page = 1) {
  const url = new URL(OPENALEX_BASE);
  url.searchParams.set("search", query);
  url.searchParams.set("filter", "is_oa:true");
  url.searchParams.set("per-page", String(PER_PAGE));
  url.searchParams.set("page", String(page));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "AgriPocket-Solum/1.0 (mailto:support@agripocket.app; open-access turf RAG ingest)",
    },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAlex HTTP ${res.status} per "${query}" pag. ${page}: ${errBody.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Cicla sulle query OpenAlex; ritorna paper unici (per DOI).
 * @returns {Promise<Map<string, object>>}
 */
export async function raccogliPaperOpenAccess(queries = QUERIES_RICERCA) {
  const papersByDoi = new Map();

  for (let qi = 0; qi < queries.length; qi++) {
    const query = queries[qi];
    console.log(`\n[${qi + 1}/${queries.length}] Query: "${query}"`);

    for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
      if (page > 1) await sleep(RATE_LIMIT_MS);

      let data;
      try {
        data = await fetchOpenAlexPage(query, page);
      } catch (e) {
        console.warn(`  ⚠ Errore pagina ${page}: ${e.message}`);
        break;
      }

      if (page === 1) await sleep(RATE_LIMIT_MS);

      const results = data?.results ?? [];
      if (!results.length) {
        console.log(`  Pagina ${page}: nessun risultato, fine query.`);
        break;
      }

      let added = 0;
      for (const work of results) {
        const doi = normalizzaDoi(work);
        if (!doi || papersByDoi.has(doi)) continue;

        const abstract = abstractDaOpenAlex(work);
        if (!abstract || abstract.length < 80) continue;

        const titolo = titoloDaWork(work);
        if (!titolo) continue;

        papersByDoi.set(doi, {
          titolo,
          anno: work.publication_year ?? null,
          abstract,
          doi,
          openalex_id: work.id ?? null,
          query_origine: query,
        });
        added += 1;
      }

      console.log(
        `  Pagina ${page}: ${results.length} works · +${added} paper OA con abstract (totale unici: ${papersByDoi.size})`,
      );

      if (results.length < PER_PAGE) break;
    }

    if (qi < queries.length - 1) await sleep(RATE_LIMIT_MS);
  }

  return papersByDoi;
}

async function main() {
  console.log("=== Cacciatore Scienza (OpenAlex → RAG Solum) ===");
  console.log(`Query configurate: ${QUERIES_RICERCA.length}`);
  console.log(`Rate limit: ${RATE_LIMIT_MS} ms tra chiamate API`);
  console.log(`Output: ${OUTPUT_PATH}`);

  const papersMap = await raccogliPaperOpenAccess();
  const papers = [...papersMap.values()];

  const chunks = [];
  const papersOut = [];

  for (const paper of papers) {
    const testi = preparaChunkPerRAG(paper.abstract, paper.titolo);
    papersOut.push({
      titolo: paper.titolo,
      anno: paper.anno,
      doi: paper.doi,
      openalex_id: paper.openalex_id,
      query_origine: paper.query_origine,
      abstract_length: paper.abstract.length,
      chunk_count: testi.length,
    });
    testi.forEach((text, chunk_index) => {
      chunks.push({
        doi: paper.doi,
        titolo: paper.titolo,
        anno: paper.anno,
        query_origine: paper.query_origine,
        chunk_index,
        text,
      });
    });
  }

  const payload = {
    meta: {
      generated_at: new Date().toISOString(),
      source: "openalex",
      filter: "is_oa:true",
      queries: QUERIES_RICERCA,
      total_papers: papers.length,
      total_chunks: chunks.length,
      max_chunk_body_chars: MAX_CHUNK_BODY_CHARS,
    },
    papers: papersOut,
    chunks,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");

  console.log("\n=== Riepilogo ===");
  console.log(`Paper open-access estratti: ${papers.length}`);
  console.log(`Chunk RAG generati:       ${chunks.length}`);
  console.log(`File salvato:             ${OUTPUT_PATH}`);
  console.log("\nProssimo passo: revisione manuale del JSON prima dell'ingest in Supabase.");
}

main().catch((e) => {
  console.error("\n[ERRORE FATALE]", e.message);
  process.exit(1);
});
