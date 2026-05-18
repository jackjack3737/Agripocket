/** Statistiche esagono prato (0–100), stile radar PES. */

export const PRATO_STAT_AXES = [
  { key: "idratazione", label: "Idratazione" },
  { key: "nutrizione", label: "Nutrizione" },
  { key: "copertura", label: "Copertura" },
  { key: "salute_fogliare", label: "Salute fogliare" },
  { key: "difesa", label: "Difesa" },
  { key: "manutenzione", label: "Manutenzione" },
];

const STATO_MAP = { ottimo: 90, buono: 76, discreto: 54, critico: 28 };

const CATEGORIE = {
  idratazione: ["irrigazione", "umettante"],
  nutrizione: ["concime", "biostimolante"],
  copertura: ["rinnovo"],
  difesa: ["trattamento", "diserbo"],
  manutenzione: ["taglio", "arieggiatura", "pulizia"],
};

const PRIORITA_PENALTY = { alta: 22, media: 14, bassa: 7 };

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function oggiIso() {
  return new Date().toISOString().slice(0, 10);
}

function giorniTra(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const a = new Date(fromIso + "T12:00:00").getTime();
  const b = new Date(toIso + "T12:00:00").getTime();
  return Math.floor((b - a) / 86400000);
}

function testoProblemi(vision) {
  return (vision?.problemi_rilevati || [])
    .map((p) => `${p?.problema || ""} ${p?.dettaglio || ""}`.toLowerCase())
    .join(" ");
}

function gravitaAltaCount(vision) {
  return (vision?.problemi_rilevati || []).filter((p) => p?.gravita === "alta").length;
}

/** Problemi strutturati che devono penalizzare (evita falsi positivi su testo libero). */
function problemiSignificativi(vision) {
  return (vision?.problemi_rilevati || []).filter((p) => p?.gravita === "alta" || p?.gravita === "media");
}

function testoProblemiSignificativi(vision) {
  return problemiSignificativi(vision)
    .map((p) => `${p?.problema || ""} ${p?.dettaglio || ""}`.toLowerCase())
    .join(" ");
}

function isVisionEccellente(vision) {
  if (!vision) return false;
  const stato = vision.stato_generale;
  if (stato === "critico" || stato === "discreto") return false;
  if (gravitaAltaCount(vision) > 0) return false;
  const medie = problemiSignificativi(vision).filter((p) => p.gravita === "media").length;
  if (stato === "ottimo" && medie > 1) return false;
  if (stato === "buono" && medie > 2) return false;
  if (vision.stress_idrici?.segni) return false;
  if (vision.foglie_debris?.eccesso_foglie) return false;
  if (vision.taglio?.giudizio === "troppo_basso") return false;
  if ((vision.malattie_sospette || []).length > 0 && stato !== "ottimo") return false;
  return stato === "ottimo" || stato === "buono";
}

/** Pavimento minimo sulla media quando la visione descrive un prato sano (evita 62 su prati belli). */
function minMediaDaStatoVision(vision) {
  if (!vision) return null;
  if (gravitaAltaCount(vision) > 0) return null;
  const medie = problemiSignificativi(vision).filter((p) => p.gravita === "media").length;
  const stato = vision.stato_generale;
  if (stato === "ottimo") return 84;
  if (stato === "buono" && medie <= 1) return 74;
  if (stato === "buono" && medie <= 2) return 70;
  if (stato === "discreto" && medie === 0) return 58;
  return null;
}

/** Per l'esagono: solo lavori urgenti reali, non tutto il calendario stagionale/catalogo. */
function interventiPerStatoRadar(interventi) {
  return interventi.filter((i) => {
    if (i.fonte === "controllo_mensile") return false;
    if (i.priorita === "bassa") return false;
    const titolo = String(i.titolo || "");
    if (titolo.startsWith("Catalogo —")) return false;
    return true;
  });
}

function visionFreshness(createdAt) {
  if (!createdAt) return 0;
  const days = giorniTra(new Date(createdAt).toISOString().slice(0, 10), oggiIso());
  if (days <= 7) return 0.62;
  if (days <= 21) return 0.48;
  if (days <= 45) return 0.32;
  if (days <= 90) return 0.18;
  return 0.1;
}

