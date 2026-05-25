/** Testo «Cosa fare» in calendario — evita tagli a 120 caratteri. */

export const MAX_MESSAGGIO_OPERATIVO_UI = 480;
export const MAX_MESSAGGIO_OPERATIVO_DB = 360;

export function sembraMessaggioTroncato(testo) {
  const t = String(testo || "").trim();
  if (!t) return true;
  if (t.endsWith("…")) return true;
  if (t.length >= 115 && t.length <= 122 && !/[.!?]$/.test(t)) return true;
  if (t.length > 60 && !/[.!?]$/.test(t)) return true;
  return false;
}

/** Prime frasi leggibili da testo lungo (fabbisogno / spiegazione). */
export function introDaTestoLungo(testo, maxLen = MAX_MESSAGGIO_OPERATIVO_UI) {
  const raw = String(testo || "").trim();
  if (!raw) return "";
  const sentences = raw.match(/[^.!?]+[.!?]+/g);
  if (sentences?.length) {
    let out = "";
    for (const s of sentences) {
      const next = (out + s).trim();
      if (next.length > maxLen) break;
      out = next;
      if (out.length >= 120) break;
    }
    if (out.trim()) return out.trim();
  }
  return raw.slice(0, maxLen).trim();
}

/**
 * @param {object} item — riga prato_interventi
 * @param {object|null} det — dettaglio_trattamento parsato
 * @param {object|null} treatment — treatmentFromIntervento
 */
export function messaggioOperativoPerUi(item, det, treatment) {
  const breve =
    det?.messaggio_operativo_breve ||
    treatment?.messaggio_operativo_breve ||
    item?.messaggio_operativo_breve ||
    det?.spiegazione_semplice ||
    item?.messaggio_ux ||
    item?.spiegazione_semplice ||
    "";

  if (breve && !sembraMessaggioTroncato(breve)) {
    return String(breve).trim().slice(0, MAX_MESSAGGIO_OPERATIVO_UI);
  }

  const lungo =
    det?.fabbisogno_fisiologico ||
    item?.fabbisogno_fisiologico ||
    treatment?.fabbisogno_fisiologico ||
    item?.descrizione ||
    breve;

  const intro = introDaTestoLungo(lungo);
  if (intro) return intro;

  return breve || "Un passo semplice per tenere il prato in forma.";
}
