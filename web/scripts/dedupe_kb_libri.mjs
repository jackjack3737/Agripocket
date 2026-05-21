#!/usr/bin/env node
/** Elimina duplicati stesso file+chunk_index in tgif_knowledge_base (libri). */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { chunkDbKey, parseLibroMetadata } from "./ingest_kb_shared.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    /* ok */
  }
}

async function loadConfig() {
  for (const p of [
    join(__dirname, "../.env.local"),
    join(__dirname, "../../crawler/.env"),
    join(__dirname, "../.env"),
  ]) {
    await loadEnvFile(p);
  }
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "").trim();
  if (!supabaseUrl || !supabaseKey) throw new Error("Mancano credenziali Supabase");
  return { supabaseUrl, supabaseKey };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { supabaseUrl, supabaseKey } = await loadConfig();
  const admin = createClient(supabaseUrl, supabaseKey);

  const byKey = new Map();
  let from = 0;
  const pageSize = 500;

  while (true) {
    const { data, error } = await admin
      .from("tgif_knowledge_base")
      .select("id, soluzione")
      .ilike("soluzione", "%[libro_universitario:%")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      const key = chunkDbKey(parseLibroMetadata(row.soluzione));
      if (!key) continue;
      const list = byKey.get(key) || [];
      list.push(row.id);
      byKey.set(key, list);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const toDelete = [];
  for (const ids of byKey.values()) {
    if (ids.length <= 1) continue;
    ids.sort((a, b) => a - b);
    toDelete.push(...ids.slice(0, -1));
  }

  console.log(`Duplicati chunk (file|index): ${toDelete.length} righe da rimuovere`);
  if (!toDelete.length) return;
  if (dryRun) return;

  const batch = 80;
  for (let i = 0; i < toDelete.length; i += batch) {
    const ids = toDelete.slice(i, i + batch);
    const { error } = await admin.from("tgif_knowledge_base").delete().in("id", ids);
    if (error) throw new Error(error.message);
    process.stdout.write(`\rEliminati ${Math.min(i + batch, toDelete.length)}/${toDelete.length}`);
  }
  console.log("\nFatto.");
}

main().catch((e) => {
  console.error("[FATAL]", e.message || e);
  process.exit(1);
});
