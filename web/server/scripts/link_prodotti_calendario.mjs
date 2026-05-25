#!/usr/bin/env node
/**
 * Rigenera collegamenti prodotti_mercato ↔ calendario_base_intervento
 * usando il motore matchmaking Solum (server/link_prodotti_calendario.mjs).
 *
 * Uso (da web/): npm run link:prodotti:calendario
 *                 node server/scripts/link_prodotti_calendario.mjs --dry-run
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { fetchInterventiTemplate } from "./data/product_miner.mjs";
import { loadProdottiMercatoRows } from "../prodottiMercato.mjs";
import { linksPerInterventoTemplate, MIN_MATCH_SCORE } from "../link_prodotti_calendario.mjs";
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
  console.log(`Soglia matchmaking: ${MIN_MATCH_SCORE} punti (TOP 3 per template)`);

  const pairKeys = new Set();
  const links = [];

  for (const t of interventi) {
    const batch = linksPerInterventoTemplate(t, mercatoRows, { max: 3 });
    for (const link of batch) {
      const pk = `${link.prodotto_mercato_id}|${link.calendario_base_intervento_id}`;
      if (pairKeys.has(pk)) continue;
      pairKeys.add(pk);
      links.push(link);
    }
  }

  const conMatch = new Set(links.map((l) => l.calendario_base_intervento_id)).size;
  console.log(`Template con almeno 1 prodotto: ${conMatch} / ${interventi.length}`);
  console.log(`Totale collegamenti: ${links.length}`);

  if (dryRun) {
    const sample = links.slice(0, 5);
    for (const s of sample) {
      console.log(`  · ${s.match_reason}`);
    }
    console.log("(dry-run) Nessuna scrittura su DB.");
    return;
  }

  const { error: delErr } = await admin
    .from("prodotti_mercato_intervento")
    .delete()
    .eq("match_auto", true);
  if (delErr) throw new Error(`delete links: ${delErr.message}`);
  console.log("Collegamenti auto precedenti rimossi.");

  const batchSize = 200;
  for (let i = 0; i < links.length; i += batchSize) {
    const chunk = links.slice(i, i + batchSize);
    const { error } = await admin.from("prodotti_mercato_intervento").insert(chunk);
    if (error) throw new Error(`insert batch ${i}: ${error.message}`);
    console.log(`  inseriti ${Math.min(i + batchSize, links.length)} / ${links.length}`);
  }

  invalidateProdottiCache();
  console.log("Fatto. Rigenera il calendario in app per vedere i prodotti consigliati.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
