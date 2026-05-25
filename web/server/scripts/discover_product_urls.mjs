#!/usr/bin/env node
/**
 * Scopre URL schede prodotto — rivenditori Italia (sitemap + crawl + liste).
 * Uso: node server/scripts/discover_product_urls.mjs --site all
 */

import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "../..");
const CRAWLER_ROOT = join(WEB_ROOT, "../crawler");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; AgriPocket/1.0; +product-discovery)",
  Accept: "text/html,application/xhtml+xml,application/xml",
};

async function loadYaml(path) {
  const raw = await readFile(path, "utf8");
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
    else if (t.startsWith("default_brand:")) cur.default_brand = t.slice(14).trim();
    else if (t.startsWith("enabled:")) cur.enabled = !/false/i.test(t);
    else if (t.startsWith("url_list:")) cur.url_list = t.slice(9).trim();
    else if (t.startsWith("sitemap:")) cur.sitemap = t.slice(8).trim();
    else if (t.startsWith("domain:")) cur.domain = t.slice(7).trim();
    else if (t.startsWith("crawl_max_pages:")) cur.crawl_max_pages = Number(t.slice(16)) || 120;
    else if (t.startsWith("product_url_regex:")) {
      const m = t.match(/product_url_regex:\s*"(.+)"\s*$/);
      cur.product_url_regex = m ? m[1] : t.slice(18).trim();
    } else if (t.startsWith("also_lists:")) inAlso = true;
    else if (inAlso && t.startsWith("- ")) {
      if (!cur.also_lists) cur.also_lists = [];
      cur.also_lists.push(t.replace(/^-\s+/, "").trim());
    } else if (t.startsWith("- ") && t.includes("http")) {
      if (!cur.seed_urls) cur.seed_urls = [];
      cur.seed_urls.push(t.replace(/^-\s+/, "").trim());
      inAlso = false;
    } else if (t.startsWith("path_must_contain:")) {
      /* skip key line */
    } else if (t.startsWith("- ") && !t.includes("http")) {
      if (!cur.path_must_contain) cur.path_must_contain = [];
      cur.path_must_contain.push(t.replace(/^-\s+/, "").trim());
      inAlso = false;
    } else if (!t.startsWith("-")) {
      inAlso = false;
    }
  }
  return { sites };
}

function matchesProductUrl(u, site) {
  const ul = u.toLowerCase();
  const skip = [
    "/cart",
    "/checkout",
    "/login",
    "/account",
    "/wp-json",
    "/feed/",
    "/blog/",
    "/news/",
    "/contatti",
    "/privacy",
    ".jpg",
    ".png",
    ".pdf",
  ];
  if (skip.some((s) => ul.includes(s))) return false;

  if (site.product_url_regex) {
    try {
      return new RegExp(site.product_url_regex, "i").test(u);
    } catch {
      /* fall through */
    }
  }

  if (site.id === "best_prato") {
    return ul.includes("bestprato.com") && ul.endsWith(".html") && !ul.includes("-prezzi");
  }
  if (site.domain && !ul.includes(site.domain.toLowerCase())) return false;

  const must = site.path_must_contain || [];
  if (must.length && !must.some((m) => ul.includes(m.toLowerCase()))) {
    if (!/fungic|prato|concim|erbic|insettic|bioattiv|sement|fitofarm|giardin|diserb|nutriz/i.test(ul)) {
      return false;
    }
  }
  return /prodott|product|prato|concim|fungic|erbic|insettic|diserb|sement|fitofarm|npk|miscugl/i.test(ul);
}

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

function parseSitemapLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
}

async function urlsFromSitemap(sitemapUrl, site, max = 8000) {
  const out = new Set();
  const xml = await fetchText(sitemapUrl);
  const locs = parseSitemapLocs(xml);
  const childMaps = locs.filter((u) => u.endsWith(".xml"));
  const pages = childMaps.length
    ? (
        await Promise.all(
          childMaps.slice(0, 20).map(async (sm) => {
            try {
              return parseSitemapLocs(await fetchText(sm));
            } catch {
              return [];
            }
          }),
        )
      ).flat()
    : locs;

  for (const u of pages) {
    if (u.endsWith(".xml")) continue;
    if (matchesProductUrl(u, site)) out.add(u.split("?")[0]);
    if (out.size >= max) break;
  }
  return [...out];
}

