import { loadProdotti } from "./prodottiCatalogo.mjs";
import { fetchWeatherBundle } from "./weatherCore.mjs";
import { arricchisciInterventoTrattamento } from "./trattamentoPipeline.mjs";
import { filtraInterventiFitofarmacoCurativo } from "./regoleFitofarmaci.mjs";
import { integraFotoNelPiano } from "./aggiornaPianoDaFoto.mjs";
import { aggiornaAnalisiFoto, uploadAnalisiFoto } from "./uploadAnalisiFoto.mjs";
import { rimuoviRoutineCalendario } from "./sanitizzaCalendario.mjs";

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

export function normalizeCategoria(c) {
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
  if (/fungic|patogen/.test(v)) return "trattamento";
  return "altro";
}

function rowIntervento(userId, analisiId, i, fonte, zonaId = null) {
  const row = {
    user_id: userId,
    analisi_id: analisiId,
    ...(zonaId ? { zona_id: zonaId } : {}),
    titolo: i.titolo,
    descrizione: i.descrizione || null,
    priorita: i.priorita,
    categoria: i.categoria,
    stato: "pianificato",
    data_prevista: i.data_prevista,
    ordine: i.ordine,
    fonte,
    prodotto_id: i.prodotto_id ?? null,
    prodotto_nome: i.prodotto_nome ?? null,
    dose_totale: i.dose_totale ?? null,
    dose_unita: i.dose_unita ?? null,
    dose_per_mq: i.dose_per_mq ?? null,
    razionale_scientifico: i.razionale_scientifico ?? null,
    messaggio_ux: i.messaggio_ux ?? null,
    macro_categoria: i.macro_categoria ?? null,
    dosaggio_calcolato: i.dosaggio_calcolato ?? null,
    spiegazione_semplice: i.spiegazione_semplice ?? i.messaggio_ux ?? null,
    dettaglio_trattamento: i.dettaglio_trattamento ?? null,
    manual_override: fonte === "ia_foto" ? true : !!i.manual_override,
  };
  if (i.avviso_fitofarmaco) {
    row.dose_totale = null;
    row.dose_unita = null;
    row.dose_per_mq = null;
  }
  return row;
}

async function insertInterventi(admin, rows) {
  if (!rows.length) return [];
  const { data, error } = await admin.from("prato_interventi").insert(rows).select("*");
  if (!error) return data ?? [];

  if (/prodotto_|dose_|dettaglio_trattamento|spiegazione_semplice/.test(error.message || "")) {
    const slim = rows.map(
      ({
        prodotto_id,
        prodotto_nome,
        dose_totale,
        dose_unita,
        dose_per_mq,
        razionale_scientifico,
        messaggio_ux,
        macro_categoria,
        dosaggio_calcolato,
        spiegazione_semplice,
        dettaglio_trattamento,
        ...r
      }) => r,
    );
    const retry = await admin.from("prato_interventi").insert(slim).select("*");
    if (retry.error) throw new Error(`Salvataggio interventi: ${retry.error.message}`);
    return retry.data ?? [];
  }
  throw new Error(`Salvataggio interventi: ${error.message}`);
}

/**
 * @param {string} report
 * @param {object} vision
 * @param {(parts: unknown[], opts?: object) => Promise<string>} geminiGenerate
 * @param {string} geminiKey
 */
export async function extractInterventiFromReport(report, vision, geminiGenerate, geminiKey) {
  const prompt = `Sei un agronomo. Dal report e dalla visione foto, estrai gli interventi URGENTI da calendarizzare.

Report:
${report.slice(0, 6000)}

Visione (JSON):
${JSON.stringify(vision, null, 2).slice(0, 2000)}

Rispondi SOLO JSON valido:
{
  "interventi": [
    {
      "titolo": "macro-azione agronomica (max 60 caratteri, senza nomi commerciali)",
      "descrizione": "perché serve ora e cosa fare (1-2 frasi, linguaggio semplice)",
      "priorita": "alta|media|bassa",
      "categoria": "taglio|irrigazione|concime|trattamento|pulizia|diserbo|arieggiatura|biostimolante|umettante|rinnovo|altro",
      "quando": "oggi|domani|settimana_1|settimana_2|settimana_3|mese_1|mese_2",
      "data_suggerita": "YYYY-MM-DD o null"
    }
  ]
}

Regole:
- 4-8 interventi urgenti (prossime 2-6 settimane), ordinati per urgenza.
- Fungicidi, insetticidi e diserbi post-emergenza SOLO se la foto mostra chiaramente malattie, parassiti, erbacce infestanti o danni (gravita media/alta).
- NON proporre trattamenti preventivi senza segni visibili.
- Pre-emergenza / antigerminanti: solo se erbe annuali o infestazione in germinazione è plausibile dalla situazione.
- Titoli concreti legati a ciò che si vede (es. "Diserbo selettivo trifoglio visibile", non "trattamento preventivo").
- Se parassiti_sottoprato indica popillia o larve con segni/danni: trattamento con insetticida Fly (BOTTOS).
- Se malattie fungine visibili: preferisci fungicida/bio con Trichoderma (BOTTOS) se in catalogo.
- Concimi/biostimolanti: solo BOTTOS; altri fitofarmaci curativi solo con evidenza foto, sempre preferendo BOTTOS (Fly, Trichoderma).`;

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

  let list = Array.isArray(parsed?.interventi) ? parsed.interventi : [];
  list = filtraInterventiFitofarmacoCurativo(
    list.map((item, idx) => ({
      titolo: String(item.titolo || "").trim(),
      descrizione: String(item.descrizione || "").trim(),
      priorita: normalizePriorita(item.priorita),
      categoria: normalizeCategoria(item.categoria),
      data_prevista: parseDataPrevista(item),
      ordine: idx,
    })),
    { vision },
  );
  const base = list
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

  return base;
}