function scoreFromVision(vision) {
  if (!vision || typeof vision !== "object") return null;

  if (isVisionEccellente(vision)) {
    const top = vision.stato_generale === "ottimo" ? 94 : 88;
    const feltro = vision.feltro_thatch?.presente ? 4 : 0;
    return {
      idratazione: top - 2,
      nutrizione: top - 1,
      copertura: top,
      salute_fogliare: top - 1 - feltro,
      difesa: top - 3,
      manutenzione: top - 2 - feltro,
    };
  }

  const base = STATO_MAP[vision.stato_generale] ?? 58;
  const soloBasse =
    problemiSignificativi(vision).length === 0 &&
    (vision.problemi_rilevati || []).every((p) => p?.gravita === "bassa" || !p?.gravita);
  const baseBoost =
    vision.stato_generale === "ottimo" ? 8 : vision.stato_generale === "buono" && soloBasse ? 6 : 0;
  const problems = testoProblemiSignificativi(vision);
  const alta = gravitaAltaCount(vision);
  const mal = (vision.malattie_sospette || []).length;
  const erbe = (vision.erbette_infestanti || []).length;

  let idratazione = base + baseBoost;
  if (vision.stress_idrici?.segni) idratazione -= 28;
  if (/sicc|secc|arid|stress idr|disidr/.test(problems)) idratazione -= 12;

  let nutrizione = base + baseBoost;
  if (/giall|cloros|carenza|clorosi/.test(problems)) nutrizione -= 18;
  if (/debole|sposs/.test(problems)) nutrizione -= 10;

  let copertura = base + baseBoost;
  if (/calv|dirad|patch|vuot|ralo|sparse|bassa dens/.test(problems)) copertura -= 22;
  if (erbe > 3) copertura -= 8;

  let salute_fogliare = base + baseBoost;
  if (vision.taglio?.giudizio === "troppo_basso") salute_fogliare -= 15;
  if (vision.taglio?.giudizio === "troppo_alto") salute_fogliare -= 8;
  if (vision.feltro_thatch?.presente) salute_fogliare -= vision.stato_generale === "ottimo" ? 4 : 10;
  if (vision.foglie_debris?.eccesso_foglie) salute_fogliare -= 8;
  if (/necros|macchl|fungh|patolog/.test(problems)) salute_fogliare -= 14;

  let difesa = vision.stato_generale === "ottimo" ? 90 : 82;
  difesa -= alta * 12 + mal * 14 + Math.max(0, erbe - 2) * 6;
  if (/parassit|insett|afid|larv|marcium/.test(problems)) difesa -= 15;

  let manutenzione = base;
  if (vision.taglio?.giudizio === "troppo_basso") manutenzione -= 18;
  if (vision.taglio?.giudizio === "troppo_alto") manutenzione -= 10;
  if (vision.feltro_thatch?.presente) manutenzione -= 14;
  if (vision.foglie_debris?.eccesso_foglie) manutenzione -= 12;
  if (/thatch|feltro|scarific|ariegg/.test(problems)) manutenzione -= 8;

  return {
    idratazione: clamp(idratazione),
    nutrizione: clamp(nutrizione),
    copertura: clamp(copertura),
    salute_fogliare: clamp(salute_fogliare),
    difesa: clamp(difesa),
    manutenzione: clamp(manutenzione),
  };
}

function scoreFromInterventi(interventi, categorie, oggi) {
  const relevant = interventi.filter((i) => categorie.includes(i.categoria));
  if (!relevant.length) return null;

  let score = 82;
  let counted = 0;
  let penalita = 0;

  for (const i of relevant) {
    if (!i.data_prevista) continue;
    const scadenza = i.data_prevista;
    const late = giorniTra(scadenza, oggi);

    if (i.stato === "completato") {
      counted += 1;
      if (late >= 0 && late <= 21) score += 4;
      else if (late < 0) score += 2;
      continue;
    }

    if (i.stato !== "pianificato") continue;

    if (late < 0) continue;
    if (i.priorita !== "alta" && late <= 7) continue;

    counted += 1;
    const pen = PRIORITA_PENALTY[i.priorita] ?? 12;
    const mult = 1 + Math.min(late, 14) / 21;
    penalita += pen * mult * (i.priorita === "alta" ? 1 : 0.45);
  }

  if (!counted) return null;
  return clamp(score - penalita);
}

