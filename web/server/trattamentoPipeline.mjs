/**
 * Calendario trattamenti: Educazione (Fase 1–2) → Soluzione (Fase 3).
 * Non impone un singolo prodotto commerciale come titolo dell'evento.
 */

import {
  calcolaDose,
  inferMacroCategoriaProdotto,
  rankProdotti,
  isPreEmergenzaAnnualiIntervento,
} from "./prodottiCatalogo.mjs";
import {
  isInterventoFitofarmaco,
  isProdottoFitofarmaco,
  superficieMqVerificata,
  AVVISO_FITOFARMACO,
  AVVISO_MQ_MANCANTI,
} from "./sicurezzaProdotti.mjs";
function stagioneDaData(iso) {
  const m = new Date(`${iso || new Date().toISOString().slice(0, 10)}T12:00:00`).getMonth() + 1;
  if (m >= 3 && m <= 5) return "primavera";
  if (m >= 6 && m <= 8) return "estate";
  if (m >= 9 && m <= 11) return "autunno";
  return "inverno";
}

const TRATTAMENTO_CATEGORIE = new Set([
  "concime",
  "biostimolante",
  "umettante",
  "trattamento",
  "diserbo",
  "rinnovo",
]);

/** Regole agronomiche → macro-azione (Fase 1). */
const REGOLE_AZIONE = [
  {
    id: "K_antistress",
    macro: "K",
    categoria: "concime",
    tipo: "Concimazione potassica antistress",
    match: (ctx) => {
      const s = ctx.stagione;
      const et0 = ctx.et0 ?? 0;
      const tSuolo = ctx.tSuolo;
      if (s === "estate" && et0 >= 3.5) return true;
      if (s === "estate" && tSuolo != null && tSuolo >= 20) return true;
      if (/potass|antistress|caldo|siccit|ingiall/i.test(ctx.blob)) return true;
      return false;
    },
    razionale:
      "Stress termico e/o elevata evapotraspirazione: il potassio rinforza le pareti cellulari e migliora la ritenzione idrica.",
  },
  {
    id: "N_primavera",
    macro: "N",
    categoria: "concime",
    tipo: "Concimazione azotata di ripresa",
    match: (ctx) => {
      if (ctx.stagione === "estate") return false;
      if (ctx.stagione === "primavera") return true;
      if (/azoto|verde|ripresa|rinverd/i.test(ctx.blob)) return true;
      return false;
    },
    razionale: "Ripresa vegetativa: l'azoto sostiene la ricostruzione della massa fogliare.",
  },
  {
    id: "P_autunno",
    macro: "P",
    categoria: "concime",
    tipo: "Concimazione fosforica radicale",
    match: (ctx) => {
      if (ctx.stagione === "autunno") return true;
      if (/fosfor|radic|autunno|radici/i.test(ctx.blob)) return true;
      return false;
    },
    razionale: "Autunno: il fosforo favorisce lo sviluppo radicale prima del riposo invernale.",
  },
  {
    id: "fungicida_preventivo",
    macro: "Fungicida",
    categoria: "trattamento",
    tipo: "Trattamento funghicida preventivo",
    match: (ctx) => {
      if (/fungh|oidio|marcium|patogen|micod/i.test(ctx.blob)) return true;
      if (ctx.stagione === "primavera" && ctx.umiditaAlta) return true;
      return false;
    },
    razionale:
      "Finestra umido-mite favorevole ai patogeni fogliari: intervento preventivo su foglia asciutta.",
  },
  {
    id: "insetticida_monitoraggio",
    macro: "Insetticida",
    categoria: "trattamento",
    tipo: "Monitoraggio e trattamento insetti del tappeto",
    match: (ctx) => /larv|popillia|maggiolino|otiorrinco|insett|afid/i.test(ctx.blob),
    razionale: "Segnalazione di pressione da insetti/larve: valutare trattamento mirato secondo etichetta.",
  },
  {
    id: "diserbo_pre",
    macro: "Diserbante",
    categoria: "diserbo",
    tipo: "Diserbo pre-emergenza annuali",
    match: (ctx) => isPreEmergenzaAnnualiIntervento(ctx.intervento) || /pre.?emerg|annualit|setaria|digitaria/i.test(ctx.blob),
    razionale: "Controllo erbe annuali in germinazione prima che competano con il tappeto.",
  },
  {
    id: "diserbo_post",
    macro: "Diserbante",
    categoria: "diserbo",
    tipo: "Diserbo selettivo post-emergenza",
    match: (ctx) => ctx.intervento?.categoria === "diserbo",
    razionale: "Intervento su infestanti già emersi, con prodotto selettivo per il tappeto.",
  },
  {
    id: "biostimolante_stress",
    macro: "Biostimolante",
    categoria: "biostimolante",
    tipo: "Biostimolazione antistress",
    match: (ctx) => {
      if (ctx.intervento?.categoria === "biostimolante") return true;
      if (ctx.stagione === "estate" && ctx.et0 >= 2.5) return true;
      return /biostim|stress|tryko|pre.?stress/i.test(ctx.blob);
    },
    razionale: "Supporto fisiologico in condizioni di stress ambientale.",
  },
  {
    id: "rinnovo_seme",
    macro: "Semente",
    categoria: "rinnovo",
    tipo: "Rinnovo del tappeto con semina",
    match: (ctx) => ctx.intervento?.categoria === "rinnovo" || /seme|overseed|rinnov|calva/i.test(ctx.blob),
    razionale: "Diradamento o calve: reintegrare il tappeto con seme idoneo alla zona.",
  },
  {
    id: "umettante",
    macro: "Bagnante",
    categoria: "umettante",
    tipo: "Miglioramento bagnatura dei trattamenti",
    match: (ctx) => ctx.intervento?.categoria === "umettante",
    razionale: "Umettante per uniformare la distribuzione dei trattamenti liquidi.",
  },
];

