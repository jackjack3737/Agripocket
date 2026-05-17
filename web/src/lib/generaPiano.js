import { supabase } from "./supabase";

export async function generaPianoAnnuale() {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Accedi per generare il calendario.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);

  const res = await fetch("/api/genera-piano", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
  return data;
}