function scoreManutenzioneInterventi(interventi, oggi) {
  const cats = CATEGORIE.manutenzione;
  const taglio = interventi.filter((i) => i.categoria === "taglio");
  const altri = interventi.filter((i) =>
    cats.includes(i.categoria) && i.categoria !== "taglio"
  );

  const sTaglio = scoreFromInterventi(taglio, ["taglio"], oggi);
  const sAltri = scoreFromInterventi(altri, ["arieggiatura", "pulizia"], oggi);

  if (sTaglio == null && sAltri == null) return null;
  if (sTaglio == null) return sAltri;
  if (sAltri == null) return sTaglio;
  return clamp(sTaglio * 0.55 + sAltri * 0.45);
}

function scoreFromInterventiAll(interventi, oggi) {
  const out = {};
  for (const key of Object.keys(CATEGORIE)) {
    if (key === "manutenzione") {
      out[key] = scoreManutenzioneInterventi(interventi, oggi);
    } else {
      out[key] = scoreFromInterventi(interventi, CATEGORIE[key], oggi);
    }
  }
  return out;
}

function scoreFromWeather(weather) {
  if (!weather?.current?.main) return null;
  const h = weather.current.main.humidity;
  const t = weather.current.main.temp;
  let idratazione = 68;
  if (h >= 65) idratazione += 12;
  else if (h >= 45) idratazione += 4;
  else if (h < 35) idratazione -= 14;

  if (t > 30) idratazione -= 10;
  if (t > 33) idratazione -= 8;

  const rainy = weather.history?.rainyDays ?? 0;
  if (rainy >= 2) idratazione += 8;
  if (rainy === 0 && t > 26) idratazione -= 6;

  const advice = (weather.advice?.status || "").toLowerCase();
  if (/sicc|irriga|acqua|stress/.test(advice)) idratazione -= 12;
  if (/ottim|buon|favorev/.test(advice)) idratazione += 6;

  return { idratazione: clamp(idratazione) };
}

function mergeAxis(visionVal, interventiVal, weatherVal, { vWeight, defaultVal = 52, visionEccellente = false }) {
  const parts = [];
  const weights = [];

  const visionAlta = visionVal != null && visionVal >= 78;
  const visionW = Math.min(
    0.9,
    visionEccellente ? Math.max(vWeight, 0.85) : visionAlta ? Math.max(vWeight, 0.72) : vWeight,
  );
  const interventiW =
    interventiVal != null
      ? visionVal != null
        ? visionEccellente
          ? 0.08
          : visionAlta
            ? 0.12
            : Math.min(0.28, 1 - visionW * 0.4)
        : 0.85
      : 0;
  const weatherW = weatherVal != null ? (visionEccellente ? 0.08 : 0.18) : 0;

  if (visionVal != null) {
    parts.push(visionVal);
    weights.push(visionW);
  }
  if (interventiVal != null && interventiW > 0) {
    parts.push(interventiVal);
    weights.push(interventiW);
  }
  if (weatherVal != null && weatherW > 0) {
    parts.push(weatherVal);
    weights.push(weatherW);
  }

  if (!parts.length) return defaultVal;

  const totalW = weights.reduce((a, b) => a + b, 0);
  const sum = parts.reduce((acc, val, i) => acc + val * weights[i], 0);
  return clamp(sum / totalW);
}

/**
 * @param {{ interventi?: object[], analisi?: { vision_json?: object, created_at?: string } | null, weather?: object | null }} input
 */
