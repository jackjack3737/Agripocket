import { createClient } from "@supabase/supabase-js";
import { extractInterventiFromReport, persistAnalisiAndInterventi } from "./interventiFromReport.mjs";
import { formatProfileForPrompt } from "./profileContext.mjs";
import { fetchWeatherBundle, formatWeatherForPrompt } from "./weatherCore.mjs";
import { registraFocolaiDaVision } from "./focolaiRegionali.mjs";
import { testoAlertAnalisiSuolo } from "./laboratoriSuolo.mjs";
import { loadZonaIdForUser } from "./zoneMeteo.mjs";

const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";

const ASSI_KEYS = [
  "idratazione",
  "nutrizione",
  "copertura",
  "salute_fogliare",
  "difesa",
  "manutenzione",
];

function parseScoreValue(val) {
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.max(0, Math.min(100, Math.round(val)));
  }
  if (typeof val === "string") {
    const m = val.match(/\b(\d{1,3})\b/);
    if (m) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 100) return n;
    }
  }
  return null;
}

function inferPunteggiAssi(vision) {
  const STATO_BASE = { ottimo: 88, buono: 78, discreto: 58, critico: 32 };
  const raw = vision?.punteggi_assi;
  const out = {};
  if (raw && typeof raw === "object") {
    for (const key of ASSI_KEYS) {
      const n = parseScoreValue(raw[key]);
      if (n != null) out[key] = n;
    }
  }
  if (Object.keys(out).length === ASSI_KEYS.length) return out;

  const base = STATO_BASE[String(vision?.stato_generale || "").toLowerCase()];
  if (base == null && Object.keys(out).length === 0) return null;

  const fb = base ?? 70;
  const filled = {};
  for (const key of ASSI_KEYS) {
    filled[key] = out[key] ?? fb;
  }
  if (vision?.stress_idrici?.segni) filled.idratazione = Math.max(0, filled.idratazione - 14);
  if (vision?.feltro_thatch?.presente) filled.manutenzione = Math.max(0, filled.manutenzione - 10);
  return filled;
}

function normalizePunteggiAssi(vision) {
  const filled = inferPunteggiAssi(vision);
  if (filled) vision.punteggi_assi = filled;
  return vision;
}

const PATTERN_GEOMETRICO_OK = new Set([
  "circolare",
  "irregolare",
  "diffuso",
  "lineare",
  "nessuno",
]);

const COLORI_DOMINANTI_OK = new Set([
  "verde_scuro",
  "verde_chiaro",
  "verde_brillante",
  "ingiallito_non_valutabile",
]);

