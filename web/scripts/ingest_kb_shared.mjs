/** Utility condivise ingest/cleanup libri KB */

import { createHash } from "crypto";

export const MIN_WORDS_IT = 200;

export function parseLibroMetadata(soluzione) {
  const s = String(soluzione || "");
  const m = s.match(/metadata:(\{[\s\S]*\})\s*$/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

export function chunkDbKey(meta) {
  if (!meta?.file || meta.chunk_index == null) return null;
  return `${meta.file}|${meta.chunk_index}`;
}

export function estraiCorpoSoluzione(soluzione) {
  const s = String(soluzione || "");
  const m = s.match(/^\[libro_universitario:[^\]]+\]\n([\s\S]*?)\n\n---\nmetadata:/);
  return m ? m[1].trim() : s;
}

export function soluzioneHash(soluzione) {
  return createHash("sha256").update(String(soluzione || "")).digest("hex");
}

export function isGeminiRifiutoAgronomia(testo, minWords = MIN_WORDS_IT) {
  const raw = String(testo || "").trim();
  const t = raw.toLowerCase();
  if (!raw || raw === "SKIP_NO_AGRONOMY" || /^skip/i.test(raw)) return true;
  if (t.split(/\s+/).filter(Boolean).length < minWords) return true;

  const frasiRifiuto = [
    "skip_no_agronomy",
    "non c'è contenuto agronomico",
    "non c'e contenuto agronomico",
    "non contiene alcuna informazione",
    "non essendoci alcun riferimento",
    "non è possibile estrarre",
    "non e possibile estrarre",
    "non è possibile riassumere",
    "non e possibile riassumere",
    "il testo fornito non contiene",
    "il testo fornito è",
    "il contenuto fornito è",
    "non tratta direttamente",
    "devo però precisare",
    "devo pero precisare",
    "nessun contenuto agronomico",
    "regole tassative",
    "come richiesto dalle regole",
    "analizzato attentamente il testo",
    "ho analizzato attentamente",
    "non contiene alcun riferimento a patogeni",
    "non contiene alcun riferimento a pratiche",
    "assente nel documento originale",
  ];

  if (frasiRifiuto.some((f) => t.includes(f))) return true;

  const head = t.slice(0, 900);
  const metaAvvio = [
    /^certo[,!]/,
    /^ecco (il |una |un )?(traduzione|riassunto|sintesi)/,
    /^come agronomo/,
    /^in qualità di agronomo/,
    /^in qualita di agronomo/,
    /^cari colleghi/,
    /^traduzione e (un )?riassunto/,
  ];
  if (metaAvvio.some((re) => re.test(head))) return true;

  const metaRatio =
    (t.match(/come agronomo|testo fornito|regole tassative|non tratta direttamente|non contiene alcun riferimento|devo però precisare|certo, ecco/g) || []).length;
  if (metaRatio >= 4) return true;

  return false;
}
