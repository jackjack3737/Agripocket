#!/usr/bin/env node
/**
 * Collega prodotti_mercato ↔ calendario_base_intervento (match molecolare/fisiologico).
 * Rigenera anche l'indice usato dal calendario per i prodotti consigliati.
 *
 * Uso (da web/): node server/scripts/link_prodotti_calendario.mjs
 *                 node server/scripts/link_prodotti_calendario.mjs --dry-run
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  fetchInterventiTemplate,
  matchInterventi,
} from "./data/product_miner.mjs";
import {
  interventoTemplateKey,
  loadProdottiMercatoRows,
  mercatoAsMatchShape,
  rankMercatoPerIntervento,
} from "../prodottiMercato.mjs";
import { invalidateProdottiCache } from "../prodottiCache.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "../..");

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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await loadEnvFile(join(WEB_ROOT, ".env.local"));
  await loadEnvFile(join(WEB_ROOT, "../crawler/.env"));

  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)?.trim();
  if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY richiesti");

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const interventi = await fetchInterventiTemplate(admin);
  const mercatoRows = await loadProdottiMercatoRows(admin);

  console.log(`Template interventi: ${interventi.length}`);
  console.log(`Prodotti mercato attivi: ${mercatoRows.length}`);

  if (!dryRun) {
    const { error: delErr } = await admin
      .from("prodotti_mercato_intervento")
      .delete()
      .eq("match_auto", true);
    if (delErr) throw new Error(`delete links: ${delErr.message}`);
    console.log("Collegamenti auto precedenti rimossi.");
  }

  const pairKeys = new Set();
  const links = [];
  let fromProducts = 0;

  for (const row of mercatoRows) {
    const product = mercatoAsMatchShape(row);
    const matches = matchInterventi(product, interventi, { minScore: 0.34, maxMatches: 10 });
    for (const m of matches) {
      const pk = `${row.id}|${m.intervento_id}`;
      if (pairKeys.has(pk)) continue;
      pairKeys.add(pk);
      links.push({
        prodotto_mercato_id: row.id,
        calendario_base_intervento_id: m.intervento_id,
        match_score: m.match_score,
        match_reason: m.match_reason,
        match_auto: true,
      });
      fromProducts++;
    }
  }

  let fromTemplates = 0;
  for (const t of interventi) {
    const key = interventoTemplateKey(t);
    const existing = links.filter((l) => l.calendario_base_intervento_id === t.id).length;
    if (existing >= 3) continue;

    const ranked = rankMercatoPerIntervento(t, mercatoRows, { max: 8, minScore: 0.32 });
    for (const cat of ranked) {
      const pid = cat.mercato_id;
      if (!pid) continue;
      const pk = `${pid}|${t.id}`;
      if (pairKeys.has(pk)) continue;
      pairKeys.add(pk);
      links.push({
        prodotto_mercato_id: pid,
        calendario_base_intervento_id: t.id,
        match_score: cat._match_score ?? 0.4,
        match_reason: cat._match_reason || `fill_template:${key}`,
        match_auto: true,
      });
      fromTemplates++;
    }
  }

  console.log(`Collegamenti da prodotti → template: ${fromProducts}`);
  console.log(`Collegamenti aggiuntivi template → prodotti: ${fromTemplates}`);
  console.log(`Totale collegamenti: ${links.length}`);

  if (dryRun) {
    console.log("(dry-run) Nessuna scrittura su DB.");
    return;
  }

  const batch = 200;
  for (let i = 0; i < links.length; i += batch) {
    const chunk = links.slice(i, i + batch);
    const { error } = await admin.from("prodotti_mercato_intervento").insert(chunk);
    if (error) throw new Error(`insert batch ${i}: ${error.message}`);
    console.log(`  inseriti ${Math.min(i + batch, links.length)} / ${links.length}`);
  }

  invalidateProdottiCache();
  console.log("Fatto. Rigenera il calendario in app per vedere i prodotti consigliati.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
