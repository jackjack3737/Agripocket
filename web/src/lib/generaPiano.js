import { supabase } from "./supabase";
import { pollJobUntilDone } from "./pollJob";

export async function generaPianoAnnuale() {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Accedi per generare il calendario.");

  const res = await fetch("/api/genera-piano", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);

  if (data.async && data.jobId) {
    return pollJobUntilDone(data.jobId, { maxWaitMs: 180000 });
  }

  return data;
}
