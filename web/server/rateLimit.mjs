/** Rate limit in-memory per istanza serverless (mitigazione abuso API Gemini). */

const buckets = new Map();

const LIMITS = {
  analizza_foto: { max: 12, windowMs: 60 * 60 * 1000 },
  genera_piano: { max: 4, windowMs: 60 * 60 * 1000 },
  reset_profilo: { max: 3, windowMs: 60 * 60 * 1000 },
};

function pruneOld(entries, now, windowMs) {
  return entries.filter((t) => now - t < windowMs);
}

/**
 * @returns {{ ok: boolean, retryAfterSec?: number }}
 */
export function checkRateLimit(userId, tipo) {
  const cfg = LIMITS[tipo];
  if (!cfg || !userId) return { ok: true };

  const key = `${userId}:${tipo}`;
  const now = Date.now();
  const prev = pruneOld(buckets.get(key) || [], now, cfg.windowMs);

  if (prev.length >= cfg.max) {
    const oldest = prev[0];
    const retryAfterSec = Math.ceil((cfg.windowMs - (now - oldest)) / 1000);
    return { ok: false, retryAfterSec };
  }

  prev.push(now);
  buckets.set(key, prev);
  return { ok: true };
}
