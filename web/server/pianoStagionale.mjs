import { createClient } from "@supabase/supabase-js";
import { fetchWeatherBundle, formatWeatherForPrompt } from "./weatherCore.mjs";
import { ensurePreEmergenzaAnnuali, valutaPreEmergenzaAnnuali } from "./preEmergenzaAnnuali.mjs";
import { arricchisciInterventoConProdotto, loadProdotti } from "./prodottiCatalogo.mjs";
import { superficieMqVerificata } from "./sicurezzaProdotti.mjs";
import { integraCatalogoNelPiano } from "./pianoDaCatalogo.mjs";
import { mergeControlliMensili } from "./controlliMensili.mjs";
import { hintParassitiRegionali } from "./parassitiPrato.mjs";
import { ensureOmbraOverseedInterventi } from "./pratoZone.mjs";
import { formatProfileForPrompt } from "./profileContext.mjs";
import {
  REGOLE_FITOFARMACI_PROMPT,
  filtraInterventiFitofarmacoCurativo,
} from "./regoleFitofarmaci.mjs";

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

export async function buildPianoInterventi(profilo, env, admin, { vision = null } = {}) {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiKey) throw new Error("Manca GEMINI_API_KEY");

  const oggi = new Date().toISOString().slice(0, 10);
  const fine = addDays(oggi, 365);

  let weatherBlock = "";
  let preEmergenzaBlock = "";
  if (profilo?.localita?.trim()) {
    try {
      const bundle = await fetchWeatherBundle(profilo.localita, env.OPENWEATHER_API_KEY);
      weatherBlock = formatWeatherForPrompt(bundle);
      const val = valutaPreEmergenzaAnnuali(bundle);
      preEmergenzaBlock = val.testoPrompt;
    } catch {
      weatherBlock = "Meteo: non disponibile.";
    }
  }

  const searchText = [
    "calendario verde prato tappeto erboso",
    "concimi NPK autunno primavera slow release ferro",
    "diserbo pre emergenza setaria digitaria annuali estive pianura padana maggio",
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
${formatProfileForPrompt(profilo)}

${weatherBlock}

${preEmergenzaBlock ? `${preEmergenzaBlock}\n` : ""}

${hintParassitiRegionali(profilo?.localita)}

Knowledge base (prodotti e pratiche — usa nomi e dosaggi quando presenti):
${kb || "(usa best practice italiane per prato da giardino)"}

Nota: dopo la generazione, il sistema aggiunge automaticamente al calendario tutti i prodotti idonei del catalogo Bottos (concimi liquidi/granulari, ammendanti, biostimolanti, umettanti, trattamenti) con priorità bassa/media — non serve elencarli tutti qui.

Obiettivo: elencare TUTTI i lavori tipici del prato, con data_prevista specifica YYYY-MM-DD:
- Concimazioni (NPK, autunno/primavera, slow, microelementi, ferro)
- Diserbi: pre-emergenza setaria/digitaria (annualità estive) quando il blocco termico sopra indica finestra aperta; post-emergenza selettivo se erbe già visibili
- Arieggiazione / scarifica / svasatura
- Taglio (frequenza stagionale, altezza cm)
- Biostimolanti e stress (caldo, siccità)
- Agenti umettanti / miglioratori irrigazione
- Solo marca BOTTOS per concimi, biostimolanti, umettanti, ammendanti
- Rinnovo / overseeding: se la mappa indica zone ombra, usa miscela e quantità seme (g/m²) già nel profilo — un intervento dedicato alle zone ombra
- Pulizia foglie, controllo feltro, bordi

${REGOLE_FITOFARMACI_PROMPT}

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
- Minimo 28 interventi, massimo 45 (calendario da giardino, non gestione stadio): distribuiti su tutto l'anno (non ammassare tutto in una settimana).
- Date reali tra ${oggi} e ${fine}; rispetta stagionalità climatica italiana e località.
- In inverno (dic-feb) meno tagli, più pianificazione; picco concimi primavera/autunno.
- Evita duplicati lo stesso giorno con stesso titolo.
- priorita alta per finestre critiche: overseeding, pre-emergenza setaria/digitaria (se finestra termica aperta), stress caldo.
- Non spostare la pre-emergenza setaria/digitaria a febbraio se il meteo indica finestra aperta ora (mag-giu in pianura padana).
- Adatta a obiettivo, uso, frequenza taglio (se robot: micro-tagli frequenti, altezza costante) e livello concimi indicato nel profilo (professionali vs blandi).
- Non inserire tutti i concimi del catalogo: rispetta il livello concimi del profilo (estetico→NPK/ferro; bassa manutenzione→slow/universali).`;

  const raw = await geminiGenerate(geminiKey, prompt, { maxTokens: 16384 });
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Piano stagionale: JSON non valido da Gemini");
  }

  const list = Array.isArray(parsed?.interventi) ? parsed.interventi : [];
  const seen = new Set();

  let parsedList = list
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

  if (profilo?.localita?.trim()) {
    try {
      const bundle = await fetchWeatherBundle(profilo.localita, env.OPENWEATHER_API_KEY);
      const val = valutaPreEmergenzaAnnuali(bundle);
      parsedList = ensurePreEmergenzaAnnuali(parsedList, val, oggi, addDays);
    } catch {
      /* meteo opzionale */
    }
  }

  parsedList = filtraInterventiFitofarmacoCurativo(parsedList, { vision, profilo });
  parsedList = ensureOmbraOverseedInterventi(parsedList, profilo?.prato_zone, profilo, oggi, addDays);

  return parsedList;
}

export async function persistPianoStagionale(admin, userId, interventi, profilo) {
  await admin
    .from("prato_interventi")
    .delete()
    .eq("user_id", userId)
    .eq("fonte", "calendario_stagionale")
    .eq("stato", "pianificato")
    .eq("manual_override", false);

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
    prodotto_id: i.prodotto_id ?? null,
    prodotto_nome: i.prodotto_nome ?? null,
    dose_totale: i.dose_totale ?? null,
    dose_unita: i.dose_unita ?? null,
    dose_per_mq: i.dose_per_mq ?? null,
    manual_override: false,
  }));

  const batchSize = 50;
  const saved = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    let { data, error } = await admin.from("prato_interventi").insert(batch).select("*");
    if (error) {
      if (error.code === "PGRST205") return { count: 0, tablesMissing: true };
      if (/prodotto_|dose_/.test(error.message || "")) {
        const slim = batch.map(
          ({ prodotto_id, prodotto_nome, dose_totale, dose_unita, dose_per_mq, ...r }) => r,
        );
        const retry = await admin.from("prato_interventi").insert(slim).select("*");
        if (retry.error) throw new Error(`Salvataggio piano: ${retry.error.message}`);
        data = retry.data;
        error = null;
      } else if (error.message?.includes("categoria")) {
        throw new Error(
          "Categoria intervento non valida. Esegui sql/patch_interventi_categorie.sql in Supabase.",
        );
      } else {
        throw new Error(`Salvataggio piano: ${error.message}`);
      }
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
  if (!superficieMqVerificata(profilo)) {
    throw new Error(
      "Imposta i m² del prato sulla mappa (profilo) prima di generare il calendario: servono per dosi e priorità in sicurezza.",
    );
  }

  const oggi = new Date().toISOString().slice(0, 10);

  const { data: ultimaAnalisi } = await admin
    .from("prato_analisi")
    .select("vision_json")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const vision = ultimaAnalisi?.vision_json ?? null;

  const profiloPerPrompt = {
    ...profilo,
    _prodottiCatalogo: await loadProdotti(admin),
  };

  const interventiGrezzi = await buildPianoInterventi(profiloPerPrompt, env, admin, { vision });
  const prodotti = profiloPerPrompt._prodottiCatalogo;
  const arricchiti = interventiGrezzi.map((i) =>
    arricchisciInterventoConProdotto(i, profilo, prodotti, vision),
  );
  const { interventi: conCatalogo, catalogoAggiunti } = integraCatalogoNelPiano(
    arricchiti,
    prodotti,
    profilo,
    oggi,
  );
  const conFitoFiltrati = filtraInterventiFitofarmacoCurativo(conCatalogo, { vision, profilo });
  const conControlli = mergeControlliMensili(conFitoFiltrati, oggi);
  const saved = await persistPianoStagionale(admin, userData.user.id, conControlli, profilo);

  return {
    count: saved.count,
    interventi: saved.interventi ?? [],
    tablesMissing: saved.tablesMissing,
    catalogoAggiunti,
  };
}
