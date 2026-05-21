import { supabase, loadPratoProfilo } from "./supabase";
import { pollJobUntilDone } from "./pollJob";
import { uploadFotoAnalisiClient } from "./fotoPrato";

async function callAnalizzaApi(base64, mimeType, token, extra = {}) {
  const res = await fetch("/api/analizza-prato", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ imageBase64: base64, mimeType, ...extra }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Analisi non riuscita");

  if (data.async && data.jobId) {
    return pollJobUntilDone(data.jobId, { maxWaitMs: 180000 });
  }

  return data;
}

/**
 * Foto prato → analisi (vision + RAG).
 * Dev e produzione Vercel: /api/analizza-prato
 */
export async function analizzaPratoFoto({ base64, mimeType = "image/jpeg", userId }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Accedi per analizzare il prato");

  const data = await callAnalizzaApi(base64, mimeType, session.access_token);

  if (data.analisiId && userId) {
    try {
      await uploadFotoAnalisiClient(userId, data.analisiId, base64, mimeType);
    } catch {
      /* bucket opzionale */
    }
  }

  let profile = null;
  if (userId) {
    try {
      profile = await loadPratoProfilo(userId);
    } catch {
      /* ignore */
    }
  }

  return {
    report: data.report ?? "",
    vision: data.vision ?? null,
    chunksUsed: data.chunksUsed ?? 0,
    weatherUsed: data.weatherUsed ?? false,
    interventi: data.interventi ?? [],
    analisiId: data.analisiId ?? null,
    dashboardReady: data.dashboardReady ?? false,
    pianoAggiornato: data.pianoAggiornato ?? null,
    profile,
  };
}

/** Foto macchia su zona → analisi mirata (consulente zona). */
export async function chiediAgronomoTesto({ domanda, zonaId }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Accedi per chiedere all'agronomo");

  const res = await fetch("/api/chat-zona", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ domanda: domanda.trim(), zonaId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Risposta non disponibile");
  return {
    risposta: data.risposta ?? "",
    fonte: data.fonte ?? null,
    chunksUsed: data.chunksUsed ?? 0,
  };
}

export async function analizzaMacchiaZona({
  base64,
  mimeType = "image/jpeg",
  userId,
  zonaId,
  zonaNome,
  notaUtente,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Accedi per analizzare la macchia");

  const data = await callAnalizzaApi(base64, mimeType, session.access_token, {
    modalita: "macchia_zona",
    zonaId: zonaId || undefined,
    zonaNome: zonaNome || undefined,
    notaUtente: notaUtente?.trim() || undefined,
  });

  if (data.analisiId && userId) {
    try {
      await uploadFotoAnalisiClient(userId, data.analisiId, base64, mimeType);
    } catch {
      /* bucket opzionale */
    }
  }

  return {
    report: data.report ?? "",
    vision: data.vision ?? null,
    analisiId: data.analisiId ?? null,
    dashboardReady: data.dashboardReady ?? false,
    richiede_analisi_suolo: data.richiede_analisi_suolo ?? false,
    motivo_analisi_suolo: data.motivo_analisi_suolo ?? null,
  };
}