export function computePratoStats({ interventi = [], analisi = null, weather = null } = {}) {
  const oggi = oggiIso();
  const vision = analisi?.vision_json;
  const vWeight = visionFreshness(analisi?.created_at);
  const visionEccellente = isVisionEccellente(vision);
  const fromVision = scoreFromVision(vision);
  const radarInterventi = interventiPerStatoRadar(interventi);
  const fromInterventi = scoreFromInterventiAll(radarInterventi, oggi);
  const fromWeather = scoreFromWeather(weather);

  const stats = {};
  const sources = {};

  for (const { key } of PRATO_STAT_AXES) {
    stats[key] = mergeAxis(
      fromVision?.[key] ?? null,
      fromInterventi[key] ?? null,
      key === "idratazione" ? fromWeather?.idratazione ?? null : null,
      { vWeight, defaultVal: 52, visionEccellente }
    );
    sources[key] = {
      vision: fromVision?.[key] ?? null,
      interventi: fromInterventi[key] ?? null,
      meteo: key === "idratazione" ? fromWeather?.idratazione ?? null : null,
    };
  }

  let values = Object.values(stats);
  let media = clamp(values.reduce((a, b) => a + b, 0) / values.length);

  const mediaFloor = minMediaDaStatoVision(vision);
  if (mediaFloor != null && media < mediaFloor) {
    const boost = mediaFloor - media;
    for (const { key } of PRATO_STAT_AXES) {
      stats[key] = clamp(stats[key] + boost);
    }
    values = Object.values(stats);
    media = clamp(values.reduce((a, b) => a + b, 0) / values.length);
  }

  const insights = buildAllAxisInsights({
    stats,
    sources,
    vision,
    interventi,
    weather,
    oggi,
    hasVision: !!fromVision,
    visionAge: analisi?.created_at,
    freshness: vWeight,
  });

  return {
    stats,
    media,
    sources,
    insights,
    hasVision: !!fromVision,
    hasInterventi: interventi.length > 0,
    visionAge: analisi?.created_at ?? null,
    freshness: vWeight,
  };
}

function lavoriApertiPerCategorie(interventi, categorie, oggi) {
  return interventi.filter(
    (i) =>
      i.stato === "pianificato" &&
      categorie.includes(i.categoria) &&
      i.data_prevista &&
      i.data_prevista <= oggi,
  );
}

function livello(score) {
  if (score >= 75) return "buono";
  if (score >= 55) return "discreto";
  return "basso";
}

/**
 * @returns {{ score: number, perche: string[], migliora: string[] }}
 */
