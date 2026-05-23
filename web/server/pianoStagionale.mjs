import { createClient } from "@supabase/supabase-js";
import { fetchWeatherBundle, formatWeatherForPrompt } from "./weatherCore.mjs";
import { ensurePreEmergenzaAnnuali, valutaPreEmergenzaAnnuali } from "./preEmergenzaAnnuali.mjs";
import { loadProdotti } from "./prodottiCatalogo.mjs";
import { superficieMqVerificata } from "./sicurezzaProdotti.mjs";
import { arricchisciInterventoTrattamento } from "./trattamentoPipeline.mjs";
import { mergeControlliMensili } from "./controlliMensili.mjs";
import { hintParassitiRegionali } from "./parassitiPrato.mjs";
import { ensureOmbraOverseedInterventi } from "./pratoZone.mjs";
import { formatProfileForPrompt } from "./profileContext.mjs";
import { configLivelloImpegno, testoLivelloPerPrompt } from "./livelloImpegno.mjs";
import { applicaRegolaTrasemina, sanitizzaPianoCompleto } from "./sanitizzaCalendario.mjs";
import { loadStoricoTrattamenti } from "./agronomicGuardrails.mjs";
import {
  REGOLE_FITOFARMACI_PROMPT,
  filtraInterventiFitofarmacoCurativo,
} from "./regoleFitofarmaci.mjs";
import { buildFocolaiPromptBlock } from "./focolaiRegionali.mjs";

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
  const cfgLivello = configLivelloImpegno(profilo);

  let focolaiBlock = "";
  try {
    focolaiBlock = await buildFocolaiPromptBlock(admin, profilo);
  } catch {
    focolaiBlock = "";
  }

  const prompt = `Sei il miglior agronomo di tappeto erboso in Italia. Crea un CALENDARIO LAVORI strategico, giorno per giorno (date precise), per i prossimi 12 mesi.

Oggi: ${oggi} (${mese})
Periodo piano: da ${oggi} a ${fine}

Profilo sito:
${formatProfileForPrompt(profilo)}

${testoLivelloPerPrompt(profilo)}

${weatherBlock}

${preEmergenzaBlock ? `${preEmergenzaBlock}\n` : ""}

${hintParassitiRegionali(profilo?.localita)}

${focolaiBlock}

Knowledge base (prodotti e pratiche — usa nomi e dosaggi quando presenti):
${kb || "(usa best practice italiane per prato da giardino)"}

Nota: dopo la generazione, il sistema aggiunge automaticamente al calendario tutti i prodotti idonei del catalogo Bottos (concimi liquidi/granulari, ammendanti, biostimolanti, umettanti, trattamenti) con priorità bassa/media — non serve elencarli tutti qui.

Obiettivo: elencare i lavori STRATEGICI del prato (NON taglio né irrigazione generica — gestiti dall'app come abitudini), con data_prevista YYYY-MM-DD:
- Concimazioni (NPK, autunno/primavera, slow, microelementi, ferro)
- Diserbi: pre-emergenza setaria/digitaria quando il blocco termico indica finestra aperta; post-emergenza selettivo se erbe visibili
- Arieggiazione / scarifica / svasatura
- Biostimolanti e stress (caldo, siccità) — in luglio/agosto NO concimi azotati, solo antistress
- Agenti umettanti (solo livello Pro/Greenkeeper)
- Solo marca BOTTOS per concimi, biostimolanti, umettanti, ammendanti
- Overseeding/semina SOLO abbinato ad arieggiatura o scarifica nello stesso mese (vedi regola TRASEMINA)
- Pulizia foglie, controllo feltro, bordi

${REGOLE_FITOFARMACI_PROMPT}

Rispondi SOLO JSON:
{
  "interventi": [
    {
      "titolo": "max 80 caratteri, MACRO-AZIONE agronomica (es. Concimazione potassica antistress, Trattamento funghicida preventivo) — MAI nomi commerciali",
      "descrizione": "perché serve ora (GDD, meteo, stress), cosa fare in pratica — senza citare marchi o dosi commerciali",
      "categoria": "taglio|irrigazione|concime|trattamento|pulizia|diserbo|arieggiatura|biostimolante|umettante|rinnovo|altro",
      "priorita": "alta|media|bassa",
      "data_prevista": "YYYY-MM-DD"
    }
  ]
}

REGOLE TASSATIVE:
1. LIVELLO UTENTE: ${testoLivelloPerPrompt(profilo)}. Massimo ${cfgLivello.maxInterventi} interventi strategici. Se Base, ignora trattamenti liquidi mensili ripetuti.
2. ROUTINE: NON generare mai task per taglio o irrigazione generica (settimanali o ricorrenti).
3. TANK-MIX: Se in un mese prevedi più prodotti liquidi compatibili (es. Tryko Plus + Vigor Liquid, Pre-Stress + Always), uniscili in UN solo intervento "Tank-Mix: [Nome]" con miscela in descrizione.
4. REGOLA TRASEMINA: Non generare MAI interventi isolati di categoria "rinnovo" (semina/trasemina). Il seme va consigliato ESCLUSIVAMENTE in abbinamento o nello stesso mese di un intervento di "arieggiatura" o "scarifica". Se non c'è arieggiatura nello stesso mese, non c'è trasemina.

Regole aggiuntive:
- Distribuisci su tutto l'anno (non ammassare in una settimana).
- Date reali tra ${oggi} e ${fine}; stagionalità italiana e località.
- Picco concimi primavera/autunno; luglio-agosto solo biostimolanti antistress, mai concimi azotati.
- Evita duplicati stesso giorno con stesso titolo.
- priorita alta per overseeding, pre-emergenza, stress caldo.
- Adatta a obiettivo e livello concimi del profilo.`;

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
  parsedList = applicaRegolaTrasemina(parsedList);
  parsedList = ensureOmbraOverseedInterventi(parsedList, profilo?.prato_zone, profilo, oggi, addDays);
  parsedList = applicaRegolaTrasemina(parsedList);

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
    fonte: i.fonte || "calendario_stagionale",
    prodotto_id: i.prodotto_id ?? null,
    prodotto_nome: i.prodotto_nome ?? null,
    dose_totale: i.dose_totale ?? null,
    dose_unita: i.dose_unita ?? null,
    dose_per_mq: i.dose_per_mq ?? null,
    razionale_scientifico: i.razionale_scientifico ?? null,
    messaggio_ux: i.messaggio_ux ?? null,
    macro_categoria: i.macro_categoria ?? null,
    dosaggio_calcolato: i.dosaggio_calcolato ?? null,
    spiegazione_semplice: i.spiegazione_semplice ?? i.messaggio_ux ?? null,
    dettaglio_trattamento: i.dettaglio_trattamento ?? null,
    manual_override: false,
  }));

  const batchSize = 50;
  const saved = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    let { data, error } = await admin.from("prato_interventi").insert(batch).select("*");
    if (error) {
      if (error.code === "PGRST205") return { count: 0, tablesMissing: true };
      if (/prodotto_|dose_|dettaglio_trattamento|spiegazione_semplice/.test(error.message || "")) {
        const slim = batch.map(
          ({
            prodotto_id,
            prodotto_nome,
            dose_totale,
            dose_unita,
            dose_per_mq,
            razionale_scientifico,
            messaggio_ux,
            macro_categoria,
            dosaggio_calcolato,
            spiegazione_semplice,
            dettaglio_trattamento,
            ...r
          }) => r,
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

  let weatherBundle = null;
  try {
    weatherBundle = await fetchWeatherBundle(profilo.localita, env.OPENWEATHER_API_KEY);
  } catch {
    /* meteo opzionale per pipeline */
  }

  const arricchiti = interventiGrezzi.map((i) =>
    arricchisciInterventoTrattamento(i, profilo, prodotti, vision, weatherBundle),
  );
  const conFitoFiltrati = filtraInterventiFitofarmacoCurativo(arricchiti, { vision, profilo });
  const conControlli = mergeControlliMensili(conFitoFiltrati, oggi);
  const storico = await loadStoricoTrattamenti(admin, userData.user.id, oggi);
  const sanitizzati = await sanitizzaPianoCompleto(conControlli, profilo, oggi, {
    storico,
    prodotti,
    vision,
    weatherBundle,
  });
  const catalogoAggiunti = 0;
  const saved = await persistPianoStagionale(admin, userData.user.id, sanitizzati, profilo);

  return {
    count: saved.count,
    interventi: saved.interventi ?? [],
    tablesMissing: saved.tablesMissing,
    catalogoAggiunti,
  };
}
