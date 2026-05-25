import { createClient } from "@supabase/supabase-js";
import { fetchWeatherBundle, formatWeatherForPrompt } from "./weatherCore.mjs";
import { ensurePreEmergenzaAnnuali, valutaPreEmergenzaAnnuali } from "./preEmergenzaAnnuali.mjs";
import { superficieMqVerificata } from "./sicurezzaProdotti.mjs";
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
import { queryKnowledgeBasePrioritized } from "./kbQuery.mjs";
import { recuperaParametriRag } from "./ragParametriAgronomici.mjs";
import { pipelineAdattamentiPostPiano } from "./pianoAdattivo.mjs";
import {
  arricchisciInterventoEsigenze,
  buildTimelineBisogni,
} from "./esigenzeAgronomiche.mjs";
import { generaCalendarioDeterministico } from "./calendarioBase.mjs";
import { loadProdotti } from "./prodottiCatalogo.mjs";
import { loadIndiceProdottiPerIntervento, loadProdottiMercatoRows } from "./prodottiMercato.mjs";
import { applicaSolumVoceADettaglio } from "./solumVoce.mjs";
import { applicaPrescrizioneKbGuidata } from "./prescrizioneKbGuidata.mjs";

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

/** Voce accademica Gemini su matrice già datata (non modifica date né molecole). */
async function arricchisciVoceBiochimica(matrice, profilo, env, { admin, vision, parametriRag, weatherBundle } = {}) {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiKey) throw new Error("Manca GEMINI_API_KEY");

  const oggi = new Date().toISOString().slice(0, 10);
  const cfgLivello = configLivelloImpegno(profilo);
  const interventiBase = matrice.interventi.slice(0, cfgLivello.maxInterventi);

  let kb = matrice.prescrizione_kb?.kb_block || "";
  if (!kb) {
    const searchText = [
      "fisiologia tappeto erboso GDD ET0 osmoprotezione",
      profilo?.note,
      profilo?.localita,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const emb = await geminiEmbed(searchText.slice(0, 4000), geminiKey);
      const chunks = await queryKnowledgeBasePrioritized(admin, emb, {
        matchCount: 4,
        fetchCount: 16,
        minLibri: 2,
      });
      kb = chunks.map((c, i) => `[${i + 1}] ${c.soluzione || ""}`).join("\n\n");
    } catch {
      kb = "";
    }
  }

  const weatherBlock = weatherBundle ? formatWeatherForPrompt(weatherBundle) : "";
  const delta = matrice.delta_meteo;

  const prompt = `Sei un biochimico del tappeto erboso e un copywriter UX per app di giardinaggio (italiano).

## RUOLO
NON inventare interventi, date, dosi o marchi commerciali.
Ricevi una MATRICE DETERMINISTICA già calcolata da Solum (DB + adattamento meteo).
Il tuo compito è separare DRASTICAMENTE linguaggio operativo (per l'utente) da linguaggio scientifico (dietro un tap in app).

## VINCOLI ASSOLUTI
- Stesso numero di righe in output e input; ogni riga deve avere lo stesso \`id_riferimento\` dell'input.
- NON mescolare gergo tecnico nel titolo_semplice_azione né nel messaggio_operativo_breve.
- \`prodotti_consigliati\`: solo nomi generici o categorie (es. "Concime NP-K", "Biostimolante alghe"), mai marchi registrati.
- data_prevista, categoria, priorita, esigenze_molecolari: non alterare il significato agronomico dell'input.
- Le regole KB/precrizione già applicate (es. no azoto luglio-agosto, priorità potassio estivo) sono vincolanti: non contraddirle.

Profilo:
${formatProfileForPrompt(profilo)}

${testoLivelloPerPrompt(profilo)}

Zona climatica: ${matrice.zona_climatica}
Delta meteo: GDD primavera ${Math.round((delta.gdd_primavera_delta_pct || 0) * 100)}% vs norma; ET0 picco estivo: ${delta.et0_picco_estivo ? "sì" : "no"}.

${weatherBlock}

${REGOLE_FITOFARMACI_PROMPT}

Knowledge base (contesto, non inventare):
${kb || "(nessun chunk)"}

MATRICE INPUT (${interventiBase.length} righe):
${JSON.stringify(
  interventiBase.map((i, idx) => ({
    id_riferimento: String(idx),
    data_prevista: i.data_prevista,
    titolo: i.titolo,
    fabbisogno_fisiologico: i.fabbisogno_fisiologico,
    esigenze_molecolari: i.esigenze_molecolari,
    categoria: i.categoria,
    priorita: i.priorita,
    adattamento_dinamico: i.adattamento_dinamico,
  })),
)}

Genera un output JSON rigoroso con questa esatta struttura per ogni intervento.
NON mescolare il linguaggio tecnico con quello semplice.

Rispondi SOLO JSON:
{
  "timeline_bisogni": {
    "oggi": "sintesi emergenza da delta meteo e prossimi interventi (linguaggio semplice)",
    "prossimo_mese": "bisogni entro 30 giorni",
    "finestre_stagionali": [{ "periodo": "MESE", "esigenza": "..." }]
  },
  "interventi": [
    {
      "id_riferimento": "ID originale passato in input (stringa)",
      "data_prevista": "YYYY-MM-DD identica input",
      "titolo_semplice_azione": "Breve e orientato all'azione (es. 'Rinforzo Estivo' o 'Taglio e Pulizia'). MAX 4 parole.",
      "messaggio_operativo_breve": "Istruzione pratica chiara (2-4 frasi complete con punto finale). Spiega cosa fare sul prato, senza gergo tecnico. Circa 200-320 caratteri, NON troncare a metà frase.",
      "titolo_tecnico": "L'esigenza molecolare o fenologica (es. 'Mitigazione stress da ROS').",
      "fabbisogno_fisiologico": "La spiegazione accademica dettagliata del PERCHÉ facciamo questo intervento. Tono scientifico e autorevole.",
      "prodotti_consigliati": ["Nome generico 1", "Nome generico 2"]
    }
  ]
}`;

  const raw = await geminiGenerate(geminiKey, prompt, { maxTokens: 12000, temperature: 0.2 });
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { interventi: interventiBase, timeline_bisogni: null };
  }

  const llmById = new Map(
    (parsed.interventi || []).map((i) => [String(i.id_riferimento ?? ""), i]),
  );
  const llmByDate = new Map(
    (parsed.interventi || []).map((i) => [String(i.data_prevista), i]),
  );

  const merged = interventiBase.map((base, idx) => {
    const llm = llmById.get(String(idx)) || llmByDate.get(base.data_prevista) || {};
    const titoloSemplice = String(llm.titolo_semplice_azione || "").trim();
    const messaggioOperativo = String(llm.messaggio_operativo_breve || "").trim();
    const titoloTecnico = String(llm.titolo_tecnico || "").trim();
    const fabbisognoLlm = String(llm.fabbisogno_fisiologico || "").trim();

    return {
      ...base,
      titolo: titoloSemplice || base.titolo,
      messaggio_ux: messaggioOperativo || base.messaggio_ux,
      messaggio_operativo_breve: messaggioOperativo,
      titolo_semplice_azione: titoloSemplice,
      titolo_tecnico_solum: titoloTecnico,
      fabbisogno_fisiologico: fabbisognoLlm || base.fabbisogno_fisiologico,
      descrizione: fabbisognoLlm || base.fabbisogno_fisiologico || base.descrizione,
      solum_voce: {
        titolo_semplice_azione: titoloSemplice,
        messaggio_operativo_breve: messaggioOperativo,
        titolo_tecnico: titoloTecnico,
        fabbisogno_fisiologico: fabbisognoLlm,
        prodotti_consigliati_gemini: Array.isArray(llm.prodotti_consigliati)
          ? llm.prodotti_consigliati.map(String)
          : [],
      },
      ordine: idx,
    };
  });

  return { interventi: merged, timeline_bisogni: parsed.timeline_bisogni || null };
}

