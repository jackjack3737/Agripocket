#!/usr/bin/env node
/**
 * Seed calendario base «anno normale» — clima + interventi template Solum.
 *
 * PREREQUISITO: eseguire sql/patch_calendario_base.sql in Supabase SQL Editor.
 *
 * Uso (da web/):
 *   node server/scripts/seed_calendario_base.mjs --dry-run
 *   node server/scripts/seed_calendario_base.mjs
 *   node server/scripts/seed_calendario_base.mjs --force
 *   node server/scripts/seed_calendario_base.mjs --zona nord_pianura --only-interventi
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (web/.env.local o crawler/.env)
 */

import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { INTERVENTI_NORD_PIANURA } from "./data/interventi_nord_pianura.mjs";
import { CLIMA_MENSILE_BY_ZONA, ZONE_CLIMATICHE } from "../calendarioBaseData.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export { ZONE_CLIMATICHE, CLIMA_MENSILE_BY_ZONA };
export { INTERVENTI_NORD_PIANURA };

function countByLivello(interventi) {
  const c = { base: 0, pro: 0, greenkeeper: 0 };
  for (const i of interventi) {
    if (i.livello_impegno in c) c[i.livello_impegno] += 1;
  }
  return c;
}


// ---------------------------------------------------------------------------
// Env & CLI
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

async function loadConfig() {
  const candidates = [
    join(__dirname, "../../.env.local"),
    join(__dirname, "../../../crawler/.env"),
    join(__dirname, "../../.env"),
  ];
  for (const p of candidates) await loadEnvFile(p);

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    ""
  ).trim();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Mancano SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  }

  return { supabaseUrl, supabaseKey };
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function buildClimaRows(zona) {
  const mesi = CLIMA_MENSILE_BY_ZONA[zona];
  if (!mesi) throw new Error(`Zona clima sconosciuta: ${zona}`);
  return mesi.map((r) => ({
    zona_climatica: zona,
    mese: r.mese,
    t_media_c: r.t_media_c,
    t_min_media_c: r.t_min_media_c,
    gdd_mese: r.gdd_mese,
    et0_mm_giorno: r.et0_mm_giorno,
    pioggia_mm: r.pioggia_mm,
    kc_prato: r.kc_prato,
    note: `Anno tipo Solum — seed ${zona}`,
  }));
}

function buildInterventoRows(zona, interventi) {
  return interventi.map((i) => ({
    zona_climatica: zona,
    uso: i.uso ?? "*",
    livello_impegno: i.livello_impegno ?? "*",
    mese: i.mese,
    giorno_mese: i.giorno_mese,
    categoria: i.categoria,
    priorita: i.priorita,
    titolo: i.titolo,
    fabbisogno_fisiologico: i.fabbisogno_fisiologico,
    esigenze_molecolari: i.esigenze_molecolari,
    macro_categoria: i.macro_categoria ?? null,
    finestra_shift_giorni: i.finestra_shift_giorni ?? 7,
    ordine: i.ordine ?? 100,
    attivo: true,
  }));
}

async function deleteZona(admin, zona, { clima, interventi }) {
  if (clima) {
    const { error } = await admin.from("clima_mese_normale").delete().eq("zona_climatica", zona);
    if (error) throw new Error(`Delete clima ${zona}: ${error.message}`);
  }
  if (interventi) {
    const { error } = await admin
      .from("calendario_base_intervento")
      .delete()
      .eq("zona_climatica", zona);
    if (error) throw new Error(`Delete interventi ${zona}: ${error.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const onlyClima = args.includes("--only-clima");
  const onlyInterventi = args.includes("--only-interventi");
  const zonaArg = argValue(args, "--zona") || "nord_pianura";

  const seedClima = !onlyInterventi;
  const seedInterventi = !onlyClima;

  console.log("=== Seed calendario base Solum ===");
  console.log(`Dry-run: ${dryRun} | Force: ${force}`);
  console.log(`Clima: tutte le ${ZONE_CLIMATICHE.length} macro-zone`);
  const byLv = countByLivello(INTERVENTI_NORD_PIANURA);
  console.log(
    `Interventi: ${zonaArg} (${INTERVENTI_NORD_PIANURA.length} righe — base:${byLv.base} pro:${byLv.pro} greenkeeper:${byLv.greenkeeper})\n`,
  );

  if (dryRun) {
    console.log("Anteprima clima (nord_pianura, mese 7):");
    console.log(buildClimaRows("nord_pianura")[6]);
    const gkMar = INTERVENTI_NORD_PIANURA.find(
      (i) => i.livello_impegno === "greenkeeper" && i.mese === 3 && i.titolo.includes("Trichoderma"),
    );
    const gkLug = INTERVENTI_NORD_PIANURA.find((i) => i.titolo.includes("GABA"));
    const gkSet = INTERVENTI_NORD_PIANURA.find((i) => i.titolo.includes("carbohydrate"));
    console.log("\n--- Anteprima greenkeeper (standard elevato) ---");
    for (const ex of [gkMar, gkLug, gkSet].filter(Boolean)) {
      console.log(JSON.stringify(ex, null, 2));
      console.log("");
    }
    console.log("(dry-run: nessuna scrittura su Supabase)");
    return;
  }

  const { supabaseUrl, supabaseKey } = await loadConfig();
  const admin = createClient(supabaseUrl, supabaseKey);

  if (seedClima) {
    for (const zona of ZONE_CLIMATICHE) {
      if (force) await deleteZona(admin, zona, { clima: true, interventi: false });
      const rows = buildClimaRows(zona);
      const { error } = await admin.from("clima_mese_normale").upsert(rows, {
        onConflict: "zona_climatica,mese",
      });
      if (error) {
        if (/does not exist|relation/.test(error.message)) {
          throw new Error(
            `Tabella clima_mese_normale assente. Esegui prima sql/patch_calendario_base.sql in Supabase.`,
          );
        }
        throw new Error(`Upsert clima ${zona}: ${error.message}`);
      }
      console.log(`✅ Clima: 12 mesi → ${zona}`);
    }
  }

  if (seedInterventi) {
    if (zonaArg !== "nord_pianura") {
      console.warn(`⚠️  Solo nord_pianura ha template interventi in questo seed; richiesto: ${zonaArg}`);
    }
    const zona = "nord_pianura";
    if (force) await deleteZona(admin, zona, { clima: false, interventi: true });
    const rows = buildInterventoRows(zona, INTERVENTI_NORD_PIANURA);
    const { error } = await admin.from("calendario_base_intervento").insert(rows);
    if (error) {
      if (/does not exist|relation/.test(error.message)) {
        throw new Error(
          `Tabella calendario_base_intervento assente. Esegui prima sql/patch_calendario_base.sql in Supabase.`,
        );
      }
      if (/duplicate|unique/i.test(error.message) && !force) {
        throw new Error(
          `Interventi già presenti per ${zona}. Usa --force per sostituire.`,
        );
      }
      throw new Error(`Insert interventi: ${error.message}`);
    }
    console.log(`✅ Interventi: ${rows.length} righe → ${zona}`);
  }

  console.log("\nSeed completato.");
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(process.argv[1]);

if (isMain) {
  main().catch((e) => {
    console.error("\n[ERRORE]", e.message);
    process.exit(1);
  });
}
