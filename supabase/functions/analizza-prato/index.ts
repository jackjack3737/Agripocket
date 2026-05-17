// AgriPocket — foto prato + vision Gemini + RAG su tgif_knowledge_base
// Deploy: supabase secrets set GEMINI_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//         supabase functions deploy analizza-prato --no-verify-jwt false

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";
type Profile = {
  uso?: string | null;
  tipo_seme?: string | null;
  marca_seme?: string | null;
  esposizione?: string | null;
  tipo_terreno?: string | null;
  irrigazione?: string | null;
  superficie_mq?: number | null;
  localita?: string | null;
  note?: string | null;
};

type OwmWeather = {
  main: { temp: number; feels_like: number; humidity: number };
  weather: { main: string; description: string }[];
  wind?: { speed: number };
  name: string;
};

function profileText(p: Profile | null): string {
  if (!p) return "Profilo prato: non compilato.";
  const parts = [
    p.uso && `Uso: ${p.uso}`,
    p.marca_seme && `Marca/miscuglio dichiarata: ${p.marca_seme}`,
    p.esposizione && `Esposizione: ${p.esposizione}`,
    p.tipo_terreno && `Terreno: ${p.tipo_terreno}`,
    p.irrigazione && `Irrigazione: ${p.irrigazione}`,
    p.superficie_mq && `Superficie: ${p.superficie_mq} m²`,
    p.localita && `Località: ${p.localita}`,
    p.note && `Note: ${p.note}`,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : "Profilo prato: minimo.";
}

function getAgronomicAdvice(weather: OwmWeather | null) {
  if (!weather?.main) return { status: "…", advice: "Meteo non disponibile", color: "#999" };
  const currentMonth = new Date().getMonth() + 1;
  const isWinterOffSeason = currentMonth === 12 || currentMonth === 1 || currentMonth === 2;
  const temp = weather.main.temp;
  const main = weather.weather?.[0]?.main ?? "";
  if (isWinterOffSeason || main === "Snow" || temp <= 5) {
    return { status: "Riposo invernale", advice: "Fuori stagione (dic–feb). Prato a riposo.", color: "#90A4AE" };
  }
  if (main === "Rain" || main === "Drizzle" || main === "Thunderstorm") {
    return { status: "Pioggia", advice: "Spegni irrigazione. Evita trattamenti.", color: "#42A5F5" };
  }
  if (temp > 5 && temp < 12) {
    return { status: "Bassa crescita", advice: "Taglio alto. Assorbimento lento.", color: "#7986CB" };
  }
  if (temp >= 28) {
    return { status: "Stress termico", advice: "Irriga al mattino. Alza il taglio.", color: "#D32F2F" };
  }
  return { status: "Tempo favorevole", advice: "Buono per taglio e concime.", color: "#2E7D32" };
}

async function geocodeCity(city: string, apiKey: string) {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding meteo: ${res.status}`);
  const data = await res.json();
  if (!data?.length) throw new Error(`Località non trovata: ${city}`);
  return { lat: data[0].lat as number, lon: data[0].lon as number, country: data[0].country as string };
}

async function fetchCurrentWeather(city: string, apiKey: string): Promise<OwmWeather> {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=it`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.cod !== 200) throw new Error(data.message || "Meteo non disponibile");
  return data as OwmWeather;
}

async function fetchRecentTemperatures(lat: number, lon: number, days = 14) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const daily = data.daily;
  if (!daily?.time?.length) return null;
  const rows = daily.time.map((date: string, i: number) => ({
    date,
    tMax: daily.temperature_2m_max[i] as number,
    tMin: daily.temperature_2m_min[i] as number,
    rainMm: (daily.precipitation_sum?.[i] ?? 0) as number,
  }));
  const temps = rows.flatMap((r: { tMax: number; tMin: number }) => [r.tMax, r.tMin].filter((t) => t != null));
  return {
    days: rows.length,
    rows,
    avgMax: rows.reduce((s: number, r: { tMax: number }) => s + (r.tMax ?? 0), 0) / rows.length,
    avgMin: rows.reduce((s: number, r: { tMin: number }) => s + (r.tMin ?? 0), 0) / rows.length,
    maxAbs: Math.max(...temps),
    minAbs: Math.min(...temps),
    frostDays: rows.filter((r: { tMin: number }) => r.tMin != null && r.tMin <= 2).length,
    hotDays: rows.filter((r: { tMax: number }) => r.tMax != null && r.tMax >= 30).length,
    rainyDays: rows.filter((r: { rainMm: number }) => r.rainMm >= 5).length,
  };
}

