/**
 * Motore semina basato su temperatura suolo (Open-Meteo), non sul mese.
 */

import { fetchWeatherBundle } from "./weatherCore.mjs";
import { normalizePratoZone, computeOmbraZonePct, lawnCentroid } from "./pratoZone.mjs";
import { calcolaDose, rankProdotti } from "./prodottiCatalogo.mjs";
import { superficieMqVerificata } from "./sicurezzaProdotti.mjs";
import { filtraPoolSementiPerColore } from "./colorMatchingSementi.mjs";

const ESSENZE = {
  BLOCCO_TERMICO: {
    status: "BLOCCO_TERMICO",
    titolo: "Semina sospesa — suolo troppo freddo",
  },
  LOIETTO: {
    status: "LOIETTO",
    titolo: "Semina con Lolium perenne (loietto)",
    pattern: /loietto|lolium\s*perenne|lolium(?!\s*arundin)|paco|trivialis/i,
  },
  FESTUCA_ARUNDINACEA: {
    status: "FESTUCA_ARUNDINACEA",
    titolo: "Semina con Festuca arundinacea",
    pattern: /arundinacea|festuca\s*arundin|tall\s*fescue/i,
  },
  FESTUCA_RUBRA: {
    status: "FESTUCA_RUBRA",
    titolo: "Semina con Festuca rubra (zone ombra)",
    pattern: /festuca\s*rubra|rubra|mezzombra|shade|ombreggiat/i,
  },
  ALLERTA_CALDO: {
    status: "ALLERTA_CALDO",
    titolo: "Attenzione caldo — valuta macroterme",
    pattern: /macroterm|cynodon|bermuda|zoysia|tepi|warm\s*season/i,
  },
};

/**
 * Media °C suolo (proxy 6+18 cm) ultimi N giorni via Open-Meteo.
 * @param {number} lat
 * @param {number} lon
 * @param {number} [giorni=5]
 */