export async function buildPianoInterventi(
  profilo,
  env,
  admin,
  { vision = null, parametriRag = null, weatherBundle = null } = {},
) {
  const oggi = new Date().toISOString().slice(0, 10);
  const fine = addDays(oggi, 365);

  let bundle = weatherBundle;
  if (!bundle && profilo?.localita?.trim()) {
    try {
      bundle = await fetchWeatherBundle(profilo.localita, env.OPENWEATHER_API_KEY, {
        lat: profilo.lat,
        lon: profilo.lng ?? profilo.lon,
      });
    } catch {
      bundle = null;
    }
  }

  const matrice = await generaCalendarioDeterministico(profilo, bundle, { admin });
  const matriceKb = await applicaPrescrizioneKbGuidata(matrice, {
    profilo,
    admin,
    geminiKey: env.GEMINI_API_KEY?.trim(),
    parametriRag,
  });
  const { interventi: conVoce, timeline_bisogni: timelineLlm } = await arricchisciVoceBiochimica(
    matriceKb,
    profilo,
    env,
    { admin, vision, parametriRag, weatherBundle: bundle },
  );

  const seen = new Set();
  let parsedList = conVoce
    .map((item, idx) => {
      const data = parseIsoDate(item.data_prevista, addDays(oggi, Math.min(idx * 3, 360)));
      const base = arricchisciInterventoEsigenze({
        titolo: String(item.titolo || "").trim(),
        descrizione: String(item.descrizione || item.fabbisogno_fisiologico || "").trim(),
        fabbisogno_fisiologico: String(item.fabbisogno_fisiologico || "").trim(),
        esigenze_molecolari: item.esigenze_molecolari,
        priorita: ["alta", "media", "bassa"].includes(String(item.priorita).toLowerCase())
          ? String(item.priorita).toLowerCase()
          : "media",
        categoria: normalizeCategoria(item.categoria),
        macro_categoria: item.macro_categoria ?? null,
        data_prevista: data >= oggi && data <= fine ? data : oggi,
        ordine: idx,
        adattamento_dinamico: item.adattamento_dinamico ?? null,
        fonte: item.fonte || "calendario_base",
      });
      const key = `${base.data_prevista}|${String(base.titolo).slice(0, 40)}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return base;
    })
    .filter(Boolean)
    .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista) || a.ordine - b.ordine);

  if (bundle) {
    try {
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
  parsedList._timelineLlm = timelineLlm;
  parsedList._matriceDeterministica = {
    zona_climatica: matriceKb.zona_climatica,
    delta_meteo: matriceKb.delta_meteo,
    template_count: matriceKb.template_count,
    prescrizione_kb: matriceKb.prescrizione_kb ?? null,
  };

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

  const profiloPerPrompt = { ...profilo };

  const parametriRag = await recuperaParametriRag("calendario", {
    admin,
    geminiKey: env.GEMINI_API_KEY?.trim(),
    profilo,
  });

  let weatherBundle = null;
  try {
    weatherBundle = await fetchWeatherBundle(profilo.localita, env.OPENWEATHER_API_KEY, {
      lat: profilo.lat,
      lon: profilo.lng ?? profilo.lon,
    });
  } catch {
    /* meteo opzionale per pipeline */
  }

  const interventiGrezziRaw = await buildPianoInterventi(profiloPerPrompt, env, admin, {
    vision,
    parametriRag,
    weatherBundle,
  });
  const timelineLlm = interventiGrezziRaw._timelineLlm;
  const interventiGrezzi = interventiGrezziRaw;

  const conFitoFiltrati = filtraInterventiFitofarmacoCurativo(interventiGrezzi, { vision, profilo });
  const conControlli = mergeControlliMensili(conFitoFiltrati, oggi);
  const storico = await loadStoricoTrattamenti(admin, userData.user.id, oggi);
  const [prodotti, indiceProdottiIntervento, mercatoRows] = await Promise.all([
    loadProdotti(admin),
    loadIndiceProdottiPerIntervento(admin),
    loadProdottiMercatoRows(admin),
  ]);
  const sanitizzatiRaw = await sanitizzaPianoCompleto(conControlli, profilo, oggi, {
    storico,
    prodotti,
    vision,
    weatherBundle,
    pureAgronomy: false,
    indiceProdottiIntervento,
    mercatoRows,
  });
  const sanitizzati = applicaSolumVoceADettaglio(sanitizzatiRaw);
  const timeline_bisogni = buildTimelineBisogni(sanitizzati, oggi, {
    llmTimeline: timelineLlm,
    weatherBundle,
  });
  const catalogoAggiunti = 0;
  const saved = await persistPianoStagionale(admin, userData.user.id, sanitizzati, profilo);

  let adattamenti = null;
  try {
    adattamenti = await pipelineAdattamentiPostPiano({
      admin,
      userId: userData.user.id,
      profilo,
      weatherBundle,
      vision,
    });
  } catch (e) {
    console.warn("[piano] adattamenti dinamici:", e.message);
  }

  return {
    count: saved.count,
    interventi: saved.interventi ?? [],
    tablesMissing: saved.tablesMissing,
    catalogoAggiunti,
    adattamenti,
    timeline_bisogni,
    parametri_rag_fonte: parametriRag?.fonte,
  };
}