/**
 * Salva analisi, interventi urgenti (con prodotti/dosi su m²) e aggiorna il piano stagionale.
 */
export async function persistAnalisiAndInterventi(
  admin,
  userId,
  { report, vision, chunksUsed, interventi, profilo, imageBase64, mimeType, zonaId },
  { geminiGenerate, geminiKey, fonteInterventi = "ia_foto", integraPiano = true, openWeatherApiKey } = {},
) {
  const insertRow = {
    user_id: userId,
    report_markdown: report,
    vision_json: vision,
    chunks_used: chunksUsed ?? 0,
  };
  if (zonaId) insertRow.zona_id = zonaId;

  const { data: analisi, error: analisiErr } = await admin
    .from("prato_analisi")
    .insert(insertRow)
    .select("id")
    .single();

  if (analisiErr) {
    if (analisiErr.code === "PGRST205") {
      return { analisiId: null, interventi: [], tablesMissing: true, pianoAggiornato: null };
    }
    throw new Error(`Salvataggio analisi: ${analisiErr.message}`);
  }

  const analisiId = analisi.id;

  try {
  if (imageBase64 && analisiId) {
    const foto = await uploadAnalisiFoto(admin, userId, analisiId, imageBase64, mimeType);
    if (foto.foto_path) {
      await aggiornaAnalisiFoto(admin, analisiId, foto);
    }
  }

  await admin
    .from("prato_interventi")
    .delete()
    .eq("user_id", userId)
    .eq("fonte", fonteInterventi)
    .eq("stato", "pianificato");

  const prodotti = await loadProdotti(admin);
  let weatherBundle = null;
  if (profilo?.localita?.trim()) {
    try {
      weatherBundle = await fetchWeatherBundle(profilo.localita, openWeatherApiKey);
    } catch {
      /* opzionale */
    }
  }
  const grezzi = rimuoviRoutineCalendario(interventi ?? []);
  const arricchiti = await Promise.all(
    grezzi.map((i) => arricchisciInterventoTrattamento(i, profilo, prodotti, vision, weatherBundle)),
  );

  let saved = [];
  if (arricchiti.length) {
    const rows = arricchiti.map((i) =>
      rowIntervento(userId, analisiId, i, fonteInterventi, zonaId),
    );
    saved = await insertInterventi(admin, rows);
  }

  let pianoAggiornato = null;
  if (integraPiano && geminiGenerate && geminiKey) {
    try {
      pianoAggiornato = await integraFotoNelPiano({
        admin,
        userId,
        analisiId,
        profilo,
        vision,
        report,
        interventiUrgenti: arricchiti,
        geminiGenerate,
        geminiKey,
        openWeatherApiKey,
      });
    } catch (e) {
      console.warn("[analizza-prato] integra piano:", e.message);
    }
  }

  const tutti = [...saved];
  if (pianoAggiornato?.inseriti?.length) tutti.push(...pianoAggiornato.inseriti);

  return {
    analisiId,
    interventi: tutti,
    tablesMissing: false,
    pianoAggiornato,
    urgenti: saved,
  };
  } catch (e) {
    await rollbackAnalisiParziale(admin, userId, analisiId);
    throw e;
  }
}

async function rollbackAnalisiParziale(admin, userId, analisiId) {
  if (!analisiId) return;
  try {
    await admin.from("prato_interventi").delete().eq("analisi_id", analisiId);
    await admin
      .from("prato_interventi")
      .delete()
      .eq("user_id", userId)
      .eq("fonte", fonteInterventi);
    await admin.from("prato_analisi").delete().eq("id", analisiId);
  } catch (err) {
    console.warn("[persistAnalisi] rollback:", err.message);
  }
}
