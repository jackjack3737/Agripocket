import { supabase } from "./supabase";

function formatDbError(error) {
  if (error?.code === "PGRST205") {
    return "Tabelle dashboard assenti. Esegui sql/prato_dashboard.sql nel SQL Editor Supabase.";
  }
  return error?.message || "Errore";
}

const PRIORITY_ORDER = { alta: 0, media: 1, bassa: 2 };

export async function loadInterventi(userId) {
  const { data, error } = await supabase
    .from("prato_interventi")
    .select("*")
    .eq("user_id", userId)
    .order("data_prevista", { ascending: true, nullsFirst: false })
    .order("ordine", { ascending: true });

  if (error) throw new Error(formatDbError(error));
  const list = data ?? [];
  return list.sort((a, b) => {
    if (a.stato !== b.stato) return a.stato === "pianificato" ? -1 : 1;
    const pd = (PRIORITY_ORDER[a.priorita] ?? 1) - (PRIORITY_ORDER[b.priorita] ?? 1);
    if (pd !== 0) return pd;
    return String(a.data_prevista || "").localeCompare(String(b.data_prevista || ""));
  });
}

export async function loadUltimaAnalisi(userId) {
  const { data, error } = await supabase
    .from("prato_analisi")
    .select("id, created_at, chunks_used")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(formatDbError(error));
  return data;
}

export async function setInterventoCompletato(id, completato) {
  const { data, error } = await supabase
    .from("prato_interventi")
    .update({
      stato: completato ? "completato" : "pianificato",
      data_completamento: completato ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(formatDbError(error));
  return data;
}

export const PRIORITA_LABEL = { alta: "Alta", media: "Media", bassa: "Bassa" };
export const CATEGORIA_LABEL = {
  taglio: "Taglio",
  irrigazione: "Irrigazione",
  concime: "Concime",
  trattamento: "Trattamento",
  pulizia: "Pulizia",
  altro: "Altro",
};

export function formatDataIt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export function groupInterventi(list) {
  const pianificati = list.filter((i) => i.stato === "pianificato");
  const completati = list.filter((i) => i.stato === "completato");
  const alta = pianificati.filter((i) => i.priorita === "alta");
  const altri = pianificati.filter((i) => i.priorita !== "alta");
  return { alta, altri, completati, pianificati };
}
