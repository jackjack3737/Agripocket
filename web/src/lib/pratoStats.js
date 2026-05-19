/** Statistiche esagono prato (0–100): base da Gemini `punteggi_assi`, decadimento tempo, cap calendario. */

export const PRATO_STAT_AXES = [
  { key: "idratazione", label: "Idratazione" },
  { key: "nutrizione", label: "Nutrizione" },
  { key: "copertura", label: "Copertura" },
  { key: "salute_fogliare", label: "Salute fogliare" },
  { key: "difesa", label: "Difesa" },
  { key: "manutenzione", label: "Manutenzione" },
];

const MAX_PENALTY_PER_AXIS = 15;
const MAX_VISION_AGE_DAYS = 30;
const EMPTY_STATS = {
  idratazione: 0,
  nutrizione: 0,
  copertura: 0,
  salute_fogliare: 0,
  difesa: 0,
  manutenzione: 0,
};

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function oggiIso() {
  return new Date().toISOString().slice(0, 10);
}

function diffDays(dateString) {
  if (!dateString) return 999;
  const past = new Date(dateString);
  const now = new Date();
  return Math.floor((now - past) / (1000 * 60 * 60 * 24));
}

function normalizePunteggiAssi(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  let valid = 0;
  for (const { key } of PRATO_STAT_AXES) {
    const n = Number(raw[key]);
    if (Number.isFinite(n)) {
      out[key] = clamp(n);
      valid += 1;
    }
  }
  return valid === PRATO_STAT_AXES.length ? out : null;
}

/** Esclude controlli mensili, priorità bassa e voci catalogo automatiche. */
function interventiPerPenalita(interventi) {
  const oggi = oggiIso();
  return interventi.filter((i) => {
    if (i.stato !== "pianificato" || !i.data_prevista || i.data_prevista >= oggi) return false;
    if (i.fonte === "controllo_mensile") return false;
    if (i.priorita === "bassa") return false;
    if (String(i.titolo || "").startsWith("Catalogo —")) return false;
    return true;
  });
}

function getPenalitaCalendario(interventi) {
  const scaduti = interventiPerPenalita(interventi);
  const penalita = { ...EMPTY_STATS };

  for (const task of scaduti) {
    const peso = task.priorita === "alta" ? 8 : 4;
    const cat = String(task.categoria || "").toLowerCase();

    if (cat === "irrigazione" || cat === "umettante") penalita.idratazione += peso;
    if (cat === "concime" || cat === "biostimolante") penalita.nutrizione += peso;
    if (cat === "rinnovo") penalita.copertura += peso;
    if (cat === "trattamento") {
      penalita.salute_fogliare += peso;
      penalita.difesa += peso;
    }
    if (cat === "diserbo") penalita.difesa += peso;
    if (cat === "taglio" || cat === "arieggiatura" || cat === "pulizia") penalita.manutenzione += peso;
  }

  for (const key of Object.keys(penalita)) {
    penalita[key] = Math.min(penalita[key], MAX_PENALTY_PER_AXIS);
  }

  return { penalita, scaduti };
}

function buildInsights(stats, ctx) {
  const { penalita, baseScores, ageDays, decayFactor, hasOverdue, scaduti, weather } = ctx;
  const out = {};

  for (const { key, label } of PRATO_STAT_AXES) {
    const perche = [];
    const migliora = [];
    const base = baseScores[key];
    const pen = penalita[key];

    perche.push(`Dalla foto: ${base}/100 (valutazione visiva AI).`);
    if (ageDays > 0) {
      perche.push(
        `Foto di ${ageDays} giorni fa: decadimento −${Math.round((1 - decayFactor) * 100)}% sul punteggio base.`,
      );
    }
    if (pen > 0) {
      const n = scaduti.filter((i) => penalitaCategoriaSuAsse(i.categoria, key)).length;
      perche.push(
        `Calendario: −${pen} pt (max ${MAX_PENALTY_PER_AXIS} per asse) per ${n} lavoro/i scaduto/i.`,
      );
    } else if (hasOverdue) {
      perche.push("Nessun lavoro scaduto rilevante per questo asse.");
    } else {
      perche.push("Nessun lavoro scaduto: il calendario non abbassa questo indicatore.");
    }

    if (key === "idratazione" && weather?.current?.main?.temp > 32 && pen > 0) {
      perche.push("Meteo: caldo intenso (>32 °C) con irrigazione in ritardo.");
    }

    const score = stats[key];
    if (score >= 75) migliora.push("Ottimo livello: mantieni le cure attuali.");
    else if (score >= 55) migliora.push("Segui il calendario e ripeti un controllo foto tra 2–3 settimane.");
    else {
      migliora.push("Carica una nuova foto dopo aver completato i lavori urgenti in scadenza.");
      if (pen > 0) migliora.push("Completa i trattamenti o le cure in ritardo nel calendario.");
    }

    out[key] = { score, perche, migliora, label };
  }

  return out;
}

