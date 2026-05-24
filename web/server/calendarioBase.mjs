/**
 * Calendario base Solum — istanziazione deterministica da template DB + delta meteo.
 */

import { normalizzaLivelloImpegno } from "./livelloImpegno.mjs";
import { CLIMA_MENSILE_BY_ZONA } from "./scripts/seed_calendario_base.mjs";
import { INTERVENTI_NORD_PIANURA } from "./scripts/data/interventi_nord_pianura.mjs";

export const ZONE_CLIMATICHE = [
  "nord_pianura",
  "centro_tirrenico",
  "sud_isole_arido",
  "alpino_appenninico",
];

const GDD_PRIMAVERA_SOGLIA = 0.15;
const ET0_PICCO_SOGLIA = 1.15;

/** Livelli inclusi per query template (greenkeeper → base + pro + greenkeeper). */
export function livelliImpegnoPerQuery(livello) {
  const L = normalizzaLivelloImpegno(livello);
  if (L === "greenkeeper") return ["base", "pro", "greenkeeper"];
  if (L === "pro") return ["base", "pro"];
  return ["base"];
}

/**
 * Macro-zona climatica da coordinate WGS84 (Italia).
 * @returns {string} zona_climatica
 */
export function mapZonaClimaticaFromCoords(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "nord_pianura";

  // Sicilia, Sardegna, estremo meridione peninsulare
  if (lat < 41.2) return "sud_isole_arido";
  if (lat < 41.8 && lon < 13.2) return "sud_isole_arido";

  // Alpi occidentali / orientali (banda montana nord)
  if (lat >= 45.8 && lon <= 11.8) return "alpino_appenninico";
  if (lat >= 46.0) return "alpino_appenninico";

  // Appennino centrale (banda altitudine media, lon interno)
  if (lat >= 42.0 && lat < 44.8 && lon >= 12.2 && lon <= 14.2) {
    return "alpino_appenninico";
  }

  // Pianura padana e Nord-Est
  if (lat >= 44.0 && lon >= 7.0 && lon <= 12.8) return "nord_pianura";

  // Centro tirrenico
  if (lat >= 41.5 && lat < 44.5) return "centro_tirrenico";

  return lat >= 44 ? "nord_pianura" : "centro_tirrenico";
}

