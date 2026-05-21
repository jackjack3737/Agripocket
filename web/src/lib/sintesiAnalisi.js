/** Riepilogo schematizzato da vision_json + report Gemini */

const STATO_LABEL = {
  ottimo: "Ottimo",
  buono: "Buono",
  discreto: "Da monitorare",
  critico: "Critico",
};

const GRAVITA_LABEL = { bassa: "Bassa", media: "Media", alta: "Alta" };

function parseVision(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function estraiSezioniReport(md) {
  if (!md?.trim()) return [];
  const blocks = md.trim().split(/\n(?=##\s)/);
  const out = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const title = lines[0]?.replace(/^##\s*/, "").trim();
    if (!title) continue;
    const body = lines.slice(1).join("\n").trim();
    const punti = body
      .split(/\n+/)
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter((l) => l.length > 10);
    const testo = punti.length ? punti.slice(0, 4) : [body.slice(0, 280)];
    out.push({ titolo: title, punti: testo });
  }
  return out;
}

function itemLista(arr, mapper) {
  if (!Array.isArray(arr) || !arr.length) return [];
  return arr.map(mapper).filter(Boolean);
}

/**
 * @param {{ vision_json?: unknown, report_markdown?: string } | null} analisi
 */
export function sintesiDaAnalisi(analisi) {
  const vision = parseVision(analisi?.vision_json);
  if (!vision && !analisi?.report_markdown) {
    return { vuota: true, sezioni: [], pianoAzione: [] };
  }

  const sezioni = [];

  if (vision?.sintesi_visiva) {
    sezioni.push({
      id: "osservazione",
      titolo: "Cosa vede Gemini",
      icon: "👁",
      righe: [vision.sintesi_visiva],
    });
  }

  if (vision?.diagnosi_avanzata) {
    sezioni.push({
      id: "diagnosi",
      titolo: "Diagnosi",
      icon: "🔬",
      righe: [vision.diagnosi_avanzata],
    });
  }

  const specie = itemLista(vision?.specie_probabili, (s) => {
    const nome = typeof s === "string" ? s : s?.nome;
    if (!nome) return null;
    const conf = typeof s === "object" ? s.confidenza : null;
    return conf ? `${nome} (${conf})` : nome;
  });
  if (specie.length) {
    sezioni.push({ id: "specie", titolo: "Specie probabili", icon: "🌿", righe: specie });
  }

  if (vision?.stato_generale) {
    sezioni.push({
      id: "stato",
      titolo: "Stato generale",
      icon: "📊",
      righe: [STATO_LABEL[vision.stato_generale] || vision.stato_generale],
    });
  }

  const problemi = itemLista(vision?.problemi_rilevati, (p) => {
    if (!p?.problema) return null;
    const g = p.gravita ? ` — ${GRAVITA_LABEL[p.gravita] || p.gravita}` : "";
    return `${p.problema}${g}${p.dettaglio ? `: ${p.dettaglio}` : ""}`;
  });
  const malattie = itemLista(vision?.malattie_sospette, (m) => {
    const nome = typeof m === "string" ? m : m?.nome;
    if (!nome) return null;
    const g = m.gravita ? ` (${GRAVITA_LABEL[m.gravita] || m.gravita})` : "";
    return `${nome}${g}`;
  });
  const combo = [...problemi, ...malattie];
  if (combo.length) {
    sezioni.push({ id: "problemi", titolo: "Problemi / patologie", icon: "⚠", righe: combo });
  }

  const azioni = [];
  if (vision?.stress_idrici?.segni) {
    azioni.push(`Stress idrico: ${vision.stress_idrici.note || "segni visibili"}`);
  }
  if (vision?.feltro_thatch?.presente) {
    azioni.push(`Feltro/thatch: ${vision.feltro_thatch.note || "presente"}`);
  }
  if (vision?.taglio?.giudizio && vision.taglio.giudizio !== "corretto") {
    azioni.push(`Taglio: ${vision.taglio.giudizio.replace(/_/g, " ")}`);
  }
  if (vision?.richiede_analisi_suolo) {
    azioni.push(vision.motivo_analisi_suolo || "Consigliata analisi del suolo in laboratorio");
  }
  if (azioni.length) {
    sezioni.push({ id: "note", titolo: "Note tecniche", icon: "📋", righe: azioni });
  }

  const reportSezioni = estraiSezioniReport(analisi?.report_markdown);
  const pianoAzione = reportSezioni.filter((s) =>
    /piano|azione|consigli|intervent/i.test(s.titolo),
  );
  const altre = reportSezioni.filter(
    (s) => !pianoAzione.includes(s) && !/cosa vede|specie/i.test(s.titolo),
  );

  for (const s of altre.slice(0, 3)) {
    if (sezioni.some((x) => x.titolo === s.titolo)) continue;
    sezioni.push({
      id: `report-${s.titolo}`,
      titolo: s.titolo,
      icon: "📄",
      righe: s.punti,
    });
  }

  return {
    vuota: false,
    sezioni,
    pianoAzione: pianoAzione.flatMap((s) => s.punti).slice(0, 5),
    reportSezioni: altre,
  };
}
