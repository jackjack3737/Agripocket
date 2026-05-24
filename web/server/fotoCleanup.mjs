/** GC foto modulo Chiedi all'agronomo: storage fisico + soft-delete su prato_analisi. */

import { BUCKET } from "./fotoStorage.mjs";

const GIORNI_RETENTION = 15;
const REMOVE_BATCH = 100;

/**
 * Fire-and-forget: non blocca la response dell'analisi.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase — service role
 * @param {string} userId
 */
export function scheduleCleanupVecchieFotoAgronomo(supabase, userId) {
  void cleanupVecchieFotoAgronomo(supabase, userId).catch((e) => {
    console.warn("[cleanupVecchieFotoAgronomo]", e?.message || e);
  });
}

/**
 * Elimina dal bucket le foto macchia_zona > 15 giorni; azzera foto_path/foto_url (storico testo intatto).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<{ removed: number, cleared: number, skipped?: boolean }>}
 */
export async function cleanupVecchieFotoAgronomo(supabase, userId) {
  if (!supabase || !userId) return { removed: 0, cleared: 0 };

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - GIORNI_RETENTION);
  const cutoffIso = cutoff.toISOString();

  const { data: rows, error } = await supabase
    .from("prato_analisi")
    .select("id, foto_path, foto_url")
    .eq("user_id", userId)
    .eq("modalita", "macchia_zona")
    .lt("created_at", cutoffIso)
    .or("foto_path.not.is.null,foto_url.not.is.null");

  if (error) {
    if (error.code === "42703" || /modalita/i.test(error.message || "")) {
      console.warn(
        "[cleanupVecchieFotoAgronomo] colonna modalita assente — esegui sql/patch_prato_analisi_modalita.sql",
      );
      return { removed: 0, cleared: 0, skipped: true };
    }
    throw new Error(error.message);
  }

  const toClean = (rows || []).filter((r) => r.foto_path || r.foto_url);
  if (!toClean.length) return { removed: 0, cleared: 0 };

  const paths = [...new Set(toClean.map((r) => r.foto_path).filter(Boolean))];
  let removed = 0;
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH);
    const { error: stErr } = await supabase.storage.from(BUCKET).remove(batch);
    if (stErr) {
      console.warn("[cleanupVecchieFotoAgronomo] storage:", stErr.message);
    } else {
      removed += batch.length;
    }
  }

  const ids = toClean.map((r) => r.id);
  const { error: upErr } = await supabase
    .from("prato_analisi")
    .update({ foto_path: null, foto_url: null })
    .in("id", ids);

  if (upErr) throw new Error(upErr.message);

  return { removed, cleared: ids.length };
}