function penalitaCategoriaSuAsse(categoria, asse) {
  const cat = String(categoria || "").toLowerCase();
  if (asse === "idratazione") return cat === "irrigazione" || cat === "umettante";
  if (asse === "nutrizione") return cat === "concime" || cat === "biostimolante";
  if (asse === "copertura") return cat === "rinnovo";
  if (asse === "salute_fogliare") return cat === "trattamento";
  if (asse === "difesa") return cat === "trattamento" || cat === "diserbo";
  if (asse === "manutenzione") return cat === "taglio" || cat === "arieggiatura" || cat === "pulizia";
  return false;
}

/**
 * @param {{ interventi?: object[], analisi?: { vision_json?: object, created_at?: string } | null, weather?: object | null }} input
 */
export function computePratoStats({ interventi = [], analisi = null, weather = null } = {}) {
  const vision = analisi?.vision_json;
  const ageDays = diffDays(analisi?.created_at);
  const baseScores = normalizePunteggiAssi(vision?.punteggi_assi);
  const hasValidVision = !!baseScores && ageDays <= MAX_VISION_AGE_DAYS;

  if (!hasValidVision) {
    return {
      stats: { ...EMPTY_STATS },
      media: 0,
      insights: buildEmptyInsights(ageDays, !!vision?.punteggi_assi),
      hasVision: false,
      isExpired: ageDays > MAX_VISION_AGE_DAYS && !!analisi?.created_at,
      needsPunteggiAssi: !!vision && !vision?.punteggi_assi,
      hasInterventi: interventi.length > 0,
      hasOverdue: interventiPerPenalita(interventi).length > 0,
      overdueCount: interventiPerPenalita(interventi).length,
      visionAge: analisi?.created_at ?? null,
      ageDays,
    };
  }

  const decayFactor = Math.max(0, 1 - ageDays / 100);
  const { penalita, scaduti } = getPenalitaCalendario(interventi);
  const hasOverdue = scaduti.length > 0;

  const stats = {};
  let total = 0;

  for (const { key } of PRATO_STAT_AXES) {
    const raw = baseScores[key];
    let score = raw * decayFactor - penalita[key];

    if (key === "idratazione" && weather?.current?.main?.temp > 32 && penalita.idratazione > 0) {
      score -= 10;
    }

    stats[key] = clamp(score);
    total += stats[key];
  }

  const media = clamp(total / PRATO_STAT_AXES.length);
  const insights = buildInsights(stats, {
    penalita,
    baseScores,
    ageDays,
    decayFactor,
    hasOverdue,
    scaduti,
    weather,
  });

  return {
    stats,
    media,
    insights,
    hasVision: true,
    isExpired: false,
    needsPunteggiAssi: false,
    hasInterventi: interventi.length > 0,
    hasOverdue,
    overdueCount: scaduti.length,
    visionAge: analisi?.created_at ?? null,
    ageDays,
    decayFactor,
    penalita,
  };
}

function buildEmptyInsights(ageDays, hadPartialScores) {
  const out = {};
  for (const { key, label } of PRATO_STAT_AXES) {
    const perche = [];
    const migliora = ["Carica una foto recente del prato (analisi in Chat)."];
    if (ageDays > MAX_VISION_AGE_DAYS) {
      perche.push(`Ultima analisi troppo vecchia (${ageDays} giorni, max ${MAX_VISION_AGE_DAYS}).`);
    } else if (hadPartialScores) {
      perche.push("Analisi precedente senza punteggi per asse: serve una nuova foto.");
    } else {
      perche.push("Nessuna foto con punteggi disponibile.");
    }
    out[key] = { score: 0, perche, migliora, label };
  }
  return out;
}

export function buildAxisInsight(key, ctx) {
  return ctx?.insights?.[key] ?? { score: 0, perche: [], migliora: [] };
}

export function labelStatoPrato(media, hasVision = false) {
  if (!hasVision) return "Dato non disponibile";
  if (media >= 85) return "Ottimo";
  if (media >= 70) return "Buono";
  if (media >= 50) return "Discreto";
  if (media >= 36) return "Da recuperare";
  return "Critico";
}
