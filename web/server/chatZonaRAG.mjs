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
  normalizePratoZone,
  hasLawnContour,
} from "./pratoZone.mjs";
import { queryKnowledgeBasePrioritized } from "./kbQuery.mjs";
import {
  domandaRichiedeSpiegazione,
  domandaSuIrrigazioneCalcolata,
  formatIrrigazioneOggiForPrompt,
} from "./irrigazionePrompt.mjs";

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
    { matchCount: 8, fetchCount: 36, matchThreshold: 0.24 },
    { matchCount: 6, fetchCount: 28, matchThreshold: 0.2 },
    { matchCount: 6, fetchCount: 24, matchThreshold: 0.18 },
  ];
  let lastErr = null;
  for (const params of attempts) {
    try {
      const data = await queryKnowledgeBasePrioritized(admin, embedding, {
        ...params,
        minLibri: 2,
      });
      const filtered = data.filter(
        (c) => c.somiglianza == null || c.somiglianza >= MIN_SIMILARITY_CHUNK,
      );
      if (filtered.length >= MIN_CHUNKS) return filtered;
      if (data.length >= MIN_CHUNKS && params === attempts[attempts.length - 1]) {
        return data.filter((c) => c.somiglianza == null || c.somiglianza >= 0.22).slice(0, 6);
      }
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || "");
      if (!/timeout|timed out|57014/i.test(msg)) break;
    }
  }
  throw new Error(
    `Knowledge base: ${lastErr?.message || "errore ricerca"}. ` +
      "Esegui sql/patch_match_documenti.sql nel SQL Editor Supabase.",
  );
}

function parseGeminiJson(raw) {
  const cleaned = String(raw || "")
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
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
  const cand = data?.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p?.text ?? "").join("")?.trim() ?? "";
  if (cand?.finishReason === "MAX_TOKENS" && text && !opts.json) {
    console.warn("[chat-zona] risposta Gemini troncata (MAX_TOKENS)");
  }
  return text;
}

