import { createClient } from "@supabase/supabase-js";
import { extractInterventiFromReport, persistAnalisiAndInterventi } from "./interventiFromReport.mjs";
import { fetchWeatherBundle, formatWeatherForPrompt } from "./weatherCore.mjs";

const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";

function profileText(p) {
  if (!p) return "Profilo prato: non compilato.";
  const parts = [
    p.uso && `Uso: ${p.uso}`,
    p.marca_seme && `Marca/miscuglio dichiarata: ${p.marca_seme}`,
    p.esposizione && `Esposizione: ${p.esposizione}`,
    p.tipo_terreno && `Terreno: ${p.tipo_terreno}`,
    p.irrigazione && `Irrigazione: ${p.irrigazione}`,
    p.superficie_mq && `Superficie: ${p.superficie_mq} m²`,
    p.note && `Note: ${p.note}`,
    p.localita && `Località: ${p.localita}`,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : "Profilo prato: minimo.";
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
${profileText(profilo)}

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
  "query_ricerca_kb": "80-200 caratteri con specie latine e problemi visibili"
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
    profileText(profilo),
  ]
    .filter(Boolean)
    .join("\n");

  const embedding = await geminiEmbed(searchText.slice(0, 8000), geminiKey);
  const { data: chunks, error: rpcErr } = await admin.rpc("match_documenti", {
    match_count: 14,
    match_threshold: 0.2,
    query_embedding: embedding,
  });
  if (rpcErr) throw new Error(`Knowledge base: ${rpcErr.message}`);

  const kbContext = (chunks ?? [])
    .map((c, i) => {
      const sim = c.somiglianza != null ? ` (${(c.somiglianza * 100).toFixed(0)}%)` : "";
      return `[${i + 1}]${sim}${c.patologia ? ` Patologia: ${c.patologia}` : ""}\n${c.soluzione ?? ""}`;
    })
    .join("\n\n---\n\n");

  const reportPrompt = `Sei il miglior agronomo di tappeto erboso al mondo.

Profilo: ${profileText(profilo)}

${weatherBlock || ""}

Visione foto: ${JSON.stringify(vision, null, 2)}

Knowledge base:
${kbContext || "(nessun chunk)"}

Report Markdown in italiano con ## :
Cosa vedo nella foto, Specie e miscuglio (da visione), Meteo e temperature recenti, Diagnosi e problemi, Taglio e altezza, Feltro/thatch, Foglie e detriti, Irrigazione e stress, Malattie, Piano d'azione, Cosa evitare, Nota agronomica.
Nella sezione Specie: nomi latini, confidenza, differenza tra specie simili se utile. Collega diagnosi + meteo.`;

  const report = await geminiGenerate(geminiKey, [{ text: reportPrompt }], {
    maxTokens: 8192,
    temperature: 0.4,
  });

  let interventi = [];
  let analisiId = null;
  let dashboardReady = false;

  try {
    interventi = await extractInterventiFromReport(report, vision, geminiGenerate, geminiKey);
    const saved = await persistAnalisiAndInterventi(admin, userData.user.id, {
      report,
      vision,
      chunksUsed: (chunks ?? []).length,
      interventi,
    });
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
  };
}
