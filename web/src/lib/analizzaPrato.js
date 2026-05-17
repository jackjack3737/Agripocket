import { supabase, loadPratoProfilo } from "./supabase";

/**
 * Foto prato → analisi (vision + RAG).
 * Dev: plugin Vite su /api/analizza-prato (legge crawler/.env)
 * Prod: Supabase Edge Function analizza-prato (dopo deploy)
 */
export async function analizzaPratoFoto({ base64, mimeType = "image/jpeg", userId }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Accedi per analizzare il prato");

  if (import.meta.env.DEV) {
    const res = await fetch("/api/analizza-prato", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analisi non riuscita");
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
      profile,
    };
  }

  const { data, error } = await supabase.functions.invoke("analizza-prato", {
    body: { imageBase64: base64, mimeType },
  });

  if (error) {
    throw new Error(
      (error.message || "Errore rete") +
        " — in produzione serve deploy: scripts/deploy_analizza_prato.ps1"
    );
  }
  if (data?.error) throw new Error(data.error);

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
    profile,
  };
}
