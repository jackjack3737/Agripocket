import { supabase } from "./supabase";

export async function pollJobUntilDone(jobId, { intervalMs = 2500, maxWaitMs = 180000 } = {}) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Sessione scaduta");

  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`/api/job-status?jobId=${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);

    if (data.status === "completed") return data.result ?? data;
    if (data.status === "failed") {
      throw new Error(data.error || "Operazione fallita");
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("Operazione troppo lunga. Riprova tra poco.");
}
