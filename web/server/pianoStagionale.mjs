import { createClient } from "@supabase/supabase-js";
import { fetchWeatherBundle, formatWeatherForPrompt } from "./weatherCore.mjs";

const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-2.5-flash";

const CATEGORIE_OK = new Set([
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
]);

function profileText(p) {
  if (!p) return "Profilo prato: non compilato.";
  return [
    p.uso && `Uso: ${p.uso}`,
    p.marca_seme && `Miscuglio: ${p.marca_seme}`,
    p.esposizione && `Esposizione: ${p.esposizione}`,
    p.tipo_terreno && `Terreno: ${p.tipo_terreno}`,
    p.irrigazione && `Irrigazione: ${p.irrigazione}`,
    p.superficie_mq && `Superficie: ${p.superficie_mq} m²`,
    p.localita && `Località: ${p.localita}`,
    p.note && `Note/specie: ${p.note}`,
  ]
    .filter(Boolean)
    .join("\n");
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
  if (!res.ok) throw new Error(`Embedding: ${res.status}`);
  const data = await res.json();
  return data?.embedding?.values;
}

async function geminiGenerate(apiKey, text, opts = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxTokens ?? 16384,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
}

async function queryKnowledgeBase(admin, embedding) {
  const { data, error } = await admin.rpc("match_documenti", {
    match_count: 8,
    match_threshold: 0.2,
    query_embedding: embedding,
  });
  if (error) throw new Error(`Knowledge base: ${error.message}`);
  return data ?? [];
}

function normalizeCategoria(c) {
  const v = String(c || "altro").toLowerCase();
  const map = {
    fertilizz: "concime",
    concim: "concime",
    nutriz: "concime",
    erbic: "diserbo",
    diserb: "diserbo",
    scarific: "arieggiatura",
    arieggi: "arieggiatura",
    aeraz: "arieggiatura",
    biostim: "biostimolante",
    umett: "umettante",
    surfact: "umettante",
    water: "umettante",
    seme: "rinnovo",
    overseed: "rinnovo",
    rinnov: "rinnovo",
    fungic: "trattamento",
    insettic: "trattamento",
    fitofarm: "trattamento",
    taglio: "taglio",
    irrig: "irrigazione",
    puliz: "pulizia",
    feltro: "pulizia",
  };
  if (CATEGORIE_OK.has(v)) return v;
  for (const [k, cat] of Object.entries(map)) {
    if (v.includes(k)) return cat;
  }
  return "altro";
}