export async function getTemperaturaSuoloMedia(lat, lon, giorni = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Coordinate non valide per temperatura suolo");
  }

  const giorniClamped = Math.min(7, Math.max(3, Math.round(giorni)));
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=soil_temperature_6cm,soil_temperature_18cm` +
    `&past_days=${giorniClamped}&forecast_days=1&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo suolo: ${res.status}`);
  const data = await res.json();
  const times = data.hourly?.time || [];
  const t6 = data.hourly?.soil_temperature_6cm || [];
  const t18 = data.hourly?.soil_temperature_18cm || [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - giorniClamped);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const vals = [];
  for (let i = 0; i < times.length; i++) {
    if (times[i].slice(0, 10) < cutoffIso) continue;
    const a = t6[i];
    const b = t18[i];
    if (a != null && b != null) vals.push((Number(a) + Number(b)) / 2);
    else if (a != null) vals.push(Number(a));
    else if (b != null) vals.push(Number(b));
  }

  if (!vals.length) {
    return { media: null, giorni: giorniClamped, campioni: 0, fonte: "open-meteo" };
  }

  const media = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  return { media, giorni: giorniClamped, campioni: vals.length, fonte: "open-meteo" };
}

/** % ombra 0–100 da mappa o profilo. */
export function percentualeOmbraProfilo(profilo) {
  const daMappa = computeOmbraZonePct(profilo?.prato_zone);
  if (daMappa != null && daMappa > 0) return daMappa;

  const oz = profilo?.ombra_zone_pct;
  if (oz === "75_100") return 85;
  if (oz === "50_75") return 62;
  if (oz === "25_50") return 37;
  if (oz === "0_25") return 12;

  const esp = profilo?.esposizione;
  if (esp === "ombra") return 70;
  if (esp === "mezzombra") return 45;
  return 0;
}

/**
 * Regole essenza da temperatura suolo e ombra.
 * @param {number|null} temperaturaSuolo
 * @param {{ esposizioneOmbraPct?: number, lat?: number }} [opts]
 */
export function calcolaEssenzaIdeale(temperaturaSuolo, opts = {}) {
  const t = temperaturaSuolo;
  const ombraPct = opts.esposizioneOmbraPct ?? 0;
  const lat = opts.lat;

  if (t == null || Number.isNaN(t)) {
    return {
      essenza: "DATI_MANCANTI",
      status_semina: "DATI_MANCANTI",
      messaggio_educativo:
        "Non è stato possibile leggere la temperatura del suolo. Ripeti tra qualche giorno o verifica la località nel profilo.",
    };
  }

  if (ombraPct > 50 && t > 10) {
    return {
      essenza: "FESTUCA_RUBRA",
      status_semina: "FESTUCA_RUBRA",
      messaggio_educativo:
        `Il suolo è a circa ${t}°C e oltre metà del prato è in ombra. La Festuca rubra germina meglio con meno sole diretto e forma un tappeto fitto nelle zone ombreggiate.`,
    };
  }

  if (t < 8) {
    return {
      essenza: "BLOCCO_TERMICO",
      status_semina: "BLOCCO_TERMICO",
      messaggio_educativo:
        `Temperatura media suolo ${t}°C: sotto gli 8°C il seme rischia marciumi e germinazione irregolare. Attendi che il terreno si riscaldi (idealmente 10–18°C) prima di seminare.`,
    };
  }

  if (t < 12) {
    return {
      essenza: "LOIETTO",
      status_semina: "LOIETTO",
      messaggio_educativo:
        `Con ${t}°C nel suolo il Lolium perenne (loietto) è la scelta più sicura: germina in fretta anche con temperature ancora basse e copre le calve in pochi giorni.`,
    };
  }

  if (t <= 17.9) {
    return {
      essenza: "FESTUCA_ARUNDINACEA",
      status_semina: "FESTUCA_ARUNDINACEA",
      messaggio_educativo:
        `A ${t}°C la finestra è ottimale per la Festuca arundinacea: radici profonde e tappeto resistente. Prepara il letto con arieggiatura leggera prima di distribuire il seme.`,
    };
  }

  const sudItalia = lat != null && lat < 42;
  return {
    essenza: sudItalia ? "ALLERTA_CALDO_MACROTERME" : "ALLERTA_CALDO",
    status_semina: "ALLERTA_CALDO",
    messaggio_educativo: sudItalia
      ? `Suolo a ${t}°C: caldo elevato per le graminacee da prato temperato. In zone meridionali valuta macroterme (Cynodon/Zoysia) o posticipa la semina alle ore fresche; irriga spesso fino al germoglio.`
      : `Suolo a ${t}°C: rischio stress termico in germinazione. Preferisci ore serali, irrigazione frequente a nebbia e evita concimi in sovradosaggio nelle prime settimane.`,
    preferisciMacroterme: sudItalia,
  };
}

export async function resolveCoordsProfilo(profilo) {
  const c = lawnCentroid(profilo?.prato_zone);
  if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
    return { lat: c.lat, lon: c.lng, fonte: "mappa" };
  }

  if (profilo?.localita?.trim()) {
    const bundle = await fetchWeatherBundle(profilo.localita.trim(), null);
    return { lat: bundle.geo.lat, lon: bundle.geo.lon, fonte: "geocoding" };
  }

  return null;
}

function matchProdottiPerEssenza(essenza, prodotti, profilo, vision, mq) {
  const key =
    essenza === "ALLERTA_CALDO_MACROTERME" ? "ALLERTA_CALDO" : essenza;
  const cfg = ESSENZE[key] || ESSENZE.FESTUCA_ARUNDINACEA;
  if (essenza === "BLOCCO_TERMICO" || essenza === "DATI_MANCANTI") return [];

  let pool = prodotti.filter((p) => /SEMENT/i.test(String(p.categoria || "")));
  if (cfg.pattern) pool = pool.filter((p) => cfg.pattern.test(`${p.nome} ${p.composizione || ""}`));
  if (!pool.length) {
    pool = prodotti.filter((p) => /SEMENT/i.test(String(p.categoria || "")));
  }

  pool = filtraPoolSementiPerColore(pool, vision);
  const ranked = rankProdotti(pool, {
    categoriaIntervento: "rinnovo",
    vision,
    profilo,
    intervento: { categoria: "rinnovo" },
  });

  return ranked.slice(0, 2).map(({ p }) => {
    const dose = mq ? calcolaDose(p, mq) : null;
    return {
      id: p.id,
      nome_commerciale: p.nome,
      marca: p.marca || "BOTTOS",
      essenza_target: essenza,
      dose_totale_calcolata: dose
        ? `${dose.dose_display} per ${mq} m²`
        : "Imposta i m² del prato per calcolare la dose",
      dose_per_mq: dose?.dose_per_mq_display || null,
      istruzioni_uso:
        "Semina su terreno preparato e compatto. Mantieni il suolo umido (irrigazione a nebbia) fino al germoglio; non calpestare finché le radici non ancorano.",
    };
  });
}

/**
 * Risposta completa motore semina.
 */
export async function buildRaccomandazioneSemina(profilo, prodotti = null, vision = null) {
  const coords = await resolveCoordsProfilo(profilo);
  const ombraPct = percentualeOmbraProfilo(profilo);
  let temperatura = null;

  if (coords) {
    const suolo = await getTemperaturaSuoloMedia(coords.lat, coords.lon, 5);
    temperatura = suolo.media;
  }

  const regola = calcolaEssenzaIdeale(temperatura, {
    esposizioneOmbraPct: ombraPct,
    lat: coords?.lat,
  });

  const catalogo = Array.isArray(prodotti) ? prodotti : [];
  const mq = superficieMqVerificata(profilo);
  const prodotti_raccomandati =
    regola.essenza === "BLOCCO_TERMICO" || regola.essenza === "DATI_MANCANTI"
      ? []
      : matchProdottiPerEssenza(regola.essenza, catalogo, profilo, vision, mq);

  return {
    status_semina: regola.status_semina,
    essenza: regola.essenza,
    temperatura_rilevata: temperatura,
    temperatura_unita: "°C",
    giorni_media_suolo: 5,
    percentuale_ombra: ombraPct,
    messaggio_educativo: regola.messaggio_educativo,
    tipo_intervento: ESSENZE[regola.essenza]?.titolo || regola.status_semina,
    prodotti_raccomandati,
    coordinate_fonte: coords?.fonte ?? null,
  };
}

/** Integra raccomandazione semina in intervento rinnovo (dettaglio_trattamento). */
export async function arricchisciRinnovoConSemina(intervento, profilo, prodotti, vision) {
  const raccomandazione = await buildRaccomandazioneSemina(profilo, prodotti, vision);
  const bloccato = raccomandazione.status_semina === "BLOCCO_TERMICO";

  const spiegazione_semplice = [
    raccomandazione.messaggio_educativo,
    raccomandazione.temperatura_rilevata != null
      ? `\n\nTemperatura media suolo (ultimi ${raccomandazione.giorni_media_suolo} giorni): ${raccomandazione.temperatura_rilevata}°C.`
      : "",
    raccomandazione.percentuale_ombra > 0
      ? `\n\nOmbra stimata sul prato: circa ${raccomandazione.percentuale_ombra}%.`
      : "",
    bloccato
      ? "\n\nNon seminare finché il suolo non supera stabilmente gli 8°C: rischi marciumi e spreco di seme."
      : "",
  ]
    .join("")
    .slice(0, 950);

  return {
    tipo_intervento: raccomandazione.tipo_intervento || intervento.titolo,
    macro_categoria: "Semente",
    spiegazione_semplice,
    nota_scelta_prodotti:
      raccomandazione.prodotti_raccomandati.length > 1
        ? "Scegli un solo mix di seme tra le opzioni: non mescolare confezioni diverse nello stesso giorno."
        : raccomandazione.prodotti_raccomandati.length === 1
          ? "Dose calcolata sui metri quadri del tuo prato."
          : bloccato
            ? "Nessun prodotto consigliato finché il suolo resta troppo freddo."
            : null,
    razionale_scientifico:
      "La semina segue la temperatura del terreno, non il mese di calendario: germinazione e radicazione dipendono dal calore nel primi centimetri di suolo.",
    prodotti_consigliati: raccomandazione.prodotti_raccomandati,
    raccomandazione_semina: raccomandazione,
    contesto_meteo: {
      temperatura_suolo_media_c: raccomandazione.temperatura_rilevata,
      percentuale_ombra: ombraPct,
      status_semina: raccomandazione.status_semina,
      essenza: raccomandazione.essenza,
    },
  };
}
