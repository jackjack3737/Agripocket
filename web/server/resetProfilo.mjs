import { createClient } from "@supabase/supabase-js";
import { adminClient } from "./jobs.mjs";

/** Stato profilo vuoto dopo reset (onboarding da rifare). */
const PROFILO_VUOTO = {
  uso: null,
  tipo_seme: null,
  marca_seme: null,
  note: null,
  esposizione: null,
  tipo_terreno: null,
  irrigazione: null,
  superficie_mq: null,
  localita: null,
  onboarding_completato: false,
  disclaimer_accettato_at: null,
  eta_prato: null,
  obiettivo: null,
  frequenza_taglio: null,
  altezza_taglio_cm: null,
  animali: null,
  problemi_noti: [],
  pendenza: null,
  ristagno_acqua: null,
  ombra_zone_pct: null,
  ph_terreno: null,
  ph_valore: null,
  analisi_terreno_fatta: false,
  note_terreno: null,
  prato_zone: null,
};

async function deleteUserFotoStorage(admin, userId) {
  try {
    const { data: files, error } = await admin.storage.from("prato-foto").list(userId, { limit: 200 });
    if (error || !files?.length) return;
    const paths = files.map((f) => `${userId}/${f.name}`);
    await admin.storage.from("prato-foto").remove(paths);
  } catch {
    /* bucket opzionale */
  }
}

/**
 * Cancella calendario, analisi foto e azzera profilo prato.
 * @param {{ authHeader: string, env: object }} opts
 */
export async function resetProfiloUtente({ authHeader, env }) {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey || !anonKey) {
    throw new Error("Config Supabase incompleta");
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) throw new Error("Sessione non valida");

  const userId = userData.user.id;
  const admin = adminClient(env);

  const { error: delInt } = await admin.from("prato_interventi").delete().eq("user_id", userId);
  if (delInt && delInt.code !== "PGRST205") {
    throw new Error(`Reset interventi: ${delInt.message}`);
  }

  const { error: delAn } = await admin.from("prato_analisi").delete().eq("user_id", userId);
  if (delAn && delAn.code !== "PGRST205") {
    throw new Error(`Reset analisi: ${delAn.message}`);
  }

  await admin.from("prato_jobs").delete().eq("user_id", userId).then(() => {});

  await deleteUserFotoStorage(admin, userId);

  const row = { user_id: userId, ...PROFILO_VUOTO };
  const { data: profile, error: profErr } = await admin
    .from("prato_profilo")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();

  if (profErr) throw new Error(`Reset profilo: ${profErr.message}`);

  return { profile, reset: true };
}
