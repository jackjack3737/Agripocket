#!/usr/bin/env node
/**
 * Popola prodotti_mercato dal catalogo legacy "Prodotti" (Bottos + altre marche).
 * Uso (da web/): node server/scripts/seed_prodotti_mercato.mjs
 */

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { fetchInterventiTemplate, matchInterventi, toDbRow } from "./data/product_miner.mjs";

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

function sha256Text(s) {
  return createHash("sha256").update(s).digest("hex");
}

function mapCategoriaAg(categoria, macro) {
  const c = String(categoria || "").toUpperCase();
  const m = String(macro || "").toLowerCase();
  if (c.includes("FUNGICID") || m === "fungicida") return "Fungicida";
  if (c.includes("INSETTICID") || m === "insetticida") return "Insetticida";
  if (c.includes("DISERBANT") || m === "diserbante") return "Diserbante";
  if (c.includes("BIOSTIM") || c.includes("BIOATTIV") || m === "biostimolante") return "Biostimolante";
  if (c.includes("SEMENT") || m === "semente") return "Semente";
  if (c.includes("BAGNANT") || m === "bagnante") return "Bagnante";
  if (c.includes("CONCIME") || m === "n" || m === "p" || m === "k") return "Concime NPK";
  if (m === "correttivo" || c.includes("FERRO") || c.includes("MICRONUT")) return "Correttivo";
  return "Altro";
}

function legacyToProduct(p) {
  const comp = [];
  if (p.principio_attivo?.trim()) comp.push(p.principio_attivo.trim());
  if (p.composizione?.trim()) {
    comp.push(
      ...String(p.composizione)
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  if (!comp.length && p.nome) comp.push(`Prodotto: ${p.nome}`);

  const targets = [];
  if (p.descrizione?.trim()) targets.push(p.descrizione.trim().slice(0, 200));
  if (p.periodo_ideale?.trim()) targets.push(`Periodo: ${p.periodo_ideale}`);
  if (!targets.length) targets.push("Manutenzione prato");

  const cat = mapCategoriaAg(p.categoria, p.macro_categoria);
  const isBio = /bio|834\/2007|organico/i.test(`${p.categoria} ${p.descrizione} ${p.composizione}`);

  return {
    prodotto: String(p.nome || "").trim(),
    produttore: String(p.marca || "BOTTOS").trim(),
    categoria_agronomica: cat,
    composizione_molecolare_dichiarata: comp,
    target_fisiologico: targets,
    is_bio: isBio,
    confidence_score: 0.75,
  };
}

async function main() {
  await loadEnvFile(join(WEB_ROOT, ".env.local"));
  await loadEnvFile(join(WEB_ROOT, "../crawler/.env"));

  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)?.trim();
  if (!url || !key) throw new Error("SUPABASE_URL e SERVICE_ROLE_KEY richiesti");

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const dryRun = process.argv.includes("--dry-run");

  const { data: catalogo, error } = await admin.from("Prodotti").select("*").order("nome");
  if (error) throw new Error(error.message);
  if (!catalogo?.length) {
    console.log("Nessun prodotto in catalogo legacy.");
    return;
  }

  const { data: batch, error: bErr } = dryRun
    ? { data: null }
    : await admin
        .from("prodotti_mercato_ingest_batch")
        .insert({
          label: `seed catalogo ${new Date().toISOString()}`,
          files_total: catalogo.length,
        })
        .select("id")
        .single();
  if (bErr) console.warn("[batch]", bErr.message);
  const batchId = batch?.id ?? null;

  const interventi = dryRun ? [] : await fetchInterventiTemplate(admin);
  let inserted = 0;
  let skipped = 0;
  let rejected = 0;

  for (const p of catalogo) {
    const product = legacyToProduct(p);
    if (!product.prodotto) {
      rejected++;
      continue;
    }

    const sourceHash = sha256Text(`legacy:${p.id}:${product.prodotto}`);
    if (!dryRun) {
      const { data: existing } = await admin
        .from("prodotti_mercato")
        .select("id")
        .eq("source_hash", sourceHash)
        .maybeSingle();
      if (existing?.id) {
        skipped++;
        continue;
      }
    }

    const row = toDbRow(product, {
      sourceType: "manual",
      sourceFile: `Prodotti#${p.id}`,
      sourceHash,
      rawTextExcerpt: (p.descrizione || p.nome || "").slice(0, 500),
      extractedJson: { ...product, legacy_id: p.id },
      validationStatus: "valid",
      validationNotes: ["Import da catalogo Prodotti"],
      ingestBatchId: batchId,
    });
    row.prodotto_catalogo_id = p.id;

    if (dryRun) {
      inserted++;
      continue;
    }

    const { data: ins, error: insErr } = await admin.from("prodotti_mercato").insert(row).select("id").single();
    if (insErr) {
      console.warn(`  [ERR] ${product.prodotto}: ${insErr.message}`);
      rejected++;
      continue;
    }

    const matches = matchInterventi(product, interventi);
    if (matches.length) {
      const links = matches.map((m) => ({
        prodotto_mercato_id: ins.id,
        calendario_base_intervento_id: m.intervento_id,
        match_score: m.match_score,
        match_reason: m.match_reason,
        match_auto: true,
      }));
      await admin.from("prodotti_mercato_intervento").insert(links);
    }

    inserted++;
    if (inserted % 20 === 0) console.log(`  … ${inserted} inseriti`);
  }

  if (batchId && !dryRun) {
    await admin
      .from("prodotti_mercato_ingest_batch")
      .update({
        files_ok: inserted,
        files_rejected: rejected + skipped,
        finished_at: new Date().toISOString(),
      })
      .eq("id", batchId);
  }

  console.log(`\nSeed catalogo: ${inserted} inseriti, ${skipped} già presenti, ${rejected} errori/saltati (da ${catalogo.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