/** Coordinate da profilo, zona default o bundle meteo. */
export function resolveCoordinateProfilo(profiloUtente, meteoBundle) {
  const lat =
    Number(profiloUtente?.lat) ||
    Number(profiloUtente?.coordinate_gps?.lat) ||
    Number(meteoBundle?.geo?.lat);
  const lon =
    Number(profiloUtente?.lng ?? profiloUtente?.lon) ||
    Number(profiloUtente?.coordinate_gps?.lon ?? profiloUtente?.coordinate_gps?.lng) ||
    Number(meteoBundle?.geo?.lon);
  return { lat, lon };
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dataDaTemplate(anno, mese, giornoMese) {
  const giorno = Math.min(Math.max(1, giornoMese), 28);
  const m = String(mese).padStart(2, "0");
  const g = String(giorno).padStart(2, "0");
  return `${anno}-${m}-${g}`;
}

function filtraTemplateMemoria(zona, livelli, uso) {
  if (zona !== "nord_pianura") return [];
  const usoNorm = String(uso || "*").toLowerCase();
  return INTERVENTI_NORD_PIANURA.filter((t) => {
    if (!livelli.includes(t.livello_impegno)) return false;
    const tu = String(t.uso || "*").toLowerCase();
    if (tu !== "*" && usoNorm !== "*" && tu !== usoNorm) return false;
    return true;
  });
}

/** Carica template da Supabase; fallback in-memory nord_pianura. */
export async function caricaTemplateCalendario(admin, { zona, livelli, uso = "*" }) {
  const usoNorm = String(uso || "*").toLowerCase();

  if (admin) {
    const { data, error } = await admin
      .from("calendario_base_intervento")
      .select("*")
      .eq("zona_climatica", zona)
      .eq("attivo", true)
      .in("livello_impegno", livelli)
      .order("ordine", { ascending: true });

    if (error) throw new Error(`Template calendario: ${error.message}`);

    const filtered = (data ?? []).filter((row) => {
      const u = String(row.uso || "*").toLowerCase();
      return u === "*" || usoNorm === "*" || u === usoNorm;
    });

    if (filtered.length) return filtered;
  }

  const mem = filtraTemplateMemoria(zona, livelli, uso);
  if (mem.length) return mem;

  if (zona !== "nord_pianura") {
    return filtraTemplateMemoria("nord_pianura", livelli, uso).map((t) => ({
      ...t,
      _proxy_zona: zona,
    }));
  }

  return [];
}

/** Carica climatologia mensile; fallback seed locale. */
export async function caricaClimaNormale(admin, zona) {
  if (admin) {
    const { data, error } = await admin
      .from("clima_mese_normale")
      .select("*")
      .eq("zona_climatica", zona)
      .order("mese", { ascending: true });

    if (error) throw new Error(`Clima normale: ${error.message}`);
    if (data?.length) return data;
  }

  const seed = CLIMA_MENSILE_BY_ZONA[zona];
  if (!seed) return [];
  return seed.map((r) => ({ zona_climatica: zona, ...r }));
}

function gddPrimaveraDaSerie(serie) {
  return (serie ?? [])
    .filter((r) => {
      const m = new Date(`${r.date}T12:00:00`).getMonth() + 1;
      return m === 3 || m === 4;
    })
    .reduce((s, r) => s + (Number(r.gdd_day) || 0), 0);
}

function gddPrimaveraNormale(climaNormale) {
  return (climaNormale ?? [])
    .filter((c) => c.mese === 3 || c.mese === 4)
    .reduce((s, c) => s + Number(c.gdd_mese || 0), 0);
}

function et0NormaleEstate(climaNormale) {
  const est = (climaNormale ?? []).filter((c) => c.mese >= 6 && c.mese <= 8);
  if (!est.length) return null;
  return est.reduce((s, c) => s + Number(c.et0_mm_giorno || 0), 0) / est.length;
}

/**
 * Confronto meteo live vs anno normale.
 * @returns {{ gdd_primavera_live, gdd_primavera_normale, gdd_primavera_delta_pct, et0_live, et0_normale_estate, et0_picco_estivo, shift_primavera_giorni }}
 */
export function calcolaDeltaMeteo(meteoBundle, climaNormale) {
  const agronomic = meteoBundle?.agronomic;
  const serie = agronomic?.gdd?.serie ?? [];

  const gdd_primavera_live = gddPrimaveraDaSerie(serie);
  const gdd_primavera_normale = gddPrimaveraNormale(climaNormale);

  let gdd_primavera_delta_pct = 0;
  if (gdd_primavera_normale > 0 && gdd_primavera_live > 0) {
    gdd_primavera_delta_pct = (gdd_primavera_live - gdd_primavera_normale) / gdd_primavera_normale;
  } else if (agronomic?.gdd?.cumul_30g > 0 && gdd_primavera_normale > 0) {
    const proxy = Number(agronomic.gdd.cumul_30g) * 0.55;
    gdd_primavera_delta_pct = (proxy - gdd_primavera_normale) / gdd_primavera_normale;
  }

  const et0_live =
    agronomic?.et0_mm_oggi ??
    agronomic?.et0_mm_media_7g ??
    null;
  const et0_normale_estate = et0NormaleEstate(climaNormale);
  const et0_picco_estivo =
    et0_live != null &&
    et0_normale_estate != null &&
    et0_live >= et0_normale_estate * ET0_PICCO_SOGLIA;

  let shift_primavera_giorni = 0;
  if (gdd_primavera_delta_pct > GDD_PRIMAVERA_SOGLIA) {
    const eccesso = gdd_primavera_delta_pct - GDD_PRIMAVERA_SOGLIA;
    shift_primavera_giorni = -Math.min(14, Math.max(3, Math.round(eccesso * 21)));
  }

  return {
    gdd_primavera_live: Math.round(gdd_primavera_live * 10) / 10,
    gdd_primavera_normale,
    gdd_primavera_delta_pct: Math.round(gdd_primavera_delta_pct * 1000) / 1000,
    et0_live,
    et0_normale_estate: et0_normale_estate != null ? Math.round(et0_normale_estate * 100) / 100 : null,
    et0_picco_estivo,
    shift_primavera_giorni,
    soil_temperature_c: agronomic?.soil_temperature_10cm_c ?? null,
  };
}

function isInterventoStressOssidativo(row) {
  const blob = [
    row.titolo,
    row.fabbisogno_fisiologico,
    ...(row.esigenze_molecolari || []),
  ]
    .join(" ")
    .toLowerCase();
  return /gaba|prolina|stress ossidativo|osmoprotez|trehalosio|et0|vpd/.test(blob);
}

function normalizzaTemplateRow(row) {
  return {
    id: row.id ?? null,
    zona_climatica: row.zona_climatica,
    livello_impegno: row.livello_impegno,
    mese: row.mese,
    giorno_mese: row.giorno_mese,
    categoria: row.categoria,
    priorita: row.priorita || "media",
    titolo: row.titolo,
    fabbisogno_fisiologico: row.fabbisogno_fisiologico,
    esigenze_molecolari: Array.isArray(row.esigenze_molecolari) ? row.esigenze_molecolari : [],
    macro_categoria: row.macro_categoria ?? null,
    finestra_shift_giorni: row.finestra_shift_giorni ?? 7,
    ordine: row.ordine ?? 100,
    _proxy_zona: row._proxy_zona ?? null,
  };
}

function istanziaIntervento(template, anno, delta) {
  const t = normalizzaTemplateRow(template);
  const dataTemplate = dataDaTemplate(anno, t.mese, t.giorno_mese);
  let shift = 0;
  const note = [];

  if ((t.mese === 3 || t.mese === 4) && delta.shift_primavera_giorni < 0) {
    const maxShift = Math.min(Math.abs(delta.shift_primavera_giorni), t.finestra_shift_giorni);
    shift = -maxShift;
    if (shift !== 0) {
      note.push(
        `GDD primaverili +${Math.round(delta.gdd_primavera_delta_pct * 100)}% vs anno normale: anticipo di ${Math.abs(shift)} giorni (max finestra ±${t.finestra_shift_giorni} g).`,
      );
    }
  }

  if (delta.et0_picco_estivo && isInterventoStressOssidativo(t)) {
    note.push(
      `ET0 in picco (${delta.et0_live} mm/g vs norma estate ${delta.et0_normale_estate} mm/g): elevata priorità mitigazione stress ossidativo.`,
    );
  }

  if (t._proxy_zona) {
    note.push(
      `Template proxy da nord_pianura (seed dedicato per ${t._proxy_zona} non ancora disponibile).`,
    );
  }

  const data_prevista = addDays(dataTemplate, shift);
  let priorita = t.priorita;
  if (delta.et0_picco_estivo && isInterventoStressOssidativo(t) && priorita !== "alta") {
    priorita = "alta";
  }

  return {
    template_id: t.id,
    zona_climatica: t.zona_climatica,
    livello_impegno_template: t.livello_impegno,
    titolo: t.titolo,
    fabbisogno_fisiologico: t.fabbisogno_fisiologico,
    esigenze_molecolari: t.esigenze_molecolari,
    categoria: t.categoria,
    priorita,
    macro_categoria: t.macro_categoria,
    mese: t.mese,
    giorno_mese_template: t.giorno_mese,
    data_template: dataTemplate,
    data_prevista,
    shift_giorni_applicati: shift,
    adattamento_dinamico: note.length ? note.join(" ") : null,
    ordine: t.ordine,
    fonte: "calendario_base",
  };
}

/**
 * Motore deterministico: template DB + date assolute + adattamento meteo.
 * @param {object} profiloUtente
 * @param {object|null} meteoBundle — output fetchWeatherBundle
 * @param {{ admin?: object, anno?: number }} [opts]
 */
export async function generaCalendarioDeterministico(profiloUtente, meteoBundle, opts = {}) {
  const admin = opts.admin ?? null;
  const anno = opts.anno ?? new Date().getFullYear();
  const oggi = new Date().toISOString().slice(0, 10);

  const { lat, lon } = resolveCoordinateProfilo(profiloUtente, meteoBundle);
  const zona_climatica = mapZonaClimaticaFromCoords(lat, lon);
  const livello_impegno = normalizzaLivelloImpegno(profiloUtente?.livello_impegno);
  const livelli = livelliImpegnoPerQuery(livello_impegno);
  const uso = profiloUtente?.uso ?? "*";

  const [templates, climaNormale] = await Promise.all([
    caricaTemplateCalendario(admin, { zona: zona_climatica, livelli, uso }),
    caricaClimaNormale(admin, zona_climatica),
  ]);

  const delta_meteo = calcolaDeltaMeteo(meteoBundle, climaNormale);

  let interventi = templates
    .map((t) => istanziaIntervento(t, anno, delta_meteo))
    .sort(
      (a, b) =>
        a.data_prevista.localeCompare(b.data_prevista) ||
        (a.ordine ?? 0) - (b.ordine ?? 0),
    );

  const fineAnno = `${anno}-12-31`;
  interventi = interventi.filter((i) => i.data_prevista >= oggi && i.data_prevista <= fineAnno);

  return {
    zona_climatica,
    livello_impegno,
    livelli_inclusi: livelli,
    anno,
    coordinate: Number.isFinite(lat) ? { lat, lon } : null,
    delta_meteo,
    clima_normale_mesi: climaNormale.length,
    template_count: templates.length,
    interventi,
  };
}
