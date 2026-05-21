/**
 * Persistenza meteo agronomico su zone_prato (Supabase service role).
 */

import { createClient } from "@supabase/supabase-js";
import { meteoAgronomicoPerStorage } from "./agronomicMeteo.mjs";

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Salva cache meteo sulla zona (solo service role).
 * @param {string} zonaId
 * @param {object} agronomic — output fetchOpenMeteoAgronomic
 * @param {object} geo
 */
export async function persistMeteoZona(zonaId, agronomic, geo = {}) {
  const admin = adminClient();
  if (!admin || !zonaId || !agronomic) return null;

  const payload = meteoAgronomicoPerStorage(agronomic, geo);
  const patch = {
    meteo_agronomico: payload,
    updated_at: new Date().toISOString(),
  };

  if (geo.lat != null && geo.lon != null) {
    patch.coordinate_gps = { lat: geo.lat, lon: geo.lon };
  }
  if (geo.comune || geo.name) {
    patch.comune = (geo.comune || geo.name || "").slice(0, 120) || null;
  }

  const { data, error } = await admin
    .from("zone_prato")
    .update(patch)
    .eq("id", zonaId)
    .select("id, nome_zona, meteo_agronomico, comune")
    .single();

  if (error) {
    console.warn("[zoneMeteo] persist skip:", error.message);
    return null;
  }
  return data;
}

/** Carica zona default utente (per meteo senza zonaId esplicito). */
export async function loadZonaDefault(userId) {
  const admin = adminClient();
  if (!admin || !userId) return null;
  const { data } = await admin
    .from("zone_prato")
    .select("id, nome_zona, comune, coordinate_gps, metri_quadri")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  return data;
}
