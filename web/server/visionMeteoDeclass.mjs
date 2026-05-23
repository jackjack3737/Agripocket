/**
 * Declassamento diagnosi fungine quando lo storico meteo non supporta patogeni
 * (falsi positivi Vision → stress idrico / dry spot).
 */

import { fetchWeatherBundle } from "./weatherCore.mjs";

const FUNGHI_PATTERN =
  /fungh|fungin|oidio|marcium|patogen|micod|dollar\s*spot|pythium|rhizoctonia|fusarium|microdochium|red\s*thread|fairy\s*ring|ciambella/i;

const NOTA_DECLASS =
  "L'intelligenza visiva ha rilevato macchie simili a una patologia, ma incrociando i dati meteo della tua zona (bassa umidità recente), è altamente probabile che si tratti di stress idrico localizzato (Dry Spot). Prova ad aumentare l'irrigazione in questa zona prima di usare fungicidi.";

export function visionIndicaPatologiaFungina(vision) {
  if (!vision || typeof vision !== "object") return false;

  const mal = (vision.malattie_sospette || []).filter((m) => {
    const g = String(m?.gravita || "").toLowerCase();
    return g === "alta" || g === "media";
  });
  if (mal.length) return true;

  const prob = (vision.problemi_rilevati || []).some(
    (p) =>
      FUNGHI_PATTERN.test(`${p?.problema || ""} ${p?.dettaglio || ""}`) &&
      ["alta", "media"].includes(String(p?.gravita || "").toLowerCase()),
  );
  if (prob) return true;

  const blob = `${vision.sintesi_visiva || ""} ${vision.diagnosi_avanzata || ""}`;
  if (FUNGHI_PATTERN.test(blob) && !/stress\s*idric|secchezza|dry\s*spot/i.test(blob)) {
    return true;
  }

  if (
    vision.pattern_geometrico === "circolare" &&
    vision.danno_localizzato &&
    /fungh|patogen|marcium|oidio|spot/i.test(blob)
  ) {
    return true;
  }

  return false;
}

function hourIsNight(isoTime) {
  const h = new Date(isoTime).getHours();
  return h >= 22 || h < 6;
}

/**
 * @param {{ hourly?: { time?: string[], relative_humidity_2m?: number[], temperature_2m?: number[] }, daily?: { time?: string[], precipitation_sum?: number[], temperature_2m_max?: number[] } }} data
 */
export function analizzaStoricoMeteoFungino(data, giorni = 5) {
  const times = data?.hourly?.time || [];
  const rh = data?.hourly?.relative_humidity_2m || [];
  const temps = data?.hourly?.temperature_2m || [];

  const nightRh = [];
  for (let i = 0; i < times.length; i++) {
    if (!hourIsNight(times[i])) continue;
    const v = rh[i];
    if (v != null && Number.isFinite(v)) nightRh.push(v);
  }

  const dailyTimes = data?.daily?.time || [];
  const precip = data?.daily?.precipitation_sum || [];
  const tMax = data?.daily?.temperature_2m_max || [];
  const sliceStart = Math.max(0, dailyTimes.length - giorni);

  let precipTot = 0;
  let tMaxSum = 0;
  let tMaxN = 0;
  for (let i = sliceStart; i < dailyTimes.length; i++) {
    precipTot += Number(precip[i]) || 0;
    if (tMax[i] != null) {
      tMaxSum += Number(tMax[i]);
      tMaxN += 1;
    }
  }

  const umiditaNotturnaMedia =
    nightRh.length > 0 ? nightRh.reduce((a, b) => a + b, 0) / nightRh.length : null;
  const tMaxMedia = tMaxN > 0 ? tMaxSum / tMaxN : null;

  return {
    umidita_notturna_media: umiditaNotturnaMedia != null ? Math.round(umiditaNotturnaMedia) : null,
    precipitazioni_mm: Math.round(precipTot * 10) / 10,
    temperatura_max_media: tMaxMedia != null ? Math.round(tMaxMedia * 10) / 10 : null,
    campioni_notturni: nightRh.length,
  };
}

