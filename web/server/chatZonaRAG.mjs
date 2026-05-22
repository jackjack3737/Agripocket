/**
 * FASE 6 — Chat contestuale zona: RAG + contesto zona/mappa/focolai + verifica risposta.
 */

import { fetchWeatherBundle, formatWeatherForPrompt } from "./weatherCore.mjs";
import { formatAgronomicForPrompt } from "./agronomicMeteo.mjs";
import { formatProfileForPrompt } from "./profileContext.mjs";
import { buildFocolaiPromptBlock } from "./focolaiRegionali.mjs";
import {
  formatZonesForPrompt,
  formatIrrigationForPrompt,
  formatOmbraSeedForPrompt,
} from "./pratoZone.mjs";

const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";
const MIN_CHUNKS = 3;
const MIN_SIMILARITY_CHUNK = 0.26;

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
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) throw new Error("Embedding senza values");
  return values;
}

async function queryKnowledgeBase(admin, embedding) {
  const attempts = [
    { match_count: 8, match_threshold: 0.24 },
    { match_count: 6, match_threshold: 0.2 },
    { match_count: 6, match_threshold: 0.18 },
  ];
  let lastErr = null;
  for (const params of attempts) {
    const { data, error } = await admin.rpc("match_documenti", {
      ...params,
      query_embedding: embedding,
    });
    if (!error) {
      const filtered = (data ?? []).filter(
        (c) => c.somiglianza == null || c.somiglianza >= MIN_SIMILARITY_CHUNK,
      );
      if (filtered.length >= MIN_CHUNKS) return filtered;
      if ((data ?? []).length >= MIN_CHUNKS && params === attempts[attempts.length - 1]) {
        return (data ?? [])
          .filter((c) => c.somiglianza == null || c.somiglianza >= 0.22)
          .slice(0, 6);
      }
    }
    lastErr = error;
    const msg = String(error?.message || "");
    if (!/timeout|timed out|57014/i.test(msg)) break;
  }
  throw new Error(
    `Knowledge base: ${lastErr?.message || "errore ricerca"}. ` +
      "Esegui sql/patch_match_documenti.sql nel SQL Editor Supabase.",
  );
}

async function geminiGenerate(apiKey, prompt, opts = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("")?.trim() ?? "";
}

function pratoZoneEffettivo(profilo, zona) {
  if (zona?.prato_zone && typeof zona.prato_zone === "object") return zona.prato_zone;
  return profilo?.prato_zone;
}

function formatMappaZonaPrompt(profilo, zona) {
  const pz = pratoZoneEffettivo(profilo, zona);
  const blocks = [];
  const mappa = formatZonesForPrompt(pz);
  if (mappa) blocks.push(mappa);
  const irrig = formatIrrigationForPrompt(pz, profilo);
  if (irrig) blocks.push(`Irrigazione da mappa:\n${irrig}`);
  const ombra = formatOmbraSeedForPrompt(pz, profilo);
  if (ombra) blocks.push(ombra);
  return blocks.length ? blocks.join("\n\n") : "Mappa zone non compilata (irrigatori, ombra, pendenza).";
}

function formatVisionSummary(vision) {
  if (!vision || typeof vision !== "object") return null;
  const lines = [];
  if (vision.sintesi_visiva) lines.push(`Sintesi foto: ${vision.sintesi_visiva}`);
  if (vision.diagnosi_avanzata) lines.push(`Diagnosi: ${vision.diagnosi_avanzata}`);
  if (vision.patologia_confermata?.nome) {
    lines.push(
      `Patologia confermata: ${vision.patologia_confermata.nome} (confidenza ${vision.patologia_confermata.confidenza || "n/d"})`,
    );
  }
  for (const m of vision.malattie_sospette || []) {
    const nome = typeof m === "string" ? m : m?.nome;
    if (nome) lines.push(`Malattia sospetta: ${nome}`);
  }
  for (const p of vision.problemi_rilevati || []) {
    if (p?.problema) lines.push(`Problema: ${p.problema}${p.dettaglio ? ` — ${p.dettaglio}` : ""}`);
  }
  if (vision.richiede_analisi_suolo) {
    lines.push(`Richiede analisi suolo: ${vision.motivo_analisi_suolo || "sì"}`);
  }
  return lines.length ? lines.join("\n") : null;
}