const SPIEGAZIONI = {
  K: (ctx) =>
    `Con ${ctx.stagione === "estate" ? "l'arrivo del caldo intenso" : "le condizioni attuali"}, il prato ha bisogno di rinforzare le sue difese per non ingiallire e trattenere meglio l'acqua. Per farlo, serve un apporto di Potassio (K)${ctx.et0 != null ? ` (in questo periodo l'evaporazione è circa ${ctx.et0} mm/giorno)` : ""}.`,
  N: () =>
    "Dopo il riposo invernale il prato deve ricostruire il verde: in questa fase serve principalmente Azoto (N), la spinta che fa crescere le foglie.",
  P: () =>
    "In autunno le radici sono le protagoniste: un apporto di Fosforo (P) aiuta il prato a radicare meglio prima dell'inverno.",
  Fungicida: () =>
    "Con umidità e temperature miti i funghi possono attaccare le foglie. Un trattamento preventivo protegge il manto senza aspettare i danni visibili.",
  Insetticida: () =>
    "Alcuni insetti o larve possono danneggiare le radici e il fogliame. Un controllo mirato aiuta a evitare calve e ingiallimenti.",
  Diserbante: () =>
    "Le erbe infestanti rubano spazio e acqua al prato. In questo momento conviene intervenire prima che diventino dominate.",
  Biostimolante: (ctx) =>
    `Il prato è sotto stress${ctx.stagione === "estate" ? " da caldo o passaggi frequenti" : ""}: i biostimolanti aiutano la pianta a reagire meglio, senza forzare una crescita eccessiva.`,
  Semente: () =>
    "Ci sono zone dove il tappeto si dirada: con una semina mirata si recupera densità e colore in modo naturale.",
  Bagnante: () =>
    "Per far funzionare bene un trattamento liquido, a volte serve un aiuto che distribuisce meglio il prodotto sulla foglia.",
  Altro: (ctx) =>
    `In base al tuo prato e alla stagione (${ctx.stagione}), questo intervento aiuta a mantenere il manto in equilibrio.`,
};

function istruzioniUsoProdotto(prodotto, intervento, stagione) {
  const fito = isProdottoFitofarmaco(prodotto);
  if (fito) {
    return "Leggi sempre l'etichetta del prodotto, rispetta i tempi di carenza e applica con equipaggiamento adeguato. In dubbio chiedi a un agronomo.";
  }
  const cat = String(intervento?.categoria || "").toLowerCase();
  if (cat === "concime") {
    return stagione === "estate"
      ? "Distribuisci su prato asciutto nelle ore fresche (mattina o sera). Irriga leggermente se non piove entro 48 ore."
      : "Distribuisci su prato asciutto, in giornata mite. Irriga o attendi pioggia entro 2 giorni se il prodotto lo richiede.";
  }
  if (cat === "biostimolante" || cat === "umettante") {
    return "Applica in mattinata su foglia asciutta o leggermente umida. Evita le ore di caldo intenso.";
  }
  if (cat === "rinnovo") {
    return "Semina su terreno preparato e compatto. Mantieni il suolo umido (nebbia leggera) fino al germoglio.";
  }
  return "Segui le indicazioni sulla confezione e le condizioni meteo del giorno.";
}

function contestoMeteo(weatherBundle, dataIso) {
  const ag = weatherBundle?.agronomic || weatherBundle?.meteo_agronomico;
  const forecast = ag?.forecast_daily?.[0] || weatherBundle?.current;
  return {
    et0: ag?.et0_mm_oggi ?? ag?.et0_mm_media_7g ?? null,
    tSuolo: ag?.soil_temperature_10cm_c ?? forecast?.soil_temperature_10cm ?? null,
    gdd30: ag?.gdd?.cumul_30g ?? null,
    umiditaAlta: forecast?.humidity != null ? forecast.humidity >= 70 : false,
    stagione: stagioneDaData(dataIso),
  };
}

/**
 * Fase 1: identifica macro-azione da regole + meteo + testo intervento.
 */
export function identificaMacroAzione(intervento, { profilo, vision, weatherBundle } = {}) {
  const data = intervento?.data_prevista;
  const meteo = contestoMeteo(weatherBundle, data);
  const blob = [
    intervento?.titolo,
    intervento?.descrizione,
    vision?.sintesi_visiva,
    vision?.diagnosi_avanzata,
    ...(vision?.problemi_rilevati || []).map((p) => `${p.problema} ${p.dettaglio}`),
    profilo?.esposizione,
    profilo?.tipo_terreno,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const ctx = { ...meteo, blob, intervento, profilo, vision };

  for (const regola of REGOLE_AZIONE) {
    if (regola.match(ctx) && regola.categoria === intervento?.categoria) {
      return {
        id: regola.id,
        macro: regola.macro,
        categoria: regola.categoria,
        tipo_intervento: regola.tipo,
        razionale_scientifico: regola.razionale,
      };
    }
  }

  for (const regola of REGOLE_AZIONE) {
    if (regola.match(ctx)) {
      return {
        id: regola.id,
        macro: regola.macro,
        categoria: regola.categoria,
        tipo_intervento: regola.tipo,
        razionale_scientifico: regola.razionale,
      };
    }
  }

  const macroFallback = {
    concime: "N",
    biostimolante: "Biostimolante",
    umettante: "Bagnante",
    trattamento: "Fungicida",
    diserbo: "Diserbante",
    rinnovo: "Semente",
  }[intervento?.categoria] || "Altro";

  return {
    id: "generico",
    macro: macroFallback,
    categoria: intervento?.categoria,
    tipo_intervento: intervento?.titolo || `Intervento ${intervento?.categoria}`,
    razionale_scientifico: "Intervento coerente con profilo prato e stagione.",
  };
}

/**
 * Fase 2: testo educativo per l'utente finale.
 */
export function generaSpiegazioneSemplice(azione, ctx) {
  const fn = SPIEGAZIONI[azione.macro] || SPIEGAZIONI.Altro;
  return fn(ctx).slice(0, 700);
}

/**
 * Fase 3: 2–3 prodotti idonei con dose calcolata sui m².
 */
export function suggerisciProdottiConsigliati(azione, prodotti, profilo, intervento, vision) {
  const mq = superficieMqVerificata(profilo);
  const categoria = azione.categoria || intervento?.categoria;
  const opts = { categoriaIntervento: categoria, vision, intervento, profilo };

  let ranked = rankProdotti(prodotti, opts);

  ranked = ranked.filter(({ p }) => {
    const macroP = inferMacroCategoriaProdotto(p, intervento);
    if (azione.macro === "Altro") return true;
    return macroP === azione.macro;
  });

  const top = ranked.slice(0, 3).map(({ p }) => {
    const fito = isProdottoFitofarmaco(p);
    const dose = !fito && mq ? calcolaDose(p, mq) : null;
    const perMq =
      p.dosaggio_standard_mq ?? p.dose_fogliare ?? p.dose_radicale;
    return {
      id: p.id,
      nome_commerciale: p.nome,
      marca: p.marca || "",
      principio_attivo: p.principio_attivo || p.composizione?.slice(0, 120) || null,
      macro_categoria: inferMacroCategoriaProdotto(p, intervento),
      dose_totale_calcolata: dose
        ? `${dose.dose_display} da distribuire su ${mq} m²`
        : mq
          ? null
          : "Imposta i m² del prato nel profilo per calcolare la dose",
      dose_per_mq: dose?.dose_per_mq_display || (perMq ? `${perMq} ${p.unita_misura || "g"}/m²` : null),
      istruzioni_uso: istruzioniUsoProdotto(p, intervento, stagioneDaData(intervento?.data_prevista)),
      periodo_ideale: p.periodo_ideale || p.periodo_uso || null,
      avviso_fitofarmaco: fito,
    };
  });

  return top;
}

/**
 * Pipeline completa Educazione → Soluzione.
 */
export function buildDettaglioTrattamento(intervento, { profilo, prodotti, vision, weatherBundle } = {}) {
  const dataIso = intervento?.data_prevista;
  const meteo = contestoMeteo(weatherBundle, dataIso);
  const ctx = { ...meteo, intervento, profilo, vision };

  const azione = identificaMacroAzione(intervento, { profilo, vision, weatherBundle });
  const spiegazione_semplice = generaSpiegazioneSemplice(azione, ctx);
  const prodotti_consigliati = suggerisciProdottiConsigliati(
    azione,
    prodotti,
    profilo,
    intervento,
    vision,
  );

  return {
    tipo_intervento: azione.tipo_intervento,
    macro_categoria: azione.macro,
    spiegazione_semplice,
    razionale_scientifico: azione.razionale_scientifico,
    prodotti_consigliati,
    contesto_meteo: {
      stagione: meteo.stagione,
      et0_mm: meteo.et0,
      temperatura_suolo_c: meteo.tSuolo,
      gdd_30g: meteo.gdd30,
    },
  };
}

export function arricchisciInterventoTrattamento(intervento, profilo, prodotti, vision, weatherBundle) {
  const cat = String(intervento?.categoria || "").toLowerCase();
  if (!TRATTAMENTO_CATEGORIE.has(cat)) {
    return {
      ...intervento,
      dettaglio_trattamento: null,
    };
  }

  const mq = superficieMqVerificata(profilo);
  const dettaglio = buildDettaglioTrattamento(intervento, {
    profilo,
    prodotti,
    vision,
    weatherBundle,
  });

  const fito = cat === "trattamento" || cat === "diserbo";
  const avvisi = [];
  if (!mq) avvisi.push(AVVISO_MQ_MANCANTI);
  if (fito) avvisi.push(AVVISO_FITOFARMACO);

  return {
    ...intervento,
    titolo: String(dettaglio.tipo_intervento).slice(0, 120),
    macro_categoria: dettaglio.macro_categoria,
    spiegazione_semplice: dettaglio.spiegazione_semplice,
    messaggio_ux: dettaglio.spiegazione_semplice,
    razionale_scientifico: dettaglio.razionale_scientifico,
    dettaglio_trattamento: dettaglio,
    prodotto_id: null,
    prodotto_nome: null,
    dose_totale: null,
    dose_unita: null,
    dose_per_mq: null,
    dosaggio_calcolato: null,
    avviso_fitofarmaco: fito && dettaglio.prodotti_consigliati.some((p) => p.avviso_fitofarmaco),
    descrizione: [dettaglio.razionale_scientifico, ...avvisi].filter(Boolean).join(" ").slice(0, 600),
  };
}

/** Per API/UI: formato pubblico del dettaglio. */
export function dettaglioTrattamentoPubblico(row) {
  if (row?.dettaglio_trattamento && typeof row.dettaglio_trattamento === "object") {
    return row.dettaglio_trattamento;
  }
  if (row?.spiegazione_semplice || row?.messaggio_ux) {
    return {
      tipo_intervento: row.titolo,
      spiegazione_semplice: row.spiegazione_semplice || row.messaggio_ux,
      prodotti_consigliati: row.prodotto_nome
        ? [
            {
              nome_commerciale: row.prodotto_nome,
              dose_totale_calcolata: row.dosaggio_calcolato,
            },
          ]
        : [],
    };
  }
  return null;
}
