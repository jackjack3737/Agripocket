/**
 * FASE 6 — Chat contestuale zona con validazione RAG a 3 step (zero invenzioni).
 */

import { fetchWeatherBundle, formatWeatherForPrompt } from "./weatherCore.mjs";
import { formatAgronomicForPrompt } from "./agronomicMeteo.mjs";
import { formatProfileForPrompt } from "./profileContext.mjs";

const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";
const MIN_SIMILARITY = 0.2;
const MIN_CHUNKS = 1;

const RISPOSTA_INSUFFICIENTE =
  "I dati non sono sufficienti per una diagnosi certa. È richiesto l'intervento in loco di un agronomo o un'analisi del suolo.";

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
  if (!res.ok) throw new Error(`Embedding: ${res.status}`);
  const data = await res.json();
  return data?.embedding?.values;
}

async function queryKnowledgeBase(admin, embedding) {
  const { data, error } = await admin.rpc("match_documenti", {
    match_count: 8,
    match_threshold: MIN_SIMILARITY,
    query_embedding: embedding,
  });
  if (error) throw new Error(`Knowledge base: ${error.message}`);
  return data ?? [];
}

async function geminiGenerate(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("")?.trim() ?? "";
}

/** Carica contesto silenzioso: zona, meteo, storico analisi. */
export async function loadContestoZona(admin, userId, { zonaId, profilo } = {}) {
  let zona = null;
  if (zonaId) {
    const { data } = await admin
      .from("zone_prato")
      .select("*")
      .eq("id", zonaId)
      .eq("user_id", userId)
      .maybeSingle();
    zona = data;
  }
  if (!zona) {
    const { data } = await admin
      .from("zone_prato")
      .select("*")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    zona = data;
  }

  let weatherBundle = null;
  const localita = profilo?.localita;
  if (localita?.trim()) {
    try {
      const gps = zona?.coordinate_gps;
      weatherBundle = await fetchWeatherBundle(localita, null, {
        zonaId: zona?.id,
        lat: gps?.lat,
        lon: gps?.lon ?? gps?.lng,
      });
    } catch {
      /* meteo opzionale */
    }
  }

  let analisiQuery = admin
    .from("prato_analisi")
    .select("id, created_at, vision_json, report_markdown, zona_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (zona?.id) analisiQuery = analisiQuery.eq("zona_id", zona.id);

  const { data: storico } = await analisiQuery;

  const ultima = storico?.[0] ?? null;
  const vision =
    typeof ultima?.vision_json === "object"
      ? ultima.vision_json
      : ultima?.vision_json
        ? JSON.parse(ultima.vision_json)
        : null;

  return {
    zona,
    profilo,
    weatherBundle,
    storico: storico ?? [],
    ultimaVision: vision,
    meteoAgro: zona?.meteo_agronomico || weatherBundle?.agronomic,
  };
}

function formatKbChunks(chunks) {
  return chunks
    .map((c, i) => {
      const sim = c.somiglianza != null ? ` [sim ${(c.somiglianza * 100).toFixed(0)}%]` : "";
      return `[${i + 1}]${sim} ${c.patologia ? `(${c.patologia})` : ""}\n${c.soluzione || ""}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Chat «Perché l'erba non cresce in questa zona?» — RAG obbligatorio.
 */
export async function rispondiChatZona(admin, userId, domanda, { zonaId, profilo, env }) {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiKey) throw new Error("Manca GEMINI_API_KEY");

  const ctx = await loadContestoZona(admin, userId, { zonaId, profilo });
  const q = String(domanda || "").trim() || "Perché l'erba non cresce in questa zona?";

  const searchText = [
    q,
    ctx.zona?.nome_zona,
    ctx.ultimaVision?.sintesi_visiva,
    ctx.ultimaVision?.diagnosi_avanzata,
    ...(ctx.ultimaVision?.problemi_rilevati || []).map((p) => p.problema),
    ...(ctx.ultimaVision?.malattie_sospette || []).map((m) => (typeof m === "string" ? m : m?.nome)),
    formatProfileForPrompt(profilo),
  ]
    .filter(Boolean)
    .join("\n");

  const embedding = await geminiEmbed(searchText.slice(0, 6000), geminiKey);
  const chunks = await queryKnowledgeBase(admin, embedding);

  const chunksUtili = chunks.filter(
    (c) => c.somiglianza == null || c.somiglianza >= MIN_SIMILARITY,
  );

  if (chunksUtili.length < MIN_CHUNKS) {
    return {
      risposta: RISPOSTA_INSUFFICIENTE,
      fonte: "kb_insufficiente",
      chunksUsed: 0,
      zona: ctx.zona,
    };
  }

  const kb = formatKbChunks(chunksUtili);
  let meteoBlock = "";
  if (ctx.weatherBundle) {
    meteoBlock = formatWeatherForPrompt(ctx.weatherBundle);
  } else if (ctx.meteoAgro) {
    meteoBlock = formatAgronomicForPrompt(ctx.meteoAgro);
  }

  const storicoBreve = (ctx.storico || [])
    .slice(0, 3)
    .map(
      (a, i) =>
        `Analisi ${i + 1} (${a.created_at?.slice(0, 10)}): ${JSON.stringify(a.vision_json || {}).slice(0, 400)}`,
    )
    .join("\n");

  const prompt = `Sei un agronomo di tappeto erboso. Rispondi in italiano, tono chiaro per il giardiniere.

DOMANDA UTENTE: ${q}

CONTESTO ZONA (id_zona: ${ctx.zona?.id || "default"}):
- Nome zona: ${ctx.zona?.nome_zona || "Prato principale"}
- Superficie: ${ctx.zona?.metri_quadri ?? profilo?.superficie_mq ?? "non indicata"} m²

PROFILO:
${formatProfileForPrompt(profilo)}

METEO / ET0 (zona corrente):
${meteoBlock || "Non disponibile."}

STORICO ANALISI FOTO (zona):
${storicoBreve || "Nessuna analisi precedente."}

ULTIMA VISIONE FOTO:
${ctx.ultimaVision ? JSON.stringify(ctx.ultimaVision, null, 2) : "Nessuna foto analizzata."}

KNOWLEDGE BASE (UNICA FONTE AUTORIZZATA — non usare altro):
${kb}

REGOLE TASSATIVE (Zero-Error):
1. Step A completato: hai solo i chunk sopra.
2. Step B: scrivi la risposta usando ESCLUSIVAMENTE informazioni presenti nella Knowledge Base e nel contesto zona/meteo sopra.
3. NON inventare prodotti, dosi, patologie o cause non supportate dai chunk.
4. Se i chunk non coprono la domanda, rispondi ESATTAMENTE: "${RISPOSTA_INSUFFICIENTE}"
5. Collega quando possibile ET0/GDD e sintomi della zona.`;

  const risposta = await geminiGenerate(geminiKey, prompt);

  return {
    risposta: risposta || RISPOSTA_INSUFFICIENTE,
    fonte: "rag",
    chunksUsed: chunksUtili.length,
    zona: ctx.zona,
  };
}
