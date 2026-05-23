/**
 * Normalizza input profilo/mappa per motoreIrrigazione.
 */

import { computeOmbraZonePct, countZonesByType, normalizePratoZone } from "./pratoZone.mjs";

const TIPI_IRRIGATORI_OK = new Set([
  "statici",
  "dinamici",
  "testine_rotator",
  "ala_gocciolante",
]);

const TERRENO_OK = new Set(["sabbioso", "medio", "argilloso"]);
const PENDENZA_OK = new Set(["piana", "leggera", "forte", "media"]);

function ombraPctDaProfilo(profilo) {
  const daMappa = computeOmbraZonePct(profilo?.prato_zone);
  if (daMappa != null && daMappa >= 0) return Math.min(100, Math.round(daMappa));

  const oz = profilo?.ombra_zone_pct;
  if (oz === "75_100") return 85;
  if (oz === "50_75") return 62;
  if (oz === "25_50") return 37;
  if (oz === "0_25") return 12;

  if (profilo?.esposizione === "ombra") return 70;
  if (profilo?.esposizione === "mezzombra") return 45;
  return 0;
}

function inferTipoIrrigatori(profilo) {
  const counts = countZonesByType(normalizePratoZone(profilo?.prato_zone));
  if (counts.rotator > 0 && counts.rotator >= counts.statico && counts.rotator >= counts.dinamico) {
    return "testine_rotator";
  }
  if (counts.dinamico > counts.statico) return "dinamici";
  if (counts.statico > 0) return "statici";
  if (profilo?.irrigazione === "automatica") return "statici";
  return "dinamici";
}

function normalizzaPendenza(raw) {
  const v = String(raw || "piana").toLowerCase();
  if (v === "marcata" || v === "forte") return "forte";
  if (v === "media") return "media";
  if (v === "leggera") return "leggera";
  if (PENDENZA_OK.has(v)) return v;
  return "piana";
}

function normalizzaTerreno(raw) {
  const v = String(raw || "medio").toLowerCase();
  if (v === "non_so") return "medio";
  return TERRENO_OK.has(v) ? v : "medio";
}

/**
 * @returns {{
 *   tipo_irrigatori: string,
 *   tempo_irrigazione_base: number,
 *   tipo_terreno: string,
 *   pendenza: string,
 *   percentuale_ombra: number,
 *   irrigazione_profilo: string|null,
 * }}
 */
export function normalizzaInputIrrigazione(profilo) {
  let tipo = String(profilo?.tipo_irrigatori || "").toLowerCase();
  if (!TIPI_IRRIGATORI_OK.has(tipo)) tipo = inferTipoIrrigatori(profilo);

  const base = Number(profilo?.tempo_irrigazione_base);
  const tempo_irrigazione_base =
    Number.isFinite(base) && base > 0 ? Math.round(base) : 15;

  return {
    tipo_irrigatori: tipo,
    tempo_irrigazione_base,
    tipo_terreno: normalizzaTerreno(profilo?.tipo_terreno),
    pendenza: normalizzaPendenza(profilo?.pendenza),
    percentuale_ombra: ombraPctDaProfilo(profilo),
    irrigazione_profilo: profilo?.irrigazione ?? null,
  };
}
