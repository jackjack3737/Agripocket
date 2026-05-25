#!/usr/bin/env node
/**
 * Ingest massivo prodotti commerciali Italia → prodotti_mercato
 * Fonti: Best Prato, Bottos, altri siti in crawler/product_sites_italia.yaml
 *
 * Uso (da web/):
 *   node server/scripts/discover_product_urls.mjs --site all
 *   node server/scripts/ingest_prodotti_italia.mjs --site best_prato
 *   node server/scripts/ingest_prodotti_italia.mjs --site all --max-urls 500
 */

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  analyzeLabelText,
  prepareProductFromWeb,
  persistProduct,
  fetchInterventiTemplate,
  validateProduct,
} from "./data/product_miner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "../..");
const CRAWLER_ROOT = join(WEB_ROOT, "../crawler");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; AgriPocket/1.0; +product-ingest)",
  Accept: "text/html,application/xhtml+xml",
};
const FETCH_SLEEP_MS = Number(process.env.INGEST_WEB_SLEEP_MS || 800);
const GEMINI_SLEEP_MS = Number(process.env.PRODUCT_MINER_SLEEP_MS || 3500);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}

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
    /* absent */
  }
}

async function loadSitesConfig() {
  const raw = await readFile(join(CRAWLER_ROOT, "product_sites_italia.yaml"), "utf8");
  const sites = [];
  let cur = null;
  let inAlso = false;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (t.startsWith("- id:")) {
      cur = { id: t.replace("- id:", "").trim(), enabled: true };
      sites.push(cur);
      inAlso = false;
      continue;
    }
    if (!cur) continue;
    if (t.startsWith("label:")) cur.label = t.slice(6).trim();
    else if (t.startsWith("enabled:")) cur.enabled = !/false/i.test(t);
    else if (t.startsWith("default_brand:")) cur.default_brand = t.slice(14).trim();
    else if (t.startsWith("url_list:")) cur.url_list = t.slice(9).trim();
    else if (t.startsWith("also_lists:")) inAlso = true;
    else if (inAlso && t.startsWith("- ")) {
      if (!cur.also_lists) cur.also_lists = [];
      cur.also_lists.push(t.replace(/^-\s+/, "").trim());
    } else if (!t.startsWith("-")) inAlso = false;
  }
  return sites;
}

async function loadUrlsForSite(site) {
  const extra =
    site.id === "best_prato" ? ["urls_bestprato.txt", "urls_bestprato_fito.txt"] : [];
  const files = [...new Set([`urls_${site.id}.txt`, site.url_list, ...(site.also_lists || []), ...extra])].filter(
    Boolean,
  );
  const seen = new Set();
  const out = [];
  for (const f of [...new Set(files)]) {
    const path = f.includes("/") ? f : join(CRAWLER_ROOT, f);
    try {
      const raw = await readFile(path, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const u = line.trim();
        if (!u || u.startsWith("#") || seen.has(u)) continue;
        seen.add(u);
        out.push(u);
      }
    } catch {
      /* file missing */
    }
  }
  return out;
}

function htmlToText(html) {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const title = t.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
  t = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { text: (title ? `${title}\n\n` : "") + t, title };
}

