/**
 * Zone prato (multi-zona) — client Supabase.
 * Richiede sql/patch_zone_prato_focolai.sql eseguito su Supabase.
 */

import { supabase } from "./supabase";

function formatZoneError(error) {
  if (!error) return "Errore zone prato";
  if (error.code === "PGRST205") {
    return "Tabella zone_prato non visibile. Esegui sql/patch_zone_prato_focolai.sql nel SQL Editor.";
  }
  return error.message || "Errore zone prato";
}

/** Elenco zone utente (default per prima). */
export async function loadZonePrato(userId) {
  const { data, error } = await supabase
    .from("zone_prato")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(formatZoneError(error));
  return data ?? [];
}

export async function loadZonaDefault(userId) {
  const zones = await loadZonePrato(userId);
  return zones.find((z) => z.is_default) ?? zones[0] ?? null;
}

/** id_zona della zona corrente (default). */
export async function getZonaIdDefault(userId) {
  const z = await loadZonaDefault(userId);
  return z?.id ?? null;
}

export async function createZonaPrato(userId, { nome_zona, metri_quadri, coordinate_gps, profilo_id }) {
  const { data, error } = await supabase
    .from("zone_prato")
    .insert({
      user_id: userId,
      profilo_id: profilo_id ?? null,
      nome_zona: nome_zona?.trim() || "Nuova zona",
      metri_quadri: metri_quadri ?? null,
      coordinate_gps: coordinate_gps ?? null,
      is_default: false,
    })
    .select()
    .single();
  if (error) throw new Error(formatZoneError(error));
  return data;
}

export async function updateZonaPrato(zonaId, patch) {
  const { data, error } = await supabase
    .from("zone_prato")
    .update(patch)
    .eq("id", zonaId)
    .select()
    .single();
  if (error) throw new Error(formatZoneError(error));
  return data;
}
