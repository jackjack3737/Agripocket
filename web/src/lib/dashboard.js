import { supabase } from "./supabase";
import { filtraCalendarioStrategico } from "./abitudiniPrato.js";

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
    .select("id, created_at, chunks_used, vision_json, foto_url")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("foto_url")) {
      const fallback = await supabase
        .from("prato_analisi")
        .select("id, created_at, chunks_used, vision_json")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallback.error) throw new Error(formatDbError(fallback.error));
      return fallback.data;
    }
    throw new Error(formatDbError(error));
  }
  return data;
}

function addMonthsYyyyMm(yyyyMm, delta) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Inserisce controlli mensili foto mancanti (12 mesi avanti). */
export async function syncControlliMensili(userId) {
  const oggi = new Date().toISOString().slice(0, 10);
  const list = await loadInterventi(userId);
  const mesiPresenti = new Set(
    list.filter((i) => i.fonte === "controllo_mensile").map((i) => (i.data_prevista || "").slice(0, 7)),
  );

  const rows = [];
  let monthKey = oggi.slice(0, 7);
  for (let i = 0; i < 12; i++) {
    if (i > 0) monthKey = addMonthsYyyyMm(monthKey, 1);
    if (mesiPresenti.has(monthKey)) continue;
    const data = `${monthKey}-12`;
    if (data < oggi) continue;
    rows.push({
      user_id: userId,
      titolo: "Controllo mensile — foto del prato",
      descrizione:
        "Carica una foto aggiornata del prato (analisi visiva + aggiornamento esagono). Tocca «Carica foto».",
      priorita: "media",
      categoria: "altro",
      stato: "pianificato",
      data_prevista: data,
      ordine: 50,
      fonte: "controllo_mensile",
    });
  }

  if (!rows.length) return 0;

  const { error } = await supabase.from("prato_interventi").insert(rows);
  if (error) {
    if (error.message?.includes("fonte")) return 0;
    throw new Error(formatDbError(error));
  }
  return rows.length;
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
    filtraCalendarioStrategico(
      list.filter((i) => i.stato === "pianificato" && i.data_prevista),
    ),
  );

  const byDay = new Map();
  for (const item of pianificati) {
    const inRitardo = item.data_prevista < oggi;
    const giorno = inRitardo ? oggi : item.data_prevista;
    if (!byDay.has(giorno)) byDay.set(giorno, []);
    byDay.get(giorno).push({
      ...item,
      isRitardo: inRitardo,
      data_originale: inRitardo ? item.data_prevista : undefined,
    });
  }

  const giorni = [...byDay.entries()].map(([data, items]) => ({
    data,
    items: sortInterventiCronologico(
      [...items].sort((a, b) => (b.isRitardo ? 1 : 0) - (a.isRitardo ? 1 : 0)),
    ),
  }));

  giorni.sort((a, b) => {
    if (a.data === oggi && b.data !== oggi) return -1;
    if (b.data === oggi && a.data !== oggi) return 1;
    return a.data.localeCompare(b.data);
  });

  return giorni.slice(0, maxGiorni);
}

/** Elenco lineare dei prossimi lavori (fallback se serve). */
export function prossimiInterventi(list, limit = 120) {
  const oggi = new Date().toISOString().slice(0, 10);
  const mapped = filtraCalendarioStrategico(
    list.filter((i) => i.stato === "pianificato" && i.data_prevista),
  ).map((i) => {
    if (i.data_prevista < oggi) {
      return { ...i, isRitardo: true, data_originale: i.data_prevista, data_prevista: oggi };
    }
    return i;
  });
  return sortInterventiCronologico(mapped).slice(0, limit);
}

export function haCalendarioStagionale(list) {
  return list.some((i) => i.fonte === "calendario_stagionale");
}

/** Filtri calendario: tipo lavoro + ambito temporale. */
export const CALENDARIO_TIPO_FILTRI = {
  tutti: { label: "Tutti", categorie: null },
  trattamenti: {
    label: "Trattamenti",
    categorie: ["trattamento", "diserbo", "concime", "biostimolante", "umettante", "rinnovo"],
  },
  giardino: {
    label: "Lavori in giardino",
    categorie: ["taglio", "arieggiatura", "pulizia", "irrigazione"],
  },
};

export const CALENDARIO_AMBITI = {
  mese: { label: "Questo mese" },
  anno: { label: "Tutto l'anno" },
};

export function filtraInterventiPerCalendario(
  list,
  { tipo = "tutti", ambito = "anno", meseCorrente } = {},
) {
  const cfg = CALENDARIO_TIPO_FILTRI[tipo] ?? CALENDARIO_TIPO_FILTRI.tutti;
  let out = filtraCalendarioStrategico(list);

  if (cfg.categorie) {
    out = out.filter((i) => cfg.categorie.includes(i.categoria));
    out = out.filter((i) => i.fonte !== "controllo_mensile");
  }

  if (ambito === "mese" && meseCorrente) {
    out = out.filter((i) => i.data_prevista && i.data_prevista.slice(0, 7) === meseCorrente);
  }

  return out;
}

export function contaLavoriPianificatiFiltrati(list, opts) {
  const oggi = new Date().toISOString().slice(0, 10);
  return filtraInterventiPerCalendario(list, opts).filter(
    (i) => i.stato === "pianificato" && i.data_prevista,
  ).length;
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
