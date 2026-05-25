#!/usr/bin/env node
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "..");

async function loadEnv(path) {
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

await loadEnv(join(WEB_ROOT, ".env.local"));
await loadEnv(join(WEB_ROOT, "../crawler/.env"));

const url = process.env.SUPABASE_URL?.trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)?.trim();
if (!url || !key) {
  console.error("Manca SUPABASE_URL / SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

for (const t of ["prodotti_mercato", "prodotti_mercato_intervento", "prodotti_mercato_ingest_batch"]) {
  const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
  console.log(`${t}: ${error ? error.message : count}`);
}

const { data: batches, error: bErr } = await admin
  .from("prodotti_mercato_ingest_batch")
  .select("*")
  .order("started_at", { ascending: false })
  .limit(5);
if (bErr) console.log("batch err:", bErr.message);
else {
  console.log("\nUltimi batch ingest:");
  for (const b of batches || []) {
    console.log(
      `  ${b.started_at?.slice(0, 19)} | total=${b.files_total} ok=${b.files_ok} rej=${b.files_rejected} | fin=${b.finished_at ? "sì" : "no"}`,
    );
  }
}

const { data: byCat } = await admin.from("prodotti_mercato").select("categoria_agronomica");
const cat = {};
for (const r of byCat || []) {
  cat[r.categoria_agronomica] = (cat[r.categoria_agronomica] || 0) + 1;
}
console.log("\nPer categoria:", cat);

const { data: recent } = await admin
  .from("prodotti_mercato")
  .select("prodotto, produttore, categoria_agronomica, validation_status, created_at")
  .order("created_at", { ascending: false })
  .limit(5);
console.log("\nUltimi inseriti:");
for (const r of recent || []) {
  console.log(`  - ${r.prodotto} (${r.produttore || "?"}) [${r.categoria_agronomica}] ${r.validation_status}`);
}
