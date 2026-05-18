import { createClient } from "@supabase/supabase-js";
import { parseMqInput } from "./parseMq";
import { computeOmbraZonePct } from "./pratoZone";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn(
    "Manca web/.env.local: copia VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY da crawler/.env"
  );
}

export const supabase = createClient(url || "", key || "");

function formatDbError(error) {
  if (!error) return "Errore di salvataggio";

  if (error.code === "PGRST205") {
    return "Tabella prato_profilo non visibile all'API. In SQL Editor esegui sql/prato_profilo.sql poi NOTIFY pgrst reload.";
  }
  if (error.code === "23503") {
    return "Profilo utente mancante. Esegui sql/patch_ensure_usersagropocket.sql nel SQL Editor, poi riprova.";
  }
  if (error.code === "42501") {
    return "Permesso negato. Esci e accedi di nuovo, poi riprova.";
  }
  if (error.code === "PGRST202") {
    return "Funzione ensure_my_agropocket_profile assente. Esegui sql/patch_ensure_usersagropocket.sql nel SQL Editor.";
  }

  return error.message || "Errore di salvataggio";
}

/** Crea/aggiorna riga usersagropocket per l'utente loggato (serve prima di prato_profilo). */
export async function ensureAgropocketUser() {
  const { error } = await supabase.rpc("ensure_my_agropocket_profile");
  if (error) throw new Error(formatDbError(error));
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function loadPratoProfilo(userId) {
  const { data, error } = await supabase
    .from("prato_profilo")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(formatDbError(error));
  return data;
}

export async function updatePratoZoneMappa(userId, prato_zone) {
  await ensureAgropocketUser();
  const ombra_zone_pct = prato_zone ? computeOmbraZonePct(prato_zone) : null;
  const { data, error } = await supabase
    .from("prato_profilo")
    .update({
      prato_zone,
      ...(ombra_zone_pct ? { ombra_zone_pct } : {}),
    })
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(formatDbError(error));
  return data;
}

export async function updatePratoLocalita(userId, localita) {
  await ensureAgropocketUser();
  const { data, error } = await supabase
    .from("prato_profilo")
    .update({ localita: localita?.trim() || null })
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(formatDbError(error));
  return data;
}

export async function savePratoProfilo(userId, profile) {
  await ensureAgropocketUser();

  const phRaw = profile.ph_valore;
  const phNum =
    typeof phRaw === "number"
      ? phRaw
      : phRaw != null && String(phRaw).trim()
        ? Number(String(phRaw).trim().replace(",", "."))
        : null;

  const row = {
    user_id: userId,
    uso: profile.uso,
    tipo_seme: null,
    marca_seme: profile.marca_seme || null,
    note: null,
    esposizione: profile.esposizione,
    tipo_terreno: profile.tipo_terreno,
    irrigazione: profile.irrigazione,
    eta_prato: profile.eta_prato || null,
    obiettivo: profile.obiettivo || null,
    frequenza_taglio: profile.frequenza_taglio || null,
    altezza_taglio_cm: profile.altezza_taglio_cm || null,
    animali: profile.animali || null,
    problemi_noti: Array.isArray(profile.problemi_noti) ? profile.problemi_noti : [],
    pendenza: profile.pendenza || null,
    ristagno_acqua: profile.ristagno_acqua || null,
    ph_terreno: profile.ph_terreno || null,
    ph_valore:
      phNum != null && Number.isFinite(phNum) && phNum >= 4 && phNum <= 9
        ? Math.round(phNum * 10) / 10
        : null,
    analisi_terreno_fatta: !!profile.analisi_terreno_fatta,
    note_terreno: profile.note_terreno?.trim() || null,
    prato_zone: profile.prato_zone && typeof profile.prato_zone === "object" ? profile.prato_zone : null,
    ombra_zone_pct: (() => {
      if (profile.prato_zone) {
        const fromMap = computeOmbraZonePct(profile.prato_zone);
        if (fromMap) return fromMap;
      }
      return profile.ombra_zone_pct || null;
    })(),
    superficie_mq: (() => {
      const mq = parseMqInput(profile.superficie_mq);
      return mq != null ? Math.round(mq) : null;
    })(),
    localita: profile.localita?.trim() || null,
    onboarding_completato: true,
    disclaimer_accettato_at: profile.disclaimer_accettato ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase
    .from("prato_profilo")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw new Error(formatDbError(error));
  return data;
}