function parseIsoDate(s, fallback) {
  const raw = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function buildPianoInterventi(profilo, env, admin) {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiKey) throw new Error("Manca GEMINI_API_KEY");

  const oggi = new Date().toISOString().slice(0, 10);
  const fine = addDays(oggi, 365);

  let weatherBlock = "";
  if (profilo?.localita?.trim()) {
    try {
      weatherBlock = formatWeatherForPrompt(
        await fetchWeatherBundle(profilo.localita, env.OPENWEATHER_API_KEY),
      );
    } catch {
      weatherBlock = "Meteo: non disponibile.";
    }
  }

  const searchText = [
    "calendario verde prato tappeto erboso",
    "concimi NPK autunno primavera slow release ferro",
    "diserbo pre emergenza post emergenza",
    "arieggiatura scarifica feltro",
    "taglio altezza frequenza stagione",
    "biostimolante stress caldo",
    "agente umettante irrigazione",
    profilo?.note,
    profilo?.marca_seme,
    profilo?.localita,
  ]
    .filter(Boolean)
    .join("\n");

  const emb = await geminiEmbed(searchText.slice(0, 6000), geminiKey);
  const chunks = await queryKnowledgeBase(admin, emb);
  const kb = chunks
    .map((c, i) => `[${i + 1}] ${c.patologia || ""}\n${c.soluzione || ""}`)
    .join("\n\n");

  const mese = new Date().toLocaleString("it-IT", { month: "long", year: "numeric" });

  const prompt = `Sei il miglior agronomo di tappeto erboso in Italia. Crea un CALENDARIO LAVORI completo, giorno per giorno (date precise), per i prossimi 12 mesi.

Oggi: ${oggi} (${mese})
Periodo piano: da ${oggi} a ${fine}

Profilo sito:
${profileText(profilo)}

${weatherBlock}

Knowledge base (prodotti e pratiche — usa nomi e dosaggi quando presenti):
${kb || "(usa best practice italiane per prato da giardino)"}

Obiettivo: elencare TUTTI i lavori tipici del prato, con data_prevista specifica YYYY-MM-DD:
- Concimazioni (NPK, autunno/primavera, slow, microelementi, ferro)
- Diserbi (pre e post emergenza, spot treatment)
- Arieggiazione / scarifica / svasatura
- Taglio (frequenza stagionale, altezza cm)
- Biostimolanti e stress (caldo, siccità)
- Agenti umettanti / miglioratori irrigazione
- Trattamenti fungicidi/insetticidi solo se coerenti con profilo
- Rinnovo / overseeding dove appropriato
- Pulizia foglie, controllo feltro, bordi

Rispondi SOLO JSON:
{
  "interventi": [
    {
      "titolo": "max 80 caratteri, azione concreta",
      "descrizione": "cosa fare, prodotto/dose se nota da KB, perché",
      "categoria": "taglio|irrigazione|concime|trattamento|pulizia|diserbo|arieggiatura|biostimolante|umettante|rinnovo|altro",
      "priorita": "alta|media|bassa",
      "data_prevista": "YYYY-MM-DD"
    }
  ]
}

Regole:
- Minimo 70 interventi, massimo 120, distribuiti su tutto l'anno (non ammassare tutto in una settimana).
- Date reali tra ${oggi} e ${fine}; rispetta stagionalità climatica italiana e località.
- In inverno (dic-feb) meno tagli, più pianificazione; picco concimi primavera/autunno.
- Evita duplicati lo stesso giorno con stesso titolo.
- priorita alta solo per finestre critiche (overseeding, pre-emergenza, stress caldo).
- Adatta a uso prato (gioco, estetico, basso input) e irrigazione del profilo.`;

  const raw = await geminiGenerate(geminiKey, prompt, { maxTokens: 16384 });
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Piano stagionale: JSON non valido da Gemini");
  }

  const list = Array.isArray(parsed?.interventi) ? parsed.interventi : [];
  const seen = new Set();

  return list
    .filter((i) => i?.titolo?.trim())
    .map((item, idx) => {
      const data = parseIsoDate(item.data_prevista, addDays(oggi, Math.min(idx * 3, 360)));
      const key = `${data}|${String(item.titolo).slice(0, 40)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        titolo: String(item.titolo).trim().slice(0, 120),
        descrizione: String(item.descrizione || "").trim().slice(0, 600),
        priorita: ["alta", "media", "bassa"].includes(String(item.priorita).toLowerCase())
          ? String(item.priorita).toLowerCase()
          : "media",
        categoria: normalizeCategoria(item.categoria),
        data_prevista: data >= oggi && data <= fine ? data : oggi,
        ordine: idx,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista) || a.ordine - b.ordine);
}

export async function persistPianoStagionale(admin, userId, interventi) {
  await admin
    .from("prato_interventi")
    .delete()
    .eq("user_id", userId)
    .eq("fonte", "calendario_stagionale")
    .eq("stato", "pianificato");

  if (!interventi.length) return { count: 0, tablesMissing: false };

  const rows = interventi.map((i) => ({
    user_id: userId,
    analisi_id: null,
    titolo: i.titolo,
    descrizione: i.descrizione || null,
    priorita: i.priorita,
    categoria: i.categoria,
    stato: "pianificato",
    data_prevista: i.data_prevista,
    ordine: i.ordine,
    fonte: "calendario_stagionale",
  }));

  const batchSize = 50;
  const saved = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await admin.from("prato_interventi").insert(batch).select("*");
    if (error) {
      if (error.code === "PGRST205") return { count: 0, tablesMissing: true };
      if (error.message?.includes("categoria")) {
        throw new Error(
          "Categoria intervento non valida. Esegui sql/patch_interventi_categorie.sql in Supabase.",
        );
      }
      throw new Error(`Salvataggio piano: ${error.message}`);
    }
    saved.push(...(data ?? []));
  }
  return { count: saved.length, tablesMissing: false, interventi: saved };
}

export async function generaPianoStagionale({ authHeader, env }) {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !serviceKey || !anonKey) {
    throw new Error("Config Supabase incompleta");
  }

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

  if (!profilo?.localita?.trim()) {
    throw new Error("Completa il profilo con la località (mappa onboarding) prima di generare il calendario.");
  }

  const interventi = await buildPianoInterventi(profilo, env, admin);
  const saved = await persistPianoStagionale(admin, userData.user.id, interventi);

  return {
    count: saved.count,
    interventi: saved.interventi ?? [],
    tablesMissing: saved.tablesMissing,
  };
}