export function buildAxisInsight(key, ctx) {
  const { stats, sources, vision, interventi, weather, oggi, hasVision, visionAge, freshness } = ctx;
  const score = stats[key] ?? 50;
  const perche = [];
  const migliora = [];
  const lv = livello(score);

  if (!hasVision && !interventi.length) {
    perche.push("Valore stimato: manca una foto recente e pochi dati in calendario.");
    migliora.push("Carica una foto del prato e completa i lavori in agenda.");
    return { score, perche, migliora };
  }

  if (sources[key]?.vision != null) {
    perche.push(`Ultima foto: indicatore ~${sources[key].vision}/100.`);
  }
  if (sources[key]?.interventi != null) {
    perche.push(
      `Adempienza calendario: ~${sources[key].interventi}/100 (solo lavori urgenti; non penalizza tutto il piano stagionale).`,
    );
  }
  if (hasVision && isVisionEccellente(vision) && sources[key]?.vision != null) {
    perche.push("Foto: prato in ottime condizioni — il punteggio principale viene dall'analisi visiva.");
  }
  if (key === "idratazione" && sources[key]?.meteo != null) {
    perche.push(`Meteo attuale: ~${sources[key].meteo}/100 (umidità e temperature).`);
  }

  if (visionAge) {
    const giorni = giorniTra(new Date(visionAge).toISOString().slice(0, 10), oggi);
    if (giorni > 30) perche.push(`Foto di ${giorni} giorni fa — aggiorna con controllo mensile.`);
    else if (freshness < 0.35) perche.push("Foto non recentissima: peso ridotto sull'analisi visiva.");
  }

  const problems = testoProblemi(vision);

  if (key === "idratazione") {
    if (vision?.stress_idrici?.segni) perche.push("Segni di stress idrico nella foto.");
    if (weather?.advice?.status) perche.push(`Meteo: ${weather.advice.status}.`);
    if (lv === "basso") {
      migliora.push("Irriga in modo regolare al mattino; valuta agente umettante in estate.");
      if (lavoriApertiPerCategorie(interventi, ["irrigazione", "umettante"], oggi).length) {
        migliora.push("Completa irrigazione/umettante in scadenza nel calendario.");
      }
    } else migliora.push("Mantieni irrigazione costante; evita ristagni.");
  }

  if (key === "nutrizione") {
    if (/giall|cloros|carenza|clorosi/.test(problems)) perche.push("Possibile carenza nutrizionale visibile.");
    if (lv === "basso") {
      migliora.push("Programma concimazione (NPK / microelementi) nei periodi indicati.");
      if (lavoriApertiPerCategorie(interventi, ["concime", "biostimolante"], oggi).length) {
        migliora.push("Esegui concimi o biostimolanti in agenda.");
      }
    } else migliora.push("Continua concimazioni di mantenimento secondo calendario.");
  }

  if (key === "copertura") {
    if (/calv|dirad|patch|vuot|ralo/.test(problems)) perche.push("Zone diradate o calve in foto.");
    if (lv === "basso") migliora.push("Valuta rinnovo/overseeding e concimi di ripresa.");
    else migliora.push("Monitora zone rade; semina chirurgica se necessario.");
  }

  if (key === "salute_fogliare") {
    if (vision?.feltro_thatch?.presente) perche.push("Feltro/thatch rilevato.");
    if (vision?.foglie_debris?.eccesso_foglie) perche.push("Troppo detrito fogliare.");
    if (/necros|macchl|fungh/.test(problems)) perche.push("Segni fogliari o sospetto patogeno.");
    if (lv === "basso") migliora.push("Arieggiatura leggera, raccolta foglie, eventuale fungicida se confermato.");
    else migliora.push("Mantieni taglio corretto e pulizia superficie.");
  }

  if (key === "difesa") {
    if ((vision?.malattie_sospette || []).length) perche.push("Malattie sospette in analisi.");
    if ((vision?.erbette_infestanti || []).length) perche.push("Erbette infestanti segnalate.");
    if (/larv|popillia|insett|parassit/.test(problems)) perche.push("Rischio parassiti/larve (es. popillia).");
    if (lv === "basso") {
      migliora.push("Valuta trattamento fitosanitario mirato (es. Fly per larve sotto prato).");
      if (lavoriApertiPerCategorie(interventi, ["trattamento", "diserbo"], oggi).length) {
        migliora.push("Completa trattamenti in scadenza.");
      }
    } else migliora.push("Monitoraggio mensile con foto; intervieni solo se compaiono danni.");
  }

  if (key === "manutenzione") {
    if (vision?.taglio?.giudizio === "troppo_basso") perche.push("Taglio troppo basso.");
    if (vision?.taglio?.giudizio === "troppo_alto") perche.push("Erba troppo alta al taglio.");
    if (lv === "basso") {
      migliora.push("Riprendi tagli regolari, scarifica/arieggia se c'è feltro.");
      if (lavoriApertiPerCategorie(interventi, ["taglio", "arieggiatura", "pulizia"], oggi).length) {
        migliora.push("Spunta taglio e pulizia in calendario.");
      }
    } else migliora.push("Mantieni frequenza taglio e scarifica stagionale.");
  }

  if (!migliora.length) {
    migliora.push(lv === "buono" ? "Ottimo livello: continua così." : "Segui il calendario per stabilizzare il valore.");
  }

  return { score, perche, migliora };
}

function buildAllAxisInsights(ctx) {
  const out = {};
  for (const { key } of PRATO_STAT_AXES) {
    out[key] = buildAxisInsight(key, ctx);
  }
  return out;
}

export function labelStatoPrato(media) {
  if (media >= 80) return "Ottimo";
  if (media >= 66) return "Buono";
  if (media >= 50) return "Discreto";
  if (media >= 36) return "Da recuperare";
  return "Critico";
}
