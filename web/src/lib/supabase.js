import { createClient } from "@supabase/supabase-js";
import { parseMqInput } from "./parseMq";

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

  const row = {
    user_id: userId,
    uso: profile.uso,
    tipo_seme: null,
    marca_seme: profile.marca_seme || null,
    note: null,
    esposizione: profile.esposizione,
    tipo_terreno: profile.tipo_terreno,
    irrigazione: profile.irrigazione,
    superficie_mq: (() => {
      const mq = parseMqInput(profile.superficie_mq);
      return mq != null ? Math.round(mq) : null;
    })(),
    localita: profile.localita?.trim() || null,
    onboarding_completato: true,
  };
  const { data, error } = await supabase
    .from("prato_profilo")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw new Error(formatDbError(error));
  return data;
}
