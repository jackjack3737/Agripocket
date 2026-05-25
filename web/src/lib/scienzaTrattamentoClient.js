import { supabase } from "./supabase.js";

/** Interroga KB + sintesi per un intervento calendario. */
export async function fetchScienzaTrattamento(intervento) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Accedi per vedere la scienza del trattamento.");

  const res = await fetch("/api/scienza-trattamento", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ intervento }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Recupero scienza non riuscito");
  return data;
}
