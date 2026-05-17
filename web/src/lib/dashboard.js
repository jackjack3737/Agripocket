import { supabase } from "./supabase";

function formatDbError(error) {
  if (error?.code === "PGRST205") {
    return "Tabelle dashboard assenti. Esegui sql/prato_dashboard.sql nel SQL Editor Supabase.";
  }
  return error?.message || "Errore";
}

/** Livello importanza 1–3 (solo visualizzazione, non per ordinare). */
export const PRIORITY_LEVEL = { alta: 3, media: 2, bassa: 1 };

function compareCronologico(a, b) {
  const da = String(a.data_prevista || "");
  const db = String(b.data_prevista || "");
  if (da !== db) {
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  }
  const oa = a.ordine ?? 0;
  const ob = b.ordine ?? 0;
  if (oa !== ob) return oa - ob;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

export function sortInterventiCronologico(list) {
  return [...list].sort((a, b) => {
    if (a.stato !== b.stato) return a.stato === "pianificato" ? -1 : 1;
    return compareCronologico(a, b);
  });
}

export async function loadInterventi(userId) {
  const { data, error } = await supabase
    .from("prato_interventi")
    .select("*")
    .eq("user_id", userId)
    .order("data_prevista", { ascending: true, nullsFirst: false })
    .order("ordine", { ascending: true });

  if (error) throw new Error(formatDbError(error));
  return sortInterventiCronologico(data ?? []);
}

export async function loadUltimaAnalisi(userId) {
  const { data, error } = await supabase
    .from("prato_analisi")
    .select("id, created_at, chunks_used, vision_json")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(formatDbError(error));
  return data;
}

export async function setInterventoManualOverride(id, manualOverride) {
  const patch = { manual_override: !!manualOverride };
  const { data, error } = await supabase.from("prato_interventi").update(patch).eq("id", id).select().single();
  if (error) {
    if (error.message?.includes("manual_override")) return null;
    throw new Error(formatDbError(error));
  }
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
  diserbo: "Diserbo",
  arieggiatura: "Arieggiatura",
  biostimolante: "Biostimolante",
  umettante: "Umettante",
  rinnovo: "Rinnovo / seme",
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
  const pianificati = sortInterventiCronologico(list.filter((i) => i.stato === "pianificato"));
  const completati = sortInterventiCronologico(list.filter((i) => i.stato === "completato"));
  const daFoto = pianificati.filter((i) => i.fonte === "ia_foto");
  const daCalendario = pianificati.filter((i) => i.fonte === "calendario_stagionale");
  const senzaData = pianificati.filter((i) => !i.data_prevista);
  return { completati, pianificati, daFoto, daCalendario, senzaData };
}

/** Raggruppa interventi pianificati per data_prevista (giorno per giorno). */
export function groupInterventiPerGiorno(list, { maxGiorni = 365 } = {}) {
  const oggi = new Date().toISOString().slice(0, 10);
  const pianificati = sortInterventiCronologico(
    list.filter((i) => i.stato === "pianificato" && i.data_prevista)
  );

  const byDay = new Map();
  for (const item of pianificati) {
    if (item.data_prevista < oggi) continue;
    if (!byDay.has(item.data_prevista)) byDay.set(item.data_prevista, []);
    byDay.get(item.data_prevista).push(item);
  }

  return [...byDay.entries()]
    .slice(0, maxGiorni)
    .map(([data, items]) => ({
      data,
      items: sortInterventiCronologico(items),
    }));
}

/** Elenco lineare dei prossimi lavori (fallback se serve). */
export function prossimiInterventi(list, limit = 120) {
  const oggi = new Date().toISOString().slice(0, 10);
  return sortInterventiCronologico(
    list.filter((i) => i.stato === "pianificato" && i.data_prevista && i.data_prevista >= oggi)
  ).slice(0, limit);
}

export function haCalendarioStagionale(list) {
  return list.some((i) => i.fonte === "calendario_stagionale");
}

export function formatMeseIt(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });
}

/** Raggruppa per mese (YYYY-MM) con giorni al interno. */
export function groupInterventiPerMese(list) {
  const giorni = groupInterventiPerGiorno(list);
  const byMonth = new Map();

  for (const day of giorni) {
    const monthKey = day.data.slice(0, 7);
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, { monthKey, giorni: [] });
    }
    byMonth.get(monthKey).giorni.push(day);
  }

  return [...byMonth.values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map((m) => ({
      ...m,
      label: formatMeseIt(m.monthKey),
      total: m.giorni.reduce((s, g) => s + g.items.length, 0),
    }));
}
