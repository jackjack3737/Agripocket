/**
 * Registrazione irrigazione eseguita dall'utente (minuti per linea → mm su serbatoio).
 */

import { capacitaCampoMm, pluviometriaMmOra } from "./motoreIrrigazione.mjs";

export function oggiIso() {
  return new Date().toISOString().slice(0, 10);
}

/** @param {object|null|undefined} profilo */
export function estraiLogIrrigazioneOggi(profilo) {
  const raw = profilo?.irrigazione_oggi;
  const io = typeof raw === "string" ? safeJson(raw) : raw;
  const log = io?.irrigazione_utente;
  if (!log?.data || log.data !== oggiIso()) return null;
  return log;
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** mm applicati da minuti centralina e pluviometria linea. */
export function mmDaMinutiLinea(minuti, pluv_mm_h) {
  const m = Math.max(0, Number(minuti) || 0);
  const pluv = Math.max(1, Number(pluv_mm_h) || 12);
  return Math.round((m / 60) * pluv * 10) / 10;
}

/**
 * @param {{ linee: { zona_numero: number, minuti: number }[], programma_zone?: object, input: object }} p
 */
export function costruisciLogIrrigazione({ linee, programma_zone, input }) {
  const zone = programma_zone?.zone || [];
  const out = [];
  let mmTotal = 0;

  for (const l of linee) {
    const n = Number(l.zona_numero);
    const minuti = Math.min(180, Math.max(0, Math.round(Number(l.minuti) || 0)));
    if (minuti <= 0) continue;
    const z = zone.find((x) => x.zona_numero === n);
    const pluv = z?.pluviometria_mm_h ?? pluviometriaMmOra(input?.tipo_irrigatori);
    const mm = mmDaMinutiLinea(minuti, pluv);
    mmTotal += mm;
    out.push({
      zona_numero: n,
      minuti,
      mm_stimati: mm,
      modalita: z?.modalita ?? null,
    });
  }

  const cap = capacitaCampoMm(input?.tipo_terreno);
  const suoloPrima = Number(input?.stato_suolo_mm_oggi);
  const baseSuolo = Number.isFinite(suoloPrima) ? suoloPrima : cap * 0.5;
  const suoloDopo = Math.min(cap, Math.round((baseSuolo + mmTotal) * 10) / 10);

  return {
    data: oggiIso(),
    registrato_il: new Date().toISOString(),
    linee: out,
    mm_totali_stimati: Math.round(mmTotal * 10) / 10,
    suolo_prima_mm: Math.round(baseSuolo * 10) / 10,
    suolo_dopo_mm: suoloDopo,
    suolo_dopo_pct: Math.min(100, Math.max(0, Math.round((suoloDopo / cap) * 100))),
  };
}

/** Linee precompilate dai consigli del motore. */
export function lineeConsigliateDaProgramma(programma_zone) {
  return (programma_zone?.zone || [])
    .filter((z) => z.attiva_oggi && (z.minuti_totali_linea ?? z.minuti_per_ciclo ?? 0) > 0)
    .map((z) => ({
      zona_numero: z.zona_numero,
      minuti: z.minuti_totali_linea ?? z.minuti_per_ciclo ?? 0,
    }));
}

/**
 * Aggiorna bilancio serbatoio e messaggio dopo «Ho irrigato».
 * @param {object} risultato output calcolaIrrigazioneGiornaliera
 * @param {object|null} log
 */
export function applicaLogUtenteSuRisultato(risultato, log) {
  if (!log || !risultato) return risultato;

  const cap = risultato.bilancio_serbatoio?.capacita_campo_mm ?? risultato.dati_tecnici?.capacita_campo_mm ?? 14;
  const mad = risultato.bilancio_serbatoio?.mad_mm ?? cap * 0.5;
  const suoloDopo = Math.min(cap, Number(log.suolo_dopo_mm) || cap);
  const pct = Math.min(100, Math.max(0, Math.round((suoloDopo / cap) * 100)));
  const mmMancanti = Math.max(0, Math.round((mad - suoloDopo) * 10) / 10);

  const lineeTxt =
    log.linee?.length > 0
      ? log.linee.map((l) => `L${l.zona_numero} ${l.minuti} min`).join(", ")
      : `${log.mm_totali_stimati} mm`;

  const bilancio_serbatoio = {
    ...risultato.bilancio_serbatoio,
    stato_suolo_mm: suoloDopo,
    livello_serbatoio_pct: pct,
    mm_mancanti_oggi: mmMancanti,
    fabbisogno_oggi_mm: suoloDopo >= mad - 0.5 ? 0 : risultato.bilancio_serbatoio?.fabbisogno_oggi_mm ?? 0,
    irrigazione_utente: true,
    riepilogo: `Irrigato da te · serbatoio ${pct}% (+${log.mm_totali_stimati} mm stimati)`,
  };

  return {
    ...risultato,
    irrigazione_utente: log,
    azione_irrigazione: "MANTIENI",
    bilancio_serbatoio,
    messaggio_ux_append: `Hai registrato l'irrigazione (${lineeTxt}). Il serbatoio simulato è ora al ${pct}%.`,
  };
}