function formatWeatherForPrompt(bundle: {
  current: OwmWeather;
  history: Awaited<ReturnType<typeof fetchRecentTemperatures>>;
  advice: ReturnType<typeof getAgronomicAdvice>;
  location: string;
}) {
  const { current, history, advice, location } = bundle;
  const lines = [
    `## Meteo sito — ${location}`,
    `Ora: ${Math.round(current.main.temp)}°C (percepita ${Math.round(current.main.feels_like)}°C), ${current.weather[0].description}, umidità ${current.main.humidity}%, vento ${Math.round(current.wind?.speed ?? 0)} m/s.`,
    `Consiglio meteo: ${advice.status} — ${advice.advice}`,
  ];
  if (history) {
    lines.push(
      `Ultimi ${history.days} giorni: min media ${history.avgMin.toFixed(1)}°C, max media ${history.avgMax.toFixed(1)}°C, assoluto ${history.minAbs.toFixed(1)}–${history.maxAbs.toFixed(1)}°C.`,
      `Giorni con gelo (min ≤2°C): ${history.frostDays}, giorni caldi (max ≥30°C): ${history.hotDays}, giorni con pioggia ≥5mm: ${history.rainyDays}.`,
    );
    const last5 = history.rows.slice(-5);
    lines.push(
      "Dettaglio recente: " +
        last5.map((r: { date: string; tMin: number; tMax: number }) => `${r.date}: ${r.tMin?.toFixed(0)}–${r.tMax?.toFixed(0)}°C`).join("; "),
    );
  }
  return lines.join("\n");
}

async function fetchWeatherBundle(city: string, apiKey?: string) {
  const key = apiKey?.trim();
  if (!key) throw new Error("Manca OPENWEATHER_API_KEY");
  const geo = await geocodeCity(city, key);
  const current = await fetchCurrentWeather(city, key);
  const history = await fetchRecentTemperatures(geo.lat, geo.lon, 14);
  const advice = getAgronomicAdvice(current);
  return {
    location: `${current.name}${geo.country ? `, ${geo.country}` : ""}`,
    current,
    history,
    advice,
    summaryText: formatWeatherForPrompt({
      current,
      history,
      advice,
      location: current.name,
    }),
  };
}