function formatStoricoAnalisi(storico, { visionNotaZona } = {}) {
  if (!storico?.length) return "Nessuna analisi foto precedente per questa zona.";
  const parts = storico.slice(0, 3).map((a, i) => {
    const v =
      typeof a.vision_json === "object"
        ? a.vision_json
        : a.vision_json
          ? JSON.parse(a.vision_json)
          : null;
    const sintesi = formatVisionSummary(v) || "(senza sintesi strutturata)";
    const zonaTag = a.zona_id ? "" : " [zona non indicata nell'analisi]";
    return `Analisi ${i + 1} (${a.created_at?.slice(0, 10) || "?"}${zonaTag}):\n${sintesi}`;
  });
  if (visionNotaZona) parts.unshift(`Nota: ${visionNotaZona}`);
  return parts.join("\n\n");
}

function buildSearchQuery(domanda, ctx) {
  const v = ctx.ultimaVision;
  return [
    domanda,
    ctx.zona?.nome_zona,
    ctx.zona?.comune,
    v?.sintesi_visiva,
    v?.diagnosi_avanzata,
    ...(v?.problemi_rilevati || []).map((p) => `${p?.problema || ""} ${p?.dettaglio || ""}`.trim()),
    ...(v?.malattie_sospette || []).map((m) => (typeof m === "string" ? m : m?.nome)),
    v?.patologia_confermata?.nome,
    ctx.profilo?.tipo_terreno,
    ctx.profilo?.esposizione,
    ctx.profilo?.irrigazione,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatKbChunks(chunks) {
  return chunks
    .map((c, i) => {
      const sim = c.somiglianza != null ? ` [sim ${(c.somiglianza * 100).toFixed(0)}%]` : "";
      return `[${i + 1}]${sim} ${c.patologia ? `(${c.patologia})` : ""}\n${c.soluzione || ""}`;
    })
    .join("\n\n---\n\n");
}

async function verificaRispostaRAG(apiKey, { domanda, bozza, kb }) {
  const prompt = `Sei revisore agronomico. Controlla se la BOZZA risponde alla DOMANDA usando SOLO i CHUNK della Knowledge Base (e contesto già citato nella bozza).

DOMANDA UTENTE:
${domanda}

CHUNK KB (unica fonte tecnica autorizzata):
${kb}

BOZZA:
${bozza}

Rispondi SOLO con JSON valido:
{
  "ok": true,
  "risposta_finale": "testo in italiano per il giardiniere, max 12 righe, concreto"
}

oppure se la bozza inventa dati, è fuori tema o i chunk non bastano:
{
  "ok": false,
  "risposta_finale": "${RISPOSTA_INSUFFICIENTE}"
}

Criteri ok=false: prodotti/dosi/patologie non presenti nei chunk; risposta generica che ignora la domanda; più di 2 affermazioni non supportate.`;

  const raw = await geminiGenerate(apiKey, prompt, { temperature: 0.1, maxOutputTokens: 1024, json: true });
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, ""));
    const fin = String(parsed.risposta_finale || "").trim();
    if (parsed.ok === true && fin.length > 40) return { ok: true, risposta: fin };
    if (fin) return { ok: false, risposta: fin };
  } catch {
    /* fallback sotto */
  }
  if (/non sono sufficienti|intervento in loco/i.test(bozza)) {
    return { ok: false, risposta: RISPOSTA_INSUFFICIENTE };
  }
  return { ok: true, risposta: bozza };
}

/** Carica contesto silenzioso: zona, meteo, storico analisi (filtrato per zona). */
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

  let visionNotaZona = null;
  let storico = [];

  if (zona?.id) {
    const { data: perZona } = await admin
      .from("prato_analisi")
      .select("id, created_at, vision_json, report_markdown, zona_id")
      .eq("user_id", userId)
      .eq("zona_id", zona.id)
      .order("created_at", { ascending: false })
      .limit(5);
    storico = perZona ?? [];
  }

  if (!storico.length) {
    const { data: generico } = await admin
      .from("prato_analisi")
      .select("id, created_at, vision_json, report_markdown, zona_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);
    storico = generico ?? [];
    if (storico.length && zona?.id) {
      visionNotaZona =
        "Le ultime analisi foto non sono legate a questa zona: usale solo come indizio generale, non come diagnosi puntuale della zona.";
    }
  }

  const ultima = storico[0] ?? null;
  let vision = null;
  try {
    vision =
      typeof ultima?.vision_json === "object"
        ? ultima.vision_json
        : ultima?.vision_json
          ? JSON.parse(ultima.vision_json)
          : null;
  } catch {
    vision = null;
  }

  return {
    zona,
    profilo,
    weatherBundle,
    storico,
    ultimaVision: vision,
    visionNotaZona,
    meteoAgro: zona?.meteo_agronomico || weatherBundle?.agronomic,
  };
}

