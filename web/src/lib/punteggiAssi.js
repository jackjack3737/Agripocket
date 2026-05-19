/** Estrazione / fallback punteggi_assi per radar esagono. */

const AXES = ["idratazione", "nutrizione", "copertura", "salute_fogliare", "difesa", "manutenzione"];

const STATO_BASE = { ottimo: 88, buono: 78, discreto: 58, critico: 32 };

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Accetta numero, stringa "85", o testo con prima cifra 0-100. */
export function parseScoreValue(val) {
  if (typeof val === "number" && Number.isFinite(val)) return clamp(val);
  if (typeof val === "string") {
    const m = val.match(/\b(\d{1,3})\b/);
    if (m) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 100) return n;
    }
  }
  return null;
}

/** Solo da oggetto punteggi_assi (tutti e 6 gli assi richiesti). */
export function normalizePunteggiAssiStrict(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const key of AXES) {
    const n = parseScoreValue(raw[key]);
    if (n == null) return null;
    out[key] = n;
  }
  return out;
}

/**
 * Punteggi per l'esagono: da punteggi_assi se validi, altrimenti stima da stato_generale + flag vision.
 * @returns {{ scores: object, fromFallback: boolean } | null}
 */
export function resolvePunteggiAssi(vision) {
  if (!vision || typeof vision !== "object") return null;

  const strict = normalizePunteggiAssiStrict(vision.punteggi_assi);
  if (strict) return { scores: strict, fromFallback: false };

  const partial = {};
  if (vision.punteggi_assi && typeof vision.punteggi_assi === "object") {
    for (const key of AXES) {
      const n = parseScoreValue(vision.punteggi_assi[key]);
      if (n != null) partial[key] = n;
    }
  }

  const stato = String(vision.stato_generale || "").toLowerCase();
  const base = STATO_BASE[stato];
  if (base == null && Object.keys(partial).length === 0) return null;

  const fallbackBase = base ?? 70;
  const out = {};
  for (const key of AXES) {
    out[key] = partial[key] ?? fallbackBase;
  }

  if (vision.stress_idrici?.segni) out.idratazione = clamp(out.idratazione - 14);
  if (/giall|cloros|carenz/i.test(JSON.stringify(vision.problemi_rilevati || ""))) {
    out.nutrizione = clamp(out.nutrizione - 12);
  }
  if (vision.feltro_thatch?.presente) {
    out.salute_fogliare = clamp(out.salute_fogliare - 8);
    out.manutenzione = clamp(out.manutenzione - 10);
  }
  if (vision.taglio?.giudizio === "troppo_basso") out.manutenzione = clamp(out.manutenzione - 12);
  if (vision.taglio?.giudizio === "troppo_alto") out.manutenzione = clamp(out.manutenzione - 6);
  const mal = (vision.malattie_sospette || []).length;
  const erbe = (vision.erbette_infestanti || []).length;
  if (mal > 0) out.difesa = clamp(out.difesa - mal * 12);
  if (erbe > 2) out.difesa = clamp(out.difesa - 8);
  if ((vision.parassiti_sottoprato || []).some((p) => /alta|media/i.test(String(p?.gravita)))) {
    out.difesa = clamp(out.difesa - 10);
  }

  return { scores: out, fromFallback: true };
}