async function crawlFromSeeds(site) {
  const seeds = site.seed_urls || [];
  if (!seeds.length) return [];

  const maxPages = site.crawl_max_pages || 120;
  const seen = new Set();
  const products = new Set();
  const queue = [...seeds];

  while (queue.length && seen.size < maxPages) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);

    try {
      const html = await fetchText(u);
      if (matchesProductUrl(u, site)) products.add(u.split("?")[0]);

      for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
        let href = m[1].trim();
        if (href.startsWith("//")) href = `https:${href}`;
        else if (href.startsWith("/")) href = new URL(href, u).href;
        if (!href.startsWith("http")) continue;
        const clean = href.split("#")[0].split("?")[0];
        if (site.domain && !clean.toLowerCase().includes(site.domain.toLowerCase())) continue;
        if (matchesProductUrl(clean, site)) products.add(clean);
        if (seen.size < maxPages && /categor|prato|giardin|prodott|concim|sement|colture|gruppi/i.test(clean)) {
          if (!seen.has(clean)) queue.push(clean);
        }
      }
    } catch (e) {
      console.warn(`  [crawl] ${u.slice(0, 55)}… ${e.message}`);
    }
  }

  return [...products];
}

async function mergeListFiles(site) {
  const extra = site.id === "best_prato" ? ["urls_bestprato.txt", "urls_bestprato_fito.txt"] : [];
  const files = [...new Set([`urls_${site.id}.txt`, site.url_list, ...(site.also_lists || []), ...extra])].filter(
    Boolean,
  );
  const urls = new Set();
  for (const f of files) {
    const path = f.includes("/") || f.includes("\\") ? f : join(CRAWLER_ROOT, f);
    try {
      const raw = await readFile(path, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const u = line.trim();
        if (u && !u.startsWith("#")) urls.add(u.split("?")[0]);
      }
    } catch {
      /* missing */
    }
  }
  return [...urls];
}

async function main() {
  const args = process.argv.slice(2);
  const siteId = args.includes("--site") ? args[args.indexOf("--site") + 1] : "all";

  const cfg = await loadYaml(join(CRAWLER_ROOT, "product_sites_italia.yaml"));
  let sites = cfg.sites || [];
  if (siteId !== "all") sites = sites.filter((s) => s.id === siteId);

  let grandTotal = 0;

  for (const site of sites) {
    if (site.enabled === false) {
      console.log(`[skip] ${site.id}${site.note ? ` — ${site.note}` : ""}`);
      continue;
    }

    console.log(`\n=== ${site.label || site.id} (${site.id}) ===`);
    let urls = [];

    if (site.url_list || site.also_lists || site.id === "best_prato") {
      const fromFiles = await mergeListFiles(site);
      console.log(`  ${fromFiles.length} URL da liste file`);
      urls.push(...fromFiles);
    }

    if (site.sitemap) {
      try {
        const fromSm = await urlsFromSitemap(site.sitemap, site);
        console.log(`  ${fromSm.length} URL da sitemap`);
        urls.push(...fromSm);
      } catch (e) {
        console.warn(`  Sitemap: ${e.message}`);
      }
    }

    if (site.seed_urls?.length) {
      const fromCrawl = await crawlFromSeeds(site);
      console.log(`  ${fromCrawl.length} URL da crawl (${site.crawl_max_pages || 120} pagine max)`);
      urls.push(...fromCrawl);
    }

    urls = [...new Set(urls)];
    const outFile = join(CRAWLER_ROOT, `urls_${site.id}.txt`);
    await writeFile(outFile, urls.join("\n") + "\n", "utf8");
    console.log(`  → ${outFile} (${urls.length} URL)`);
    grandTotal += urls.length;
  }

  console.log(`\nTotale URL scoperti: ${grandTotal}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