export function valutaDeclassamentoStressIdrico(vision, meteoStats) {
  if (!visionIndicaPatologiaFungina(vision)) {
    return { declassare: false, motivo: null };
  }

  const rh = meteoStats?.umidita_notturna_media;
  const pioggia = meteoStats?.precipitazioni_mm ?? 0;
  const tMax = meteoStats?.temperatura_max_media;

  const umiditaBassa = rh != null && rh < 60;
  const siccitaCalda = pioggia <= 0.5 && tMax != null && tMax >= 24;

  if (umiditaBassa || siccitaCalda) {
    const parti = [];
    if (umiditaBassa) parti.push(`umidità notturna media ${rh}% (< 60%)`);
    if (siccitaCalda) parti.push(`pioggia ${pioggia} mm e Tmax media ${tMax}°C`);
    return {
      declassare: true,
      motivo: `Condizioni sfavorevoli ai funghi negli ultimi giorni: ${parti.join("; ")}.`,
    };
  }

  return { declassare: false, motivo: null };
}

export function declassaVisionFunginoStressIdrico(vision, meteoStats, motivo) {
  const out = { ...vision };
  out.diagnosi_originale_vision = {
    malattie_sospette: vision.malattie_sospette,
    sintesi_visiva: vision.sintesi_visiva,
    diagnosi_avanzata: vision.diagnosi_avanzata,
  };
  out.declassamento_meteo = {
    da: "patologia_fungina",
    a: "stress_idrico",
    motivo: motivo || NOTA_DECLASS,
    meteo: meteoStats,
  };

  out.malattie_sospette = [];
  out.stress_idrici = {
    segni: true,
    note: "Macchie circolari o necrosi localizzate compatibili con dry spot / stress idrico in assenza di umidità fogliare prolungata.",
  };
  out.problemi_rilevati = [
    {
      problema: "Sospetto stress idrico localizzato (Dry Spot)",
      gravita: "media",
      dettaglio:
        "Incrocio meteo: condizioni recenti poco favorevoli a patogeni fungini. Priorità irrigazione mirata sulla zona.",
    },
    ...(vision.problemi_rilevati || []).filter((p) => !FUNGHI_PATTERN.test(`${p?.problema} ${p?.dettaglio}`)),
  ].slice(0, 4);

  const baseSintesi = String(vision.sintesi_visiva || "").trim();
  out.sintesi_visiva = baseSintesi
    ? `${baseSintesi} Diagnosi rivista con storico meteo locale: probabile stress idrico, non fungo attivo.`
    : "Segni visivi simili a una malattia, ma il meteo recente indica più probabile stress idrico localizzato.";

  out.diagnosi_avanzata = [motivo || NOTA_DECLASS, vision.diagnosi_avanzata]
    .filter(Boolean)
    .join(" ")
    .slice(0, 900);

  if (out.punteggi_assi && typeof out.punteggi_assi === "object") {
    out.punteggi_assi = {
      ...out.punteggi_assi,
      idratazione: Math.max(0, Math.min(100, (out.punteggi_assi.idratazione ?? 70) - 12)),
      difesa: Math.max(0, Math.min(100, (out.punteggi_assi.difesa ?? 70) + 5)),
    };
  }

  out.patologia_confermata = { nome: "", confidenza: "bassa" };
  return out;
}

export async function fetchMeteoStoricoPerDiagnosi(localita, opts = {}) {
  const lat = Number(opts.lat);
  const lon = Number(opts.lon ?? opts.lng);
  const bundle = await fetchWeatherBundle(localita, null, {
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
  });
  const geo = bundle?.geo;
  if (!geo?.lat || !geo?.lon) throw new Error("Geocoding meteo fallito");

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    `&hourly=relative_humidity_2m,temperature_2m` +
    `&daily=temperature_2m_max,precipitation_sum` +
    `&past_days=7&forecast_days=0&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo storico: ${res.status}`);
  const data = await res.json();
  return { geo, raw: data, stats: analizzaStoricoMeteoFungino(data) };
}

export async function applicaDeclassamentoFunginoMeteo(vision, profilo) {
  if (!visionIndicaPatologiaFungina(vision) || !profilo?.localita?.trim()) {
    return { vision, declassato: false };
  }

  try {
    const { stats } = await fetchMeteoStoricoPerDiagnosi(profilo.localita, {
      lat: profilo.lat,
      lon: profilo.lon,
    });
    const val = valutaDeclassamentoStressIdrico(vision, stats);
    if (!val.declassare) return { vision, declassato: false, meteo: stats };

    return {
      vision: declassaVisionFunginoStressIdrico(vision, stats, val.motivo),
      declassato: true,
      meteo: stats,
      notaReport: NOTA_DECLASS,
    };
  } catch (e) {
    console.warn("[vision-meteo-declass]", e.message);
    return { vision, declassato: false, errore: e.message };
  }
}

export { NOTA_DECLASS };
