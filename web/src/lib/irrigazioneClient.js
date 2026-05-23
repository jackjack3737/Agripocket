/** Calcolo irrigazione giornaliero (ET0 − pioggia → minuti centralina). */

import { supabase } from "./supabase.js";

const CACHE_KEY_PREFIX = "agripocket_irrigazione_";

function cacheKeyForToday() {
  return `${CACHE_KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

/**
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<object>}
 */
export async function fetchIrrigazioneGiornaliera(opts = {}) {
  if (!opts.force) {
    try {
      const raw = sessionStorage.getItem(cacheKeyForToday());
      if (raw) {
        const { at, payload } = JSON.parse(raw);
        const sameDay = new Date(at).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
        if (sameDay && payload?.azione_irrigazione) return payload;
      }
    } catch {
      /* ignore */
    }
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Accedi per vedere il consiglio irrigazione.");

  const res = await fetch("/api/irrigazione-giornaliera", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Calcolo irrigazione non disponibile");

  try {
    sessionStorage.setItem(cacheKeyForToday(), JSON.stringify({ at: Date.now(), payload: data }));
  } catch {
    /* quota */
  }

  return data;
}

export const AZIONE_IRRIGAZIONE_LABEL = {
  AUMENTA: { label: "Aumenta i minuti", tone: "up" },
  DIMINUISCI: { label: "Riduci i minuti", tone: "down" },
  MANTIENI: { label: "Mantieni così", tone: "ok" },
  SPEGNI: { label: "Spegni oggi", tone: "off" },
};
