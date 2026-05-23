import { supabase } from "./supabase.js";

export const CALENDARIO_REFRESH_EVENT = "agripocket:refresh-calendario";

/** Adatta date diserbo/rinnovo al meteo suolo (API leggera). */
export async function adattaCalendarioMeteo() {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Accedi per aggiornare il calendario.");

  const res = await fetch("/api/adatta-calendario-meteo", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Aggiornamento calendario non riuscito");

  window.dispatchEvent(new CustomEvent(CALENDARIO_REFRESH_EVENT, { detail: data }));
  return data;
}