function jsonLdProduct(html) {
  const blocks = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const items = Array.isArray(j) ? j : [j];
      for (const it of items) {
        if (it?.["@type"] === "Product" || it?.["@type"]?.includes?.("Product")) blocks.push(it);
        if (it?.["@graph"]) {
          for (const g of it["@graph"]) {
            if (g?.["@type"] === "Product") blocks.push(g);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return blocks[0] || null;
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const { text, title } = htmlToText(html);
  const ld = jsonLdProduct(html);
  let enriched = text;
  if (ld?.name) enriched = `Prodotto: ${ld.name}\nMarca: ${ld.brand?.name || ld.brand || ""}\n${ld.description || ""}\n\n${text}`;
  if (enriched.length < 120) throw new Error("Pagina con poco testo");
  return { rawText: enriched.slice(0, 14000), title: title || ld?.name || url };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const siteArg = args.includes("--site") ? args[args.indexOf("--site") + 1] : "all";
  const EXTRA_SITE_IDS = [
    "agrieuro_prato",
    "zapi",
    "compo_expert",
    "barenbrug",
    "geogreen",
    "herbatech",
    "padana_sementi",
    "icl_grow",
    "icl_everis",
    "icl_sf",
    "sbm_garden",
    "valagro",
    "biogarden",
    "agraria",
    "farmalux",
    "growshop_bologna",
  ];
  const MARCHE_SITE_IDS = [
    "barenbrug",
    "geogreen",
    "herbatech",
    "padana_sementi",
    "icl_grow",
    "icl_everis",
    "icl_sf",
  ];
  const maxIdx = args.indexOf("--max-urls");
  const maxUrls = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 0;
  const offsetIdx = args.indexOf("--offset");
  const offset = offsetIdx >= 0 ? Number(args[offsetIdx + 1]) : 0;

  await loadEnvFile(join(WEB_ROOT, ".env.local"));
  await loadEnvFile(join(CRAWLER_ROOT, ".env"));

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey?.trim()) throw new Error("GEMINI_API_KEY mancante");

  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)?.trim();
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY richiesti");

  const admin = dryRun ? null : createClient(url, key, { auth: { persistSession: false } });
  let sites = await loadSitesConfig();
  if (siteArg === "extra") sites = sites.filter((s) => EXTRA_SITE_IDS.includes(s.id));
  else if (siteArg === "marche") sites = sites.filter((s) => MARCHE_SITE_IDS.includes(s.id));
  else if (siteArg !== "all") sites = sites.filter((s) => s.id === siteArg);

  const interventi = dryRun || !admin ? [] : await fetchInterventiTemplate(admin);

  let batchId = null;
  if (!dryRun && admin) {
    const { data: batch } = await admin
      .from("prodotti_mercato_ingest_batch")
      .insert({
        label: `web italia ${new Date().toISOString()}`,
        files_total: 0,
      })
      .select("id")
      .single();
    batchId = batch?.id ?? null;
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalRejected = 0;
  let totalErrors = 0;

  for (const site of sites) {
    if (site.enabled === false) continue;

    let urls = await loadUrlsForSite(site);
    if (!urls.length) {
      console.log(`\n[${site.id}] Nessun URL — esegui: node server/scripts/discover_product_urls.mjs --site ${site.id}`);
      continue;
    }
    if (offset) urls = urls.slice(offset);
    if (maxUrls > 0) urls = urls.slice(0, maxUrls);

    console.log(`\n=== ${site.label}: ${urls.length} schede prodotto ===`);

    for (let i = 0; i < urls.length; i++) {
      const pageUrl = urls[i];
      const label = `[${i + 1}/${urls.length}]`;
      try {
        await sleep(FETCH_SLEEP_MS);
        const { rawText, title } = await fetchPage(pageUrl);
        await sleep(GEMINI_SLEEP_MS);

        let product = await analyzeLabelText(rawText, title || pageUrl, apiKey.trim());
        product = prepareProductFromWeb(product, site.default_brand);
        const { status } = validateProduct(product);
        if (status === "rejected") {
          console.log(`${label} REJECT ${product.prodotto || pageUrl}`);
          totalRejected++;
          continue;
        }

        const sourceHash = sha256(`web:${site.id}:${pageUrl}`);
        const r = await persistProduct(product, {
          admin,
          dryRun,
          ingestBatchId: batchId,
          sourceType: "text",
          sourceFile: pageUrl,
          sourceHash,
          rawTextExcerpt: rawText.slice(0, 1500),
          interventi,
        });
        if (r.skipped) totalSkipped++;
        else if (r.ok) totalInserted++;
        else totalRejected++;
        if ((i + 1) % 25 === 0) {
          console.log(`${label} progress: +${totalInserted} inseriti, ${totalSkipped} skip, ${totalRejected} reject`);
        }
      } catch (e) {
        totalErrors++;
        console.warn(`${label} ERR ${pageUrl.slice(0, 60)}… — ${e.message}`);
      }
    }
  }

  if (batchId && admin) {
    await admin
      .from("prodotti_mercato_ingest_batch")
      .update({
        files_ok: totalInserted,
        files_rejected: totalRejected + totalErrors,
        finished_at: new Date().toISOString(),
      })
      .eq("id", batchId);
  }

  console.log(
    `\n=== Fine ingest Italia ===\nInseriti: ${totalInserted}\nGià in DB: ${totalSkipped}\nRifiutati: ${totalRejected}\nErrori fetch/Gemini: ${totalErrors}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
