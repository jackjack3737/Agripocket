/**
 * Scienza dietro un trattamento — RAG su tgif_knowledge_base + sintesi Gemini.
 */

import { createClient } from "@supabase/supabase-js";
import { classifyKbChunk, queryKnowledgeBasePrioritizedWithRetry } from "./kbQuery.mjs";
import { geminiEmbedQuery } from "./ragParametriAgronomici.mjs";

const CHAT_MODEL = "gemini-2.5-flash";

const TIER_LABEL = {
  libro: "Libro universitario",
  calendario: "Calendario Verde Bottos",
  catalogo: "Catalogo tecnico",
  altro: "Letteratura di riferimento",
};

function pulisciTestoKb(soluzione) {
  return String(soluzione || "")
    .replace(/^\[[^\]]+\]\s*/g, "")
    .trim();
}

function meseIt(iso) {
  if (!iso) return "";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

export function buildQueryScienzaTrattamento(intervento, profilo = {}) {
  const titolo =
    intervento?.titolo_semplice_azione ||
    intervento?.titolo ||
    intervento?.tipo_intervento ||
    "";
  const esigenze = Array.isArray(intervento?.esigenze_molecolari)
    ? intervento.esigenze_molecolari.join(" ")
    : "";
  return [
    "fisiologia tappeto erboso turfgrass trattamento agronomico",
    titolo,
    intervento?.titolo_tecnico,
    intervento?.fabbisogno_fisiologico,
    intervento?.categoria,
    intervento?.macro_categoria,
    esigenze,
    meseIt(intervento?.data_prevista),
    profilo?.localita,
    profilo?.tipo_prato || profilo?.specie,
    profilo?.livello_impegno,
  ]
    .filter(Boolean)
    .join("\n");
}

async function geminiSintesiScienza(apiKey, { intervento, kbBlock, profilo }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const titolo =
    intervento?.titolo_semplice_azione || intervento?.titolo || intervento?.tipo_intervento || "Trattamento";

  const prompt = `Sei un agronomo del tappeto erboso. Scrivi in italiano chiaro ma autorevole.

L'utente ha chiesto la SCIENZA dietro questo intervento in calendario:
- Titolo: ${titolo}
- Data prevista: ${intervento?.data_prevista || "n/d"}
- Categoria: ${intervento?.categoria || "n/d"}
- Esigenze molecolari: ${(intervento?.esigenze_molecolari || []).join("; ") || "n/d"}
- Profilo: ${profilo?.localita || ""} ${profilo?.superficie_mq ? `${profilo.superficie_mq} m²` : ""}

USA SOLO gli estratti della knowledge base sotto. NON inventare dati, dosi o marchi non presenti negli estratti.
Se gli estratti sono scarsi, dillo e limita la risposta a ciò che è documentato.

Struttura (markdown leggero, senza titoli enormi):
1) **Perché in questa fase** — legame stagione/fisiologia (2–4 frasi)
2) **Meccanismo** — cosa succede nella pianta (2–4 frasi)
3) **In pratica sul tuo prato** — collegamento operativo (2–3 frasi)

Max 220 parole totali.

ESTRATTI KNOWLEDGE BASE:
${kbBlock}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini sintesi: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("")?.trim() || "";
}

/**
 * @param {object} intervento — voce calendario (titolo, categoria, dettaglio, date…)
 */
export async function recuperaScienzaTrattamento(intervento, { admin, geminiKey, profilo = {} } = {}) {
  if (!admin) throw new Error("Config Supabase incompleta");
  if (!geminiKey?.trim()) throw new Error("Manca GEMINI_API_KEY");

  const query = buildQueryScienzaTrattamento(intervento, profilo);
  const embedding = await geminiEmbedQuery(query, geminiKey);
  if (!embedding?.length) {
    return {
      sintesi: "Impossibile interrogare la knowledge in questo momento. Riprova tra poco.",
      estratti: [],
      chunk_count: 0,
      fonte: "errore_embedding",
    };
  }

  let chunks = [];
  try {
    chunks = await queryKnowledgeBasePrioritizedWithRetry(admin, embedding, {
      matchCount: 6,
      fetchCount: 24,
      minLibri: 2,
    });
  } catch (e) {
    console.warn("[scienza-trattamento] KB:", e.message);
  }

  const estratti = chunks.map((c, i) => {
    const tier = classifyKbChunk(c.soluzione);
    return {
      indice: i + 1,
      tier,
      fonte: TIER_LABEL[tier] || TIER_LABEL.altro,
      titolo: c.patologia || null,
      testo: pulisciTestoKb(c.soluzione).slice(0, 2400),
      somiglianza: c.somiglianza != null ? Math.round(c.somiglianza * 100) : null,
    };
  });

  if (!estratti.length) {
    const fallback =
      intervento?.fabbisogno_fisiologico ||
      intervento?.titolo_tecnico ||
      "Nessun estratto rilevante in knowledge base per questo trattamento. Rigenera il piano o consulta la spiegazione nel profilo.";
    return {
      sintesi: fallback,
      estratti: [],
      chunk_count: 0,
      fonte: "fallback_intervento",
    };
  }

  const kbBlock = estratti
    .map((e) => `[${e.indice}] (${e.fonte}) ${e.titolo ? e.titolo + " — " : ""}${e.testo}`)
    .join("\n\n---\n\n");

  let sintesi = "";
  try {
    sintesi = await geminiSintesiScienza(geminiKey, { intervento, kbBlock, profilo });
  } catch (e) {
    console.warn("[scienza-trattamento] sintesi:", e.message);
    sintesi = estratti
      .slice(0, 3)
      .map((e) => `**${e.fonte}** — ${e.testo.slice(0, 480)}…`)
      .join("\n\n");
  }

  return {
    sintesi: sintesi || kbBlock.slice(0, 2000),
    estratti,
    chunk_count: estratti.length,
    fonte: "rag",
  };
}

export async function scienzaTrattamentoHandler(authHeader, env, body = {}) {
  const supabaseUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) throw new Error("Sessione non valida");

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: profilo } = await admin
    .from("prato_profilo")
    .select("*")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const intervento = body.intervento || body;
  if (!intervento?.titolo && !intervento?.titolo_semplice_azione && !intervento?.categoria) {
    throw new Error("Intervento non valido");
  }

  let det = intervento.dettaglio_trattamento;
  if (typeof det === "string") {
    try {
      det = JSON.parse(det);
    } catch {
      det = null;
    }
  }

  const payload = {
    titolo: intervento.titolo,
    titolo_semplice_azione: det?.titolo_semplice_azione || intervento.titolo_semplice_azione,
    titolo_tecnico: det?.titolo_tecnico || intervento.titolo_tecnico_solum,
    fabbisogno_fisiologico: det?.fabbisogno_fisiologico || intervento.fabbisogno_fisiologico,
    esigenze_molecolari: det?.esigenze_molecolari || intervento.esigenze_molecolari,
    categoria: intervento.categoria,
    macro_categoria: intervento.macro_categoria || det?.macro_categoria,
    data_prevista: intervento.data_prevista,
    tipo_intervento: det?.tipo_intervento,
  };

  const result = await recuperaScienzaTrattamento(payload, {
    admin,
    geminiKey: env.GEMINI_API_KEY?.trim(),
    profilo: profilo || {},
  });

  return { ok: true, ...result };
}