function normalizeColoreDominante(vision) {
  if (!vision || typeof vision !== "object") return vision;
  const c = String(vision.colore_dominante || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  vision.colore_dominante = COLORI_DOMINANTI_OK.has(c) ? c : "ingiallito_non_valutabile";
  return vision;
}

function normalizeVisionGeometria(vision) {
  if (!vision || typeof vision !== "object") return vision;
  const p = String(vision.pattern_geometrico || "nessuno")
    .toLowerCase()
    .trim();
  vision.pattern_geometrico = PATTERN_GEOMETRICO_OK.has(p) ? p : "nessuno";
  vision.danno_localizzato = Boolean(vision.danno_localizzato);
  vision.diagnosi_avanzata = String(vision.diagnosi_avanzata || "").trim().slice(0, 900);
  return vision;
}

async function queryKnowledgeBase(admin, embedding) {
  const attempts = [
    { match_count: 6, match_threshold: 0.22 },
    { match_count: 4, match_threshold: 0.18 },
  ];
  let lastErr = null;
  for (const params of attempts) {
    const { data, error } = await admin.rpc("match_documenti", {
      ...params,
      query_embedding: embedding,
    });
    if (!error) return data ?? [];
    lastErr = error;
    const msg = String(error.message || "");
    if (!/timeout|timed out|57014/i.test(msg)) break;
  }
  throw new Error(
    `Knowledge base: ${lastErr?.message || "errore ricerca"}. ` +
      "Esegui sql/patch_match_documenti.sql nel SQL Editor Supabase."
  );
}

async function geminiEmbed(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
    }),
  });
  if (!res.ok) throw new Error(`Embedding fallito: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) throw new Error("Embedding senza values");
  return values;
}

async function geminiGenerate(apiKey, parts, opts = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.35,
        maxOutputTokens: opts.maxTokens ?? 8192,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const out =
    data?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
  if (!out.trim()) throw new Error("Risposta Gemini vuota");
  return out;
}

const VISION_PROMPT_MACCHIA = (profilo, weatherBlock, zonaNome, notaUtente) => `Sei agronomo specializzato in diagnosi di MACCHIE e zone dove il tappeto erboso non cresce o è danneggiato.

L'utente ha fotografato una ZONA PROBLEMATICA del prato (non il prato intero).
Zona: ${zonaNome || "area problematica"}
${notaUtente?.trim() ? `\nDomanda o nota dell'utente: «${notaUtente.trim()}»\nRispondi anche a questa domanda usando la foto.\n` : ""}

Profilo del sito:
${formatProfileForPrompt(profilo)}

${weatherBlock || "Meteo: località non indicata nel profilo."}

Concentrati SOLO su ciò che vedi nella macchia/area inquadrata: forma del danno, colore, densità, bordi, confronto con erba sana attorno.

Rispondi SOLO JSON valido (italiano), forma:
{
  "sintesi_visiva": "2-4 frasi su cosa si vede nella macchia",
  "specie_probabili": [{ "nome": "latino", "confidenza": "alta|media|bassa", "motivo": "" }],
  "stato_generale": "ottimo|buono|discreto|critico",
  "problemi_rilevati": [{ "problema": "", "gravita": "bassa|media|alta", "dettaglio": "" }],
  "pattern_geometrico": "circolare|irregolare|diffuso|lineare|nessuno",
  "danno_localizzato": true,
  "diagnosi_avanzata": "Perché qui l'erba non cresce o è malata: ipotesi principali collegate a pattern, irrigazione, ombra, traffico, funghi, parassiti sottoprato",
  "malattie_sospette": [{ "nome": "", "gravita": "bassa|media|alta", "note": "" }],
  "parassiti_sottoprato": [{ "tipo": "popillia|otiorrinco|altro", "segni": "", "gravita": "bassa|media|alta", "note": "" }],
  "stress_idrici": { "segni": true|false, "note": "" },
  "feltro_thatch": { "presente": true|false, "note": "" },
  "query_ricerca_kb": "80-200 caratteri con sintomi della macchia e specie",
  "richiede_analisi_suolo": false,
  "motivo_analisi_suolo": ""
}

stato_generale nella macchia: valuta SOLO la zona fotografata (critico se macchia estesa o necrosi; discreto se problema gestibile).
danno_localizzato: sempre true per questa modalità.`;

/**
 * @param {{
 *   imageBase64: string,
 *   mimeType: string,
 *   authHeader: string,
 *   env: Record<string,string>,
 *   modalita?: "prato"|"macchia_zona",
 *   zonaId?: string,
 *   zonaNome?: string,
 *   notaUtente?: string,
 * }} opts
 */
export async function analizzaPrato({
  imageBase64,
  mimeType,
  authHeader,
  env,
  modalita = "prato",
  zonaId: zonaIdInput,
  zonaNome: zonaNomeInput,
  notaUtente: notaUtenteInput,
}) {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();

  if (!geminiKey || !supabaseUrl || !serviceKey || !anonKey) {
    throw new Error("Manca crawler/.env (API_KEY, SUPABASE_URL, SUPABASE_KEY, SUPABASE_ANON_KEY)");
  }

  const img = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
  if (!img || img.length < 100) throw new Error("Immagine mancante o non valida");

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) throw new Error("Sessione non valida");

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profilo } = await admin
    .from("prato_profilo")
    .select("*")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const isMacchia = modalita === "macchia_zona";
  let zonaRow = null;
  if (zonaIdInput) {
    const { data: zr } = await admin
      .from("zone_prato")
      .select("id, nome_zona, lat, lon")
      .eq("id", zonaIdInput)
      .maybeSingle();
    zonaRow = zr;
  }

  let weatherBlock = "";
  if (profilo?.localita?.trim()) {
    try {
      const wOpts =
        zonaRow?.lat != null && zonaRow?.lon != null
          ? { lat: Number(zonaRow.lat), lon: Number(zonaRow.lon) }
          : {};
      const w = await fetchWeatherBundle(profilo.localita, env.OPENWEATHER_API_KEY, wOpts);
      weatherBlock = formatWeatherForPrompt(w);
    } catch (e) {
      weatherBlock = `Meteo: non disponibile (${e.message})`;
    }
  }

  const zonaNome =
    zonaNomeInput || zonaRow?.nome_zona || (isMacchia ? "Zona problematica" : null);

  const visionPromptPrato = `Sei il miglior agronomo di tappeto erboso al mondo. Analizza questa foto di prato.

Profilo del sito (senza tipo erba — lo deduci dalla foto):
${formatProfileForPrompt(profilo)}

${weatherBlock || "Meteo: località non indicata nel profilo."}

Identifica le SPECIE BOTANICHE probabili (nomi latini), NON categorie generiche.
Non confondere graminee diverse: es. Cynodon dactylon ≠ Festuca arundinacea ≠ Lolium perenne.

Rispondi SOLO JSON valido (italiano), forma:
{
  "sintesi_visiva": "2-4 frasi",
  "morfologia": { "habitat": "cespitoso|rizomatoso|stolonifero|misto|non_valutabile", "note": "" },
  "specie_probabili": [
    { "nome": "Lolium perenne", "confidenza": "alta|media|bassa", "motivo": "perché dalla foto" }
  ],
  "stato_generale": "ottimo|buono|discreto|critico",
  "colore_dominante": "verde_scuro|verde_chiaro|verde_brillante|ingiallito_non_valutabile",
  "problemi_rilevati": [{ "problema": "", "gravita": "bassa|media|alta", "dettaglio": "" }],
  "taglio": { "altezza_stimata_cm": "", "giudizio": "troppo_basso|corretto|troppo_alto|non_valutabile", "note": "" },
  "feltro_thatch": { "presente": true|false, "note": "" },
  "foglie_debris": { "eccesso_foglie": true|false, "note": "" },
  "stress_idrici": { "segni": true|false, "note": "" },
  "pattern_geometrico": "circolare|irregolare|diffuso|lineare|nessuno",
  "danno_localizzato": false,
  "diagnosi_avanzata": "Incrocia pattern visivo con zone critiche (ombra, irrigatori, bordi, passaggio). Es. macchie circolari → sospetto fungino; ingiallimento diffuso → stress idrico o carenza N.",
  "malattie_sospette": [{ "nome": "", "gravita": "bassa|media|alta", "note": "" }],
  "erbette_infestanti": [{ "nome": "", "gravita": "bassa|media|alta", "note": "" }],
  "parassiti_sottoprato": [
    { "tipo": "popillia|otiorrinco|altro", "segni": "zone marroni, prato che si stacca, larve visibili o sospette", "gravita": "bassa|media|alta", "note": "" }
  ],
  "punteggi_assi": {
    "idratazione": 85,
    "nutrizione": 85,
    "copertura": 85,
    "salute_fogliare": 85,
    "difesa": 85,
    "manutenzione": 85
  },
  "query_ricerca_kb": "80-200 caratteri con specie latine, parassiti (larve sotto prato, popillia) e problemi visibili",
  "patologia_confermata": { "nome": "", "confidenza": "alta|media|bassa" },
  "richiede_analisi_suolo": false,
  "motivo_analisi_suolo": ""
}

ANALISI SUOLO (obbligatorio se pH/carenze gravi):
- Se vedi clorosi diffusa, ingiallimento da carenza, sospetto pH estremo, bruciature da calcare o tessuto necrotico da squilibrio nutrizionale GRAVE: imposta richiede_analisi_suolo: true e motivo_analisi_suolo con sintomi osservati.
- In quel caso NON dare dosi di concime o correttivi specifici nel report: indica solo che serve campione in laboratorio.
- patologia_confermata: solo se identifichi una patologia con alta sicurezza visiva (confidenza alta); altrimenti nome vuoto e confidenza bassa.
Max 3 specie_probabili, ordinate per confidenza. Se non distinguibile, una voce con confidenza bassa e motivo.

VALUTAZIONE stato_generale (importante per il punteggio utente):
- "ottimo": prato uniformemente verde, denso, tagliato bene, senza danni evidenti (è il caso di un prato bello/curato).
- "buono": ottima copertura con piccole imperfezioni locali o lievi note.
- "discreto": problemi visibili ma gestibili.
- "critico": solo con danni gravi estesi.
- Se il prato appare sano e curato, NON usare "discreto" per prudenza: usa "ottimo" o "buono".
- problemi_rilevati: solo difetti REALI e visibili; se il prato è bello lascia [] o al massimo 1 voce "bassa".
- malattie_sospette, erbette_infestanti, parassiti_sottoprato: array vuoti se non vedi evidenza chiara (non ipotizzare).

DIAGNOSTICA SPAZIALE (obbligatoria):
- pattern_geometrico: forma del danno (circolare tipico funghi a ciambella; diffuso = stress/clorosi; lineare = passaggio/irrigazione).
- danno_localizzato: true se il problema è in macchie/zone, false se uniforme su tutto il tappeto.
- diagnosi_avanzata: 2-4 frasi da greenkeeper collegando pattern + contesto profilo (ombra, bordi, irrigatori).

COLORE FOGLIARE (obbligatorio per color-matching sementi):
- colore_dominante: genetica cromatica del prato sano (verde scuro / chiaro / brillante). Se ingiallimento da stress o carenza evidente, usa ingiallito_non_valutabile.
- Determina il colore del tappeto sano, non delle macchie malate. Serve per consigliare la semente corretta in trasemina ed evitare l'effetto arlecchino.

PUNTEGGI_ASSI (obbligatorio per il radar in dashboard):
- Compila punteggi_assi con 6 NUMERI INTERI (non stringhe), uno per asse, da 0 a 100.
- Prato uniformemente verde, denso e curato: valori tipici 85-95 su tutti gli assi.
- Piccole imperfezioni locali: 70-84; problemi evidenti ma gestibili: 50-69; danni gravi: sotto 50.
- stato_generale deve essere coerente con la media dei punteggi_assi.`;

  const notaUtente = isMacchia ? String(notaUtenteInput || "").trim() : "";

  const visionPrompt = isMacchia
    ? VISION_PROMPT_MACCHIA(profilo, weatherBlock, zonaNome, notaUtente)
    : visionPromptPrato;

  const visionRaw = await geminiGenerate(
    geminiKey,
    [{ text: visionPrompt }, { inlineData: { mimeType, data: img } }],
    { json: true, maxTokens: 2048, temperature: 0.2 },
  );

  let vision;
  try {
    vision = JSON.parse(visionRaw.replace(/```json|```/g, "").trim());
  } catch {
    vision = { sintesi_visiva: visionRaw, query_ricerca_kb: visionRaw.slice(0, 200) };
  }
  if (!isMacchia) {
    vision = normalizePunteggiAssi(vision);
    vision = normalizeColoreDominante(vision);
  }
  vision = normalizeVisionGeometria(vision);

  if (vision.richiede_analisi_suolo == null) {
    const ph = String(profilo?.ph_terreno || "").toLowerCase();
    const squilibrio =
      ph === "acido" ||
      ph === "alcalino" ||
      (vision.problemi_rilevati || []).some((p) =>
        /ph|carenz|clorosi|necros|calcare|azoto|ferro|manganese/i.test(
          `${p?.problema} ${p?.dettaglio}`,
        ),
      );
    vision.richiede_analisi_suolo = !!squilibrio;
    if (squilibrio && !vision.motivo_analisi_suolo) {
      vision.motivo_analisi_suolo =
        "Sintomi compatibili con squilibrio del suolo o pH non ottimale: serve analisi di laboratorio.";
    }
  }

  try {
    await registraFocolaiDaVision(admin, profilo, vision);
  } catch (e) {
    console.warn("[analizza] focolai:", e.message);
  }

  const speciesFromVision = (vision.specie_probabili || [])
    .map((s) => (typeof s === "string" ? s : s?.nome))
    .filter(Boolean);

  if (!isMacchia && speciesFromVision.length) {
    const note = `Specie (analisi foto): ${speciesFromVision.slice(0, 3).join(", ")}`;
    await admin
      .from("prato_profilo")
      .update({ note })
      .eq("user_id", userData.user.id);
  }

  const searchText = [
    vision.query_ricerca_kb,
    vision.sintesi_visiva,
    ...speciesFromVision,
    ...(vision.malattie_sospette || []),
    ...(vision.problemi_rilevati || []).map((x) => x.problema),
    formatProfileForPrompt(profilo),
  ]
    .filter(Boolean)
    .join("\n");

  const embedding = await geminiEmbed(searchText.slice(0, 8000), geminiKey);
  const chunks = await queryKnowledgeBase(admin, embedding);

  const kbContext = (chunks ?? [])
    .map((c, i) => {
      const sim = c.somiglianza != null ? ` (${(c.somiglianza * 100).toFixed(0)}%)` : "";
      return `[${i + 1}]${sim}${c.patologia ? ` Patologia: ${c.patologia}` : ""}\n${c.soluzione ?? ""}`;
    })
    .join("\n\n---\n\n");

  const reportPromptMacchia = `Sei agronomo. L'utente ha fotografato una MACCHIA sul prato (zona: ${zonaNome || "problematica"}).
${notaUtente ? `\nDomanda dell'utente: «${notaUtente}»\n` : ""}

Profilo: ${formatProfileForPrompt(profilo)}
${weatherBlock || ""}

Analisi visione della macchia:
${JSON.stringify(vision, null, 2)}

Knowledge base:
${kbContext || "(nessun chunk)"}

Report Markdown BREVE in italiano, solo queste sezioni ## :
Cosa vede nella macchia, Perché qui non cresce (diagnosi), Cosa fare ora (3-5 azioni concrete), Cosa evitare, Nota agronomica (1 paragrafo).
Niente piano stagionale completo. Fitofarmaci solo se evidenti nella macchia.
${
  vision.richiede_analisi_suolo
    ? `
## Analisi del suolo consigliata
Motivo: ${vision.motivo_analisi_suolo || "squilibrio sospetto"}
${testoAlertAnalisiSuolo(profilo?.localita).labListMarkdown}`
    : ""
}`;

  const reportPromptPrato = `Sei il miglior agronomo di tappeto erboso al mondo.

Profilo: ${formatProfileForPrompt(profilo)}

${weatherBlock || ""}

Visione foto: ${JSON.stringify(vision, null, 2)}

Knowledge base:
${kbContext || "(nessun chunk)"}

Report Markdown in italiano con ## :
Cosa vedo nella foto, Specie e miscuglio (da visione), Meteo e temperature recenti, Diagnosi e problemi, Parassiti e larve (sotto il tappeto: popillia/maggiolino, otiorrinco, altri), Taglio e altezza, Feltro/thatch, Foglie e detriti, Irrigazione e stress, Malattie, Piano d'azione, Cosa evitare, Nota agronomica.
Fitofarmaci (fungicidi/insetticidi): SOLO se la foto mostra malattie, parassiti o danni evidenti — non preventivi generici.
Se serve un trattamento, preferisci prodotti BOTTOS in catalogo: Fly (larve/popillia), Trichoderma (problemi fungini), senza dose automatica.
Nella sezione Specie: nomi latini, confidenza, differenza tra specie simili se utile. Collega diagnosi + meteo.
${
  vision.richiede_analisi_suolo
    ? `
OBBLIGO ANALISI SUOLO (richiede_analisi_suolo=true):
- Aggiungi sezione ## Analisi del suolo consigliata
- NON proporre dosi NPK o correttivi pH senza dati di laboratorio
- Motivo: ${vision.motivo_analisi_suolo || "squilibrio nutrizionale sospetto"}
- Laboratori suggeriti per ${profilo?.localita || "zona"}:
${testoAlertAnalisiSuolo(profilo?.localita).labListMarkdown}
- Istruzioni prelievo: elenca i passi per le carote di terra (campione composito 10-15 cm)`
    : ""
}`;

  const reportPrompt = isMacchia ? reportPromptMacchia : reportPromptPrato;

  const report = await geminiGenerate(geminiKey, [{ text: reportPrompt }], {
    maxTokens: isMacchia ? 4096 : 8192,
    temperature: 0.4,
  });

  let interventi = [];
  let analisiId = null;
  let dashboardReady = false;
  let saved = null;

  const zonaId = zonaIdInput || (await loadZonaIdForUser(admin, userData.user.id));

  try {
    interventi = await extractInterventiFromReport(report, vision, geminiGenerate, geminiKey);
    saved = await persistAnalisiAndInterventi(
      admin,
      userData.user.id,
      {
        report,
        vision,
        chunksUsed: (chunks ?? []).length,
        interventi,
        profilo,
        imageBase64: img,
        mimeType,
        zonaId,
      },
      {
        geminiGenerate,
        geminiKey,
        fonteInterventi: isMacchia ? "ia_macchia" : "ia_foto",
        integraPiano: !isMacchia,
      },
    );
    analisiId = saved.analisiId;
    interventi = saved.interventi;
    dashboardReady = !saved.tablesMissing;
  } catch (e) {
    console.warn("[analizza-prato] dashboard/interventi:", e.message);
  }

  return {
    report,
    vision,
    chunksUsed: (chunks ?? []).length,
    weatherUsed: !!weatherBlock && !weatherBlock.startsWith("Meteo: non"),
    interventi,
    analisiId,
    dashboardReady,
    pianoAggiornato: saved?.pianoAggiornato ?? null,
    richiede_analisi_suolo: !!vision?.richiede_analisi_suolo,
    motivo_analisi_suolo: vision?.motivo_analisi_suolo || null,
    zonaId,
    modalita,
  };
}