async function geminiEmbed(text: string, apiKey: string): Promise<number[]> {
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

async function queryKnowledgeBase(
  admin: ReturnType<typeof createClient>,
  embedding: number[],
) {
  const attempts = [
    { match_count: 6, match_threshold: 0.22 },
    { match_count: 4, match_threshold: 0.18 },
  ];
  let lastErr: { message?: string } | null = null;
  for (const params of attempts) {
    const { data, error } = await admin.rpc("match_documenti", {
      ...params,
      query_embedding: embedding,
    });
    if (!error) return data ?? [];
    lastErr = error;
    const msg = String(error.message ?? "");
    if (!/timeout|timed out|57014/i.test(msg)) break;
  }
  throw new Error(
    `Knowledge base: ${lastErr?.message ?? "errore ricerca"}. Esegui sql/patch_match_documenti.sql in Supabase.`,
  );
}

async function geminiGenerate(
  apiKey: string,
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  opts: { json?: boolean; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
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
  const out = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text ?? "").join("") ?? "";
  if (!out.trim()) throw new Error("Risposta Gemini vuota");
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();

    if (!geminiKey || !supabaseUrl || !serviceKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Configurazione server incompleta (GEMINI_API_KEY / Supabase)." }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const imageBase64 = String(body?.imageBase64 ?? "").replace(/^data:image\/\w+;base64,/, "");
    const mimeType = String(body?.mimeType ?? "image/jpeg");
    if (!imageBase64 || imageBase64.length < 100) {
      return new Response(JSON.stringify({ error: "Immagine mancante o non valida" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessione non valida" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profilo } = await admin
      .from("prato_profilo")
      .select("*")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const owmKey = Deno.env.get("OPENWEATHER_API_KEY")?.trim() || "";
    let weatherBlock = "";
    if (profilo?.localita?.trim()) {
      try {
        const w = await fetchWeatherBundle(profilo.localita, owmKey);
        weatherBlock = formatWeatherForPrompt({
          current: w.current,
          history: w.history,
          advice: w.advice,
          location: w.location,
        });
      } catch (e) {
        weatherBlock = `Meteo: non disponibile (${e instanceof Error ? e.message : String(e)})`;
      }
    }

    const visionPrompt = `Sei il miglior agronomo di tappeto erboso al mondo. Analizza questa foto di prato.

Profilo del sito (senza tipo erba — lo deduci dalla foto):
${profileText(profilo as Profile)}

${weatherBlock || "Meteo: località non indicata nel profilo."}

Identifica SPECIE BOTANICHE probabili (nomi latini), NON categorie generiche.
Non confondere: Cynodon dactylon ≠ Festuca arundinacea ≠ Lolium perenne.

Rispondi SOLO JSON valido (italiano):
{
  "sintesi_visiva": "2-4 frasi",
  "morfologia": { "habitat": "cespitoso|rizomatoso|stolonifero|misto|non_valutabile", "note": "" },
  "specie_probabili": [{ "nome": "Lolium perenne", "confidenza": "alta|media|bassa", "motivo": "" }],
  "stato_generale": "ottimo|buono|discreto|critico",
  "problemi_rilevati": [{ "problema": "", "gravita": "bassa|media|alta", "dettaglio": "" }],
  "taglio": { "altezza_stimata_cm": "", "giudizio": "troppo_basso|corretto|troppo_alto|non_valutabile", "note": "" },
  "feltro_thatch": { "presente": true|false, "note": "" },
  "foglie_debris": { "eccesso_foglie": true|false, "note": "" },
  "stress_idrici": { "segni": true|false, "note": "" },
  "malattie_sospette": [],
  "erbette_infestanti": [],
  "query_ricerca_kb": "80-200 caratteri con specie latine e problemi"
}
Max 3 specie_probabili.`;

    const visionRaw = await geminiGenerate(
      geminiKey,
      [
        { text: visionPrompt },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
      { json: true, maxTokens: 2048, temperature: 0.2 },
    );

    let vision: Record<string, unknown>;
    try {
      vision = JSON.parse(visionRaw.replace(/```json|```/g, "").trim());
    } catch {
      vision = { sintesi_visiva: visionRaw, query_ricerca_kb: visionRaw.slice(0, 200) };
    }

    const speciesFromVision = (
      Array.isArray(vision.specie_probabili)
        ? (vision.specie_probabili as { nome?: string }[]).map((s) => s.nome).filter(Boolean)
        : []
    ) as string[];

    if (speciesFromVision.length) {
      await admin
        .from("prato_profilo")
        .update({ note: `Specie (analisi foto): ${speciesFromVision.slice(0, 3).join(", ")}` })
        .eq("user_id", userData.user.id);
    }

    const searchText = [
      String(vision.query_ricerca_kb ?? ""),
      String(vision.sintesi_visiva ?? ""),
      ...speciesFromVision,
      ...(Array.isArray(vision.malattie_sospette) ? vision.malattie_sospette.map(String) : []),
      ...(Array.isArray(vision.problemi_rilevati)
        ? (vision.problemi_rilevati as { problema?: string }[]).map((x) => x.problema ?? "")
        : [])
      ,
      profileText(profilo as Profile),
    ]
      .filter(Boolean)
      .join("\n");

    const embedding = await geminiEmbed(searchText.slice(0, 8000), geminiKey);

    const chunks = await queryKnowledgeBase(admin, embedding);

    const kbContext = (chunks ?? [])
      .map((c: { soluzione?: string; patologia?: string; specie?: string; somiglianza?: number }, i: number) => {
        const sim = c.somiglianza != null ? ` (rilevanza ${(c.somiglianza * 100).toFixed(0)}%)` : "";
        return `[${i + 1}]${sim}${c.patologia ? ` Patologia: ${c.patologia}` : ""}${c.specie ? ` Specie: ${c.specie}` : ""}\n${c.soluzione ?? ""}`;
      })
      .join("\n\n---\n\n");

    const reportPrompt = `Sei il miglior agronomo di tappeto erboso al mondo — esperienza da campo, ricerca e consulenza professionale.

Compito: redigi un rapporto COMPLETO in italiano per il proprietario del prato, basandoti su:
1) Foto analizzata (JSON visione sotto)
2) Profilo sito
3) Estratti dalla knowledge base AgriPocket (obbligatorio usarli per diagnosi e consigli)

## Profilo sito
${profileText(profilo as Profile)}

${weatherBlock ? `## Meteo e temperature recenti\n${weatherBlock}\n` : ""}

## Analisi visiva (da foto)
${JSON.stringify(vision, null, 2)}

## Knowledge base (fonti TGIF / letteratura prato)
${kbContext || "(nessun chunk recuperato — basati sulla visione)"}

Scrivi un report strutturato in Markdown con queste sezioni (usa ## per titoli):

## Cosa vedo nella foto
## Specie e miscuglio (da visione)
## Meteo e temperature recenti
## Diagnosi e problemi (anche ipotesi)
## Taglio e altezza
## Feltro / thatch e compattazione
## Foglie, detriti e pulizia
## Irrigazione e stress idrici
## Malattie e parassiti (se sospetti)
## Piano d'azione prioritario (settimana 1, poi mese)
## Cosa evitare
## Nota agronomica

Sii estremamente specifico: numeri (cm taglio, frequenze), prodotti generici (non marchi obbligati), tempi. Collega sempre diagnosi foto + andamento termico degli ultimi giorni se il meteo è disponibile. Se taglio troppo basso o troppe foglie, spiegalo chiaramente. Se qualcosa non è visibile in foto, dillo. Tono professionale ma chiaro. Non inventare dati non supportati da foto o KB.`;

    const report = await geminiGenerate(geminiKey, [{ text: reportPrompt }], {
      maxTokens: 8192,
      temperature: 0.4,
    });

    return new Response(
      JSON.stringify({
        report,
        vision,
        chunksUsed: (chunks ?? []).length,
        weatherUsed: !!weatherBlock && !weatherBlock.startsWith("Meteo: non"),
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[analizza-prato]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