/**
 * Chat testuale zona — RAG obbligatorio + verifica.
 */
export async function rispondiChatZona(admin, userId, domanda, { zonaId, profilo, env }) {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiKey) throw new Error("Manca GEMINI_API_KEY");

  const ctx = await loadContestoZona(admin, userId, { zonaId, profilo });
  const q = String(domanda || "").trim() || "Perché l'erba non cresce in questa zona?";

  const searchText = buildSearchQuery(q, ctx);
  const embedding = await geminiEmbed(searchText.slice(0, 6000), geminiKey);

  let chunksUtili = [];
  try {
    chunksUtili = await queryKnowledgeBase(admin, embedding);
  } catch (e) {
    console.warn("[chat-zona] KB:", e.message);
  }

  if (chunksUtili.length < MIN_CHUNKS) {
    return {
      risposta: RISPOSTA_INSUFFICIENTE,
      fonte: "kb_insufficiente",
      chunksUsed: chunksUtili.length,
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

  let focolaiBlock = "";
  try {
    focolaiBlock = await buildFocolaiPromptBlock(admin, profilo);
  } catch (e) {
    console.warn("[chat-zona] focolai:", e.message);
  }

  const mappaBlock = formatMappaZonaPrompt(profilo, ctx.zona);
  const visionBlock = formatVisionSummary(ctx.ultimaVision);
  const storicoBlock = formatStoricoAnalisi(ctx.storico, { visionNotaZona: ctx.visionNotaZona });

  const prompt = `Sei un agronomo di tappeto erboso in Italia. Rispondi in italiano, tono chiaro e pratico per il giardiniere (max 12 righe utili).

DOMANDA UTENTE (rispondi SOLO a questa):
${q}

ZONA ATTIVA:
- Nome: ${ctx.zona?.nome_zona || "Prato principale"}
- Superficie zona: ${ctx.zona?.metri_quadri ?? profilo?.superficie_mq ?? "non indicata"} m²
- Comune/GPS: ${ctx.zona?.comune || profilo?.localita || "non indicato"}

PROFILO PRATO:
${formatProfileForPrompt(profilo)}

MAPPA ZONE (irrigatori, ombra, pendenza — priorità su dati mappa):
${mappaBlock}

METEO / ET0 (zona corrente):
${meteoBlock || "Non disponibile."}
${focolaiBlock}

STORICO ANALISI FOTO:
${storicoBlock}

ULTIMA VISIONE FOTO (prioritaria se pertinente alla domanda):
${visionBlock || "Nessuna foto analizzata per questa zona."}

KNOWLEDGE BASE (UNICA FONTE TECNICA — non usare altro):
${kb}

REGOLE (Step B — bozza):
1. Rispondi alla domanda usando SOLO chunk KB + contesto sopra.
2. NON inventare prodotti commerciali, dosi numeriche o patologie assenti nei chunk.
3. Se i chunk non coprono la domanda, rispondi ESATTAMENTE: "${RISPOSTA_INSUFFICIENTE}"
4. Collega ET0/GDD/meteo solo se presenti nel contesto.
5. Non ripetere il profilo intero: solo ciò che serve alla domanda.`;

  const bozza = await geminiGenerate(geminiKey, prompt);
  if (!bozza) {
    return {
      risposta: RISPOSTA_INSUFFICIENTE,
      fonte: "kb_insufficiente",
      chunksUsed: chunksUtili.length,
      zona: ctx.zona,
    };
  }

  const verifica = await verificaRispostaRAG(geminiKey, { domanda: q, bozza, kb });
  const risposta = verifica.risposta || RISPOSTA_INSUFFICIENTE;

  return {
    risposta,
    fonte: verifica.ok ? "rag_verificato" : verifica.risposta === RISPOSTA_INSUFFICIENTE ? "kb_insufficiente" : "rag",
    chunksUsed: chunksUtili.length,
    zona: ctx.zona,
  };
}
