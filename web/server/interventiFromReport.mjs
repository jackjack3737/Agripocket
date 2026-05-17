const PRIORITY_ORDER = { alta: 0, media: 1, bassa: 2 };

const QUANDO_DAYS = {
  oggi: 0,
  domani: 1,
  settimana_1: 3,
  settimana_2: 10,
  settimana_3: 17,
  mese_1: 25,
  mese_2: 45,
};

function parseDataPrevista(item) {
  const raw = item?.data_suggerita?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date();
  const offset = QUANDO_DAYS[item?.quando] ?? 7;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function normalizePriorita(p) {
  const v = String(p || "media").toLowerCase();
  if (v === "alta" || v === "media" || v === "bassa") return v;
  return "media";
}

function normalizeCategoria(c) {
  const v = String(c || "altro").toLowerCase();
  const ok = [
    "taglio",
    "irrigazione",
    "concime",
    "trattamento",
    "pulizia",
    "diserbo",
    "arieggiatura",
    "biostimolante",
    "umettante",
    "rinnovo",
    "altro",
  ];
  if (ok.includes(v)) return v;
  if (/diserb|erbic/.test(v)) return "diserbo";
  if (/scarific|ariegg|aeraz/.test(v)) return "arieggiatura";
  if (/biostim/.test(v)) return "biostimolante";
  if (/umett|surfact/.test(v)) return "umettante";
  if (/seme|overseed|rinnov/.test(v)) return "rinnovo";
  return "altro";
}

/**
 * @param {string} report
 * @param {object} vision
 * @param {(parts: unknown[], opts?: object) => Promise<string>} geminiGenerate
 * @param {string} geminiKey
 */
export async function extractInterventiFromReport(report, vision, geminiGenerate, geminiKey) {
  const prompt = `Sei un agronomo. Dal report e dalla visione foto, estrai gli interventi da calendarizzare per il proprietario del prato.

Report:
${report.slice(0, 6000)}

Visione (JSON):
${JSON.stringify(vision, null, 2).slice(0, 2000)}

Rispondi SOLO JSON valido:
{
  "interventi": [
    {
      "titolo": "breve (max 60 caratteri)",
      "descrizione": "cosa fare e perché (1-2 frasi)",
      "priorita": "alta|media|bassa",
      "categoria": "taglio|irrigazione|concime|trattamento|pulizia|diserbo|arieggiatura|biostimolante|umettante|rinnovo|altro",
      "quando": "oggi|domani|settimana_1|settimana_2|settimana_3|mese_1|mese_2",
      "data_suggerita": "YYYY-MM-DD o null"
    }
  ]
}

Regole:
- 4-8 interventi, ordinati per urgenza (problemi IA con gravità alta prima).
- "priorita": alta = rischio danno prato / problema grave in foto; media = manutenzione importante; bassa = prevenzione.
- Basati su "Piano d'azione" e problemi rilevati nella visione.
- Titoli concreti (es. "Alza taglio a 5 cm", "Irrigazione profonda mattina").`;

  const raw = await geminiGenerate(geminiKey, [{ text: prompt }], {
    json: true,
    maxTokens: 2048,
    temperature: 0.25,
  });

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return [];
  }

  const list = Array.isArray(parsed?.interventi) ? parsed.interventi : [];
  return list
    .filter((i) => i?.titolo?.trim())
    .map((item, idx) => ({
      titolo: String(item.titolo).trim().slice(0, 120),
      descrizione: String(item.descrizione || "").trim().slice(0, 500),
      priorita: normalizePriorita(item.priorita),
      categoria: normalizeCategoria(item.categoria),
      data_prevista: parseDataPrevista(item),
      ordine: idx,
    }))
    .sort((a, b) => PRIORITY_ORDER[a.priorita] - PRIORITY_ORDER[b.priorita]);
}

/**
 * Salva analisi + interventi (sostituisce pianificati IA non completati).
 */
export async function persistAnalisiAndInterventi(admin, userId, { report, vision, chunksUsed, interventi }) {
  const { data: analisi, error: analisiErr } = await admin
    .from("prato_analisi")
    .insert({
      user_id: userId,
      report_markdown: report,
      vision_json: vision,
      chunks_used: chunksUsed ?? 0,
    })
    .select("id")
    .single();

  if (analisiErr) {
    if (analisiErr.code === "PGRST205") {
      return { analisiId: null, interventi: [], tablesMissing: true };
    }
    throw new Error(`Salvataggio analisi: ${analisiErr.message}`);
  }

  await admin
    .from("prato_interventi")
    .delete()
    .eq("user_id", userId)
    .eq("fonte", "ia_foto")
    .eq("stato", "pianificato");

  if (!interventi?.length) {
    return { analisiId: analisi.id, interventi: [], tablesMissing: false };
  }

  const rows = interventi.map((i) => ({
    user_id: userId,
    analisi_id: analisi.id,
    titolo: i.titolo,
    descrizione: i.descrizione || null,
    priorita: i.priorita,
    categoria: i.categoria,
    stato: "pianificato",
    data_prevista: i.data_prevista,
    ordine: i.ordine,
    fonte: "ia_foto",
  }));

  const { data: saved, error: intErr } = await admin
    .from("prato_interventi")
    .insert(rows)
    .select("*");

  if (intErr) throw new Error(`Salvataggio interventi: ${intErr.message}`);

  return { analisiId: analisi.id, interventi: saved ?? [], tablesMissing: false };
}
