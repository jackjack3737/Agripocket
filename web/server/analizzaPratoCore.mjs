import { createClient } from "@supabase/supabase-js";
import { extractInterventiFromReport, persistAnalisiAndInterventi } from "./interventiFromReport.mjs";
import { formatProfileForPrompt } from "./profileContext.mjs";
import { fetchWeatherBundle, formatWeatherForPrompt } from "./weatherCore.mjs";

const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";

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

/**
 * @param {{ imageBase64: string, mimeType: string, authHeader: string, env: Record<string,string> }} opts
 */
export async function analizzaPrato({ imageBase64, mimeType, authHeader, env }) {
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

  let weatherBlock = "";
  if (profilo?.localita?.trim()) {
    try {
      const w = await fetchWeatherBundle(profilo.localita, env.OPENWEATHER_API_KEY);
      weatherBlock = formatWeatherForPrompt(w);
    } catch (e) {
      weatherBlock = `Meteo: non disponibile (${e.message})`;
    }
  }

  const visionPrompt = `Sei il miglior agronomo di tappeto erboso al mondo. Analizza questa foto di prato.

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
  "problemi_rilevati": [{ "problema": "", "gravita": "bassa|media|alta", "dettaglio": "" }],
  "taglio": { "altezza_stimata_cm": "", "giudizio": "troppo_basso|corretto|troppo_alto|non_valutabile", "note": "" },
  "feltro_thatch": { "presente": true|false, "note": "" },
  "foglie_debris": { "eccesso_foglie": true|false, "note": "" },
  "stress_idrici": { "segni": true|false, "note": "" },
  "malattie_sospette": [],
  "erbette_infestanti": [],
  "parassiti_sottoprato": [
    { "tipo": "popillia|otiorrinco|altro", "segni": "zone marroni, prato che si stacca, larve visibili o sospette", "gravita": "bassa|media|alta", "note": "" }
  ],
  "query_ricerca_kb": "80-200 caratteri con specie latine, parassiti (larve sotto prato, popillia) e problemi visibili"
}
Max 3 specie_probabili, ordinate per confidenza. Se non distinguibile, una voce con confidenza bassa e motivo.`;

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

  const speciesFromVision = (vision.specie_probabili || [])
    .map((s) => (typeof s === "string" ? s : s?.nome))
    .filter(Boolean);

  if (speciesFromVision.length) {
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

  const reportPrompt = `Sei il miglior agronomo di tappeto erboso al mondo.

Profilo: ${formatProfileForPrompt(profilo)}

${weatherBlock || ""}

Visione foto: ${JSON.stringify(vision, null, 2)}

Knowledge base:
${kbContext || "(nessun chunk)"}

Report Markdown in italiano con ## :
Cosa vedo nella foto, Specie e miscuglio (da visione), Meteo e temperature recenti, Diagnosi e problemi, Parassiti e larve (sotto il tappeto: popillia/maggiolino, otiorrinco, altri), Taglio e altezza, Feltro/thatch, Foglie e detriti, Irrigazione e stress, Malattie, Piano d'azione, Cosa evitare, Nota agronomica.
Per popillia/larve sotto prato: citare trattamento con insetticida Fly (Bottos) o equivalente da catalogo, senza dose automatica.
Nella sezione Specie: nomi latini, confidenza, differenza tra specie simili se utile. Collega diagnosi + meteo.`;

  const report = await geminiGenerate(geminiKey, [{ text: reportPrompt }], {
    maxTokens: 8192,
    temperature: 0.4,
  });

  let interventi = [];
  let analisiId = null;
  let dashboardReady = false;
  let saved = null;

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
      },
      { geminiGenerate, geminiKey },
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
  };
}