/** Se la bozza finisce a metà frase, aggiunge una chiusura minima. */
function chiudiBozzaSeTroncata(testo) {
  const t = String(testo || "").trim();
  if (!t) return t;
  if (/[.!?…)"']\s*$/.test(t)) return t;
  const ultimoPunto = Math.max(t.lastIndexOf("."), t.lastIndexOf("!"), t.lastIndexOf("?"));
  if (ultimoPunto > 80) return `${t.slice(0, ultimoPunto + 1).trim()}`;
  return `${t}… (Riprova con una domanda più breve se manca la parte finale.)`;
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

function haMappaUtile(profilo, zona) {
  const pz = pratoZoneEffettivo(profilo, zona);
  const { zone } = normalizePratoZone(pz);
  return hasLawnContour(pz) || zone.length > 0;
}

/** Profilo + meteo/mappa bastano per rispondere senza foto. */
function contestoSufficienteSenzaFoto(ctx, profilo) {
  if (!profilo?.localita?.trim()) return false;
  const haProfilo =
    Boolean(profilo.esposizione || profilo.irrigazione || profilo.tipo_terreno) ||
    Boolean(profilo.superficie_mq || ctx.zona?.metri_quadri);
  const haMeteo = Boolean(ctx.weatherBundle || ctx.meteoAgro);
  const haMappa = haMappaUtile(profilo, ctx.zona);
  return haProfilo && (haMeteo || haMappa);
}

function buildSearchQuery(domanda, ctx) {
  const v = ctx.ultimaVision;
  const p = ctx.profilo;
  const base = [
    domanda,
    ctx.zona?.nome_zona,
    ctx.zona?.comune,
    p?.localita,
    p?.tipo_terreno,
    p?.esposizione,
    p?.irrigazione,
    p?.marca_seme,
    p?.pendenza,
    p?.ombra_zone_pct,
    ...(p?.problemi_noti || []),
  ];
  if (v) {
    base.push(
      v.sintesi_visiva,
      v.diagnosi_avanzata,
      ...(v.problemi_rilevati || []).map((x) => `${x?.problema || ""} ${x?.dettaglio || ""}`.trim()),
      ...(v.malattie_sospette || []).map((m) => (typeof m === "string" ? m : m?.nome)),
      v.patologia_confermata?.nome,
    );
  }
  return base.filter(Boolean).join("\n");
}

function formatKbChunks(chunks) {
  return chunks
    .map((c, i) => {
      const sim = c.somiglianza != null ? ` [sim ${(c.somiglianza * 100).toFixed(0)}%]` : "";
      return `[${i + 1}]${sim} ${c.patologia ? `(${c.patologia})` : ""}\n${c.soluzione || ""}`;
    })
    .join("\n\n---\n\n");
}

async function verificaRispostaRAG(apiKey, { domanda, bozza, kb, contestoAutorizzato, senzaFoto }) {
  const prompt = `Sei revisore agronomico. Valuta SOLO se la BOZZA è accettabile. NON riscrivere la risposta.

DOMANDA UTENTE:
${domanda}

${senzaFoto ? "MODALITÀ: nessuna foto allegata — profilo, mappa, meteo e KB sono fonti valide.\n" : ""}
FONTI AUTORIZZATE:
${contestoAutorizzato.slice(0, 3500)}

CHUNK KB (estratto):
${String(kb).slice(0, 2500)}

BOZZA DA VALIDARE:
${bozza.slice(0, 10000)}

Rispondi SOLO con JSON:
{ "ok": true }
oppure
{ "ok": false, "motivo": "una frase breve" }

ok=false solo se: prodotti/dosi inventati; diagnosi certa di malattia senza foto né KB; risposta completamente fuori tema.
ok=true se la bozza risponde alla domanda usando profilo, mappa, meteo, irrigazione calcolata o KB (anche con spiegazioni dedotte).
NON richiedere il campo risposta_finale: non riscrivere il testo.`;

  const raw = await geminiGenerate(apiKey, prompt, { temperature: 0.1, maxOutputTokens: 128, json: true });
  const parsed = parseGeminiJson(raw);
  if (parsed?.ok === true) return { ok: true, risposta: bozza };
  if (parsed?.ok === false) {
    return { ok: false, risposta: RISPOSTA_INSUFFICIENTE };
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

  const senzaFoto = !ctx.ultimaVision;
  const contestoOk = contestoSufficienteSenzaFoto(ctx, profilo);
  const irrigazioneOggiBlock = formatIrrigazioneOggiForPrompt(profilo?.irrigazione_oggi);
  const domandaIrrig = domandaSuIrrigazioneCalcolata(q);
  const spiegazione = domandaRichiedeSpiegazione(q);
  const puoSenzaKb =
    senzaFoto &&
    contestoOk &&
    (haMappaUtile(profilo, ctx.zona) || ctx.weatherBundle || ctx.meteoAgro || irrigazioneOggiBlock);

  if (chunksUtili.length < MIN_CHUNKS && !puoSenzaKb) {
    return {
      risposta: RISPOSTA_INSUFFICIENTE,
      fonte: "kb_insufficiente",
      chunksUsed: chunksUtili.length,
      zona: ctx.zona,
    };
  }

  const kb =
    chunksUtili.length > 0
      ? formatKbChunks(chunksUtili)
      : "(Nessun estratto KB specifico — usa profilo, mappa zone e meteo indicati nel contesto.)";
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

  const modalitaFoto = senzaFoto
    ? `MODALITÀ: l'utente NON ha caricato foto ora${contestoOk ? " — rispondi con profilo, mappa, meteo e knowledge base" : ""}. Non chiedere obbligatoriamente una foto se puoi dare consigli gestionali coerenti. Per diagnosi certa di malattia su macchia specifica suggerisci una foto o analisi suolo.`
    : "MODALITÀ: disponibile analisi foto recente — integrala se pertinente alla domanda.";

  const lunghezzaRisposta = spiegazione || domandaIrrig
    ? "Spiega il PERCHÉ con catena logica (ET0, Kc, pioggia, ombra, pendenza, cicli). Usa elenco puntato se utile. Chiudi con una frase di sintesi operativa."
    : "Risposta completa in 8–18 righe utili: ultima frase deve concludere con un consiglio pratico chiaro.";

  const prioritaIrrig = domandaIrrig
    ? `
PRIORITÀ DOMANDA IRRIGAZIONE: usa IRRIGAZIONE CALCOLATA OGGI come fonte autorevole sui minuti/linee. La KB serve per principi generali, non per contraddire il motore su «oggi».`
    : "";

  const prompt = `Sei un agronomo di tappeto erboso in Italia. Rispondi in italiano, tono chiaro e pratico per il giardiniere.
${lunghezzaRisposta}
${prioritaIrrig}

${modalitaFoto}

DOMANDA UTENTE (rispondi SOLO a questa):
${q}

ZONA ATTIVA:
- Nome: ${ctx.zona?.nome_zona || "Prato principale"}
- Superficie zona: ${ctx.zona?.metri_quadri ?? profilo?.superficie_mq ?? "non indicata"} m²
- Comune/GPS: ${ctx.zona?.comune || profilo?.localita || "non indicato"}

IRRIGAZIONE CALCOLATA OGGI (motore deterministico — priorità su domande «perché X minuti», «oggi», centralina):
${irrigazioneOggiBlock || "Non disponibile: l'utente deve aprire la dashboard e aggiornare «Irrigazione di oggi» almeno una volta."}

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

KNOWLEDGE BASE (riferimento tecnico, integra con profilo/mappa/meteo):
${kb}

REGOLE (Step B — bozza):
1. Fonti ammesse: irrigazione calcolata oggi, profilo, mappa zone, meteo/ET0, storico foto (se presente), chunk KB.
2. Domande su minuti/irrigazione oggi: spiega usando dati_tecnici e programma linee sopra; non rispondere solo «per il meteo».
3. Senza foto: consigli su irrigazione, taglio, ombra, concimazione leggera e gestione sono ammessi se supportati dalle fonti.
4. NON inventare prodotti commerciali, dosi fitofarmaci o patologie non supportate dalle fonti.
5. Rispondi "${RISPOSTA_INSUFFICIENTE}" solo se nessuna fonte sopra copre la domanda (es. diagnosi precisa di malattia su macchia senza foto).
6. Ogni frase deve essere completa. Termina sempre l'ultimo periodo (punto finale obbligatorio).`;

  const contestoAutorizzato = [
    irrigazioneOggiBlock ? `Irrigazione oggi: ${irrigazioneOggiBlock.slice(0, 2000)}` : null,
    `Profilo: ${formatProfileForPrompt(profilo).slice(0, 1200)}`,
    `Mappa: ${mappaBlock.slice(0, 800)}`,
    `Meteo: ${(meteoBlock || "n/d").slice(0, 600)}`,
    visionBlock ? `Visione foto: ${visionBlock}` : "Visione foto: non disponibile",
  ]
    .filter(Boolean)
    .join("\n\n");

  const bozzaRaw = await geminiGenerate(geminiKey, prompt, {
    maxOutputTokens: spiegazione || domandaIrrig ? 4096 : 3072,
  });
  const bozza = chiudiBozzaSeTroncata(bozzaRaw);
  if (!bozza) {
    return {
      risposta: RISPOSTA_INSUFFICIENTE,
      fonte: "kb_insufficiente",
      chunksUsed: chunksUtili.length,
      zona: ctx.zona,
    };
  }

  const verifica = await verificaRispostaRAG(geminiKey, {
    domanda: q,
    bozza,
    kb,
    contestoAutorizzato,
    senzaFoto,
  });
  const risposta = verifica.risposta || RISPOSTA_INSUFFICIENTE;

  let fonte = "rag";
  if (verifica.ok) fonte = chunksUtili.length ? "rag_verificato" : "profilo_meteo_verificato";
  else if (risposta === RISPOSTA_INSUFFICIENTE) fonte = "kb_insufficiente";
  else if (chunksUtili.length === 0 && contestoOk) fonte = "profilo_meteo";

  return {
    risposta,
    fonte,
    chunksUsed: chunksUtili.length,
    zona: ctx.zona,
  };
}
