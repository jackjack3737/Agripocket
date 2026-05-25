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

function keywordMacro(intervento) {
  const macro = String(intervento?.macro_categoria || "").toUpperCase();
  const blob = [
    intervento?.titolo,
    intervento?.titolo_semplice_azione,
    intervento?.titolo_tecnico,
    intervento?.fabbisogno_fisiologico,
    ...(intervento?.esigenze_molecolari || []),
  ]
    .join(" ")
    .toLowerCase();
  if (macro === "K" || /potass|kalium|\bk2o\b|0-0-/.test(blob)) {
    return "potassio K2O concime potassico tappeto erboso osmoprozione";
  }
  if (macro === "N" || /azoto|urea|npk/.test(blob)) return "azoto concime nitrogeno prato";
  if (macro === "P" || /fosfor/.test(blob)) return "fosforo fosforico radici prato";
  if (macro === "Biostimolante") return "biostimolante stress prato alghe aminoacidi";
  return "";
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
  const kw = keywordMacro(intervento);
  return [
    "fisiologia tappeto erboso turfgrass trattamento agronomico",
    kw,
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

function sintesiSembraTroncata(testo) {
  const t = String(testo || "").trim();
  if (!t || t.length < 60) return true;
  if (/[.!?…][\s"']*$/.test(t)) return false;
  const ultime = t.slice(-24);
  if (/\s(di|del|della|de|a|al|alla|il|la|le|in|con|per|pot|fosf|azot)\s*$/i.test(ultime)) return true;
  if (/[a-zàèéìòù]{2,}$/i.test(t) && !/[.!?…]$/.test(t)) return true;
  return false;
}

async function geminiSintesiScienza(apiKey, { intervento, kbBlock, profilo }, { breve = false } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const titolo =
    intervento?.titolo_semplice_azione || intervento?.titolo || intervento?.tipo_intervento || "Trattamento";
  const focus = keywordMacro(intervento) || intervento?.macro_categoria || "";

  const prompt = `Sei un agronomo del tappeto erboso. Rispondi in italiano, tono autorevole e diretto (niente preamboli tipo "Certamente").

Intervento in calendario:
- Titolo: ${titolo}
- Data: ${intervento?.data_prevista || "n/d"}
- Categoria: ${intervento?.categoria || "n/d"}${focus ? `\n- Focus nutriente/tema: ${focus}` : ""}
- Esigenze: ${(intervento?.esigenze_molecolari || []).join("; ") || "n/d"}

USA SOLO gli estratti KB sotto. Se parli di un nutriente, usa quello del titolo/intervento (es. potassio se concime potassico), non altri a caso.
Completa SEMPRE tutte e 3 le sezioni con frasi intere che finiscono con punto.

Formato obbligatorio (rispetta esattamente queste righe di intestazione):

**Perché in questa fase**
(2-4 frasi)

**Meccanismo**
(2-4 frasi)

**In pratica sul tuo prato**
(2-3 frasi)

${breve ? "Massimo 160 parole." : "Massimo 280 parole."}

ESTRATTI KB:
${kbBlock.slice(0, 12000)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        candidateCount: 1,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini sintesi: ${res.status}`);
  const data = await res.json();
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const text = parts
    .filter((p) => typeof p?.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();
  return text || "";
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

  const blobKw = keywordMacro(intervento);
  if (blobKw.includes("potass")) {
    chunks = [...chunks].sort((a, b) => {
      const score = (c) => {
        const t = pulisciTestoKb(c.soluzione).toLowerCase();
        let s = Number(c.somiglianza ?? 0);
        if (/potass|k2o|kalium|0-0-/.test(t)) s += 0.2;
        if (/fosfor|\bp2o5?\b/.test(t)) s -= 0.15;
        return s;
      };
      return score(b) - score(a);
    });
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
    if (sintesiSembraTroncata(sintesi)) {
      const retry = await geminiSintesiScienza(geminiKey, { intervento, kbBlock, profilo }, { breve: true });
      if (retry && (!sintesiSembraTroncata(retry) || retry.length > sintesi.length)) {
        sintesi = retry;
      }
    }
  } catch (e) {
    console.warn("[scienza-trattamento] sintesi:", e.message);
    sintesi = estratti
      .slice(0, 3)
      .map((e) => `**${e.fonte}** — ${e.testo.slice(0, 900)}`)
      .join("\n\n");
  }

  if (sintesiSembraTroncata(sintesi) && estratti.length) {
    sintesi = `${sintesi.trim()}\n\n**Approfondimento dalle fonti**\n${estratti[0].testo.slice(0, 1200)}`;
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
