import { supabase, loadPratoProfilo } from "./supabase";
import { pollJobUntilDone } from "./pollJob";

async function callAnalizzaApi(base64, mimeType, token) {
  const res = await fetch("/api/analizza-prato", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ imageBase64: base64, mimeType }),
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
