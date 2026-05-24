/**
 * Motore irrigazione — bilancio idrico a serbatoio (ET0 × Kc − pioggia utile) → minuti per linea centralina.
 */

import {
  normalizzaInputIrrigazione,
  upgradePendenzaUnLivello,
} from "./irrigazioneInput.mjs";
import {
  IRRIGATOR_MODES,
  normalizeIrrigatorModalita,
  normalizeLineaCentralina,
  normalizePratoZone,
} from "./pratoZone.mjs";
import { kcPerData, recuperaParametriRag } from "./ragParametriAgronomici.mjs";

function modalitaToTipoCentralina(modalita) {
  if (modalita === "rotator") return "testine_rotator";
  if (modalita === "dinamico") return "dinamici";
  return "statici";
}

export const KC_PRATO = 0.75;
const COEFF_OMBRA_ALTA = 0.7;
const SOGLIA_OMBRA_ALTA = 50;
const SOGLIA_MINUTI_CYCLE_SOAK = 15;
const PAUSA_TRA_CICLI_MIN = 45;
const MAD_FRAZIONE = 0.5;

const PLUVIOMETRIA_MM_H = {
  statici: 35,
  dinamici: 12,
  testine_rotator: 15,
  ala_gocciolante: 20,
};

const GIORNI_BREVI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

/** Capacità di campo indicativa (mm acqua utile nel profilo radici). */
export function capacitaCampoMm(tipo_terreno) {
  if (tipo_terreno === "argilloso") return 20;
  if (tipo_terreno === "sabbioso") return 8;
  return 14;
}

/** Kc stagionale per prato da giardino (Italia). */
export function kcStagionale(dataRef = new Date()) {
  const m = new Date(dataRef).getMonth() + 1;
  if (m >= 6 && m <= 8) return 0.82;
  if ((m >= 3 && m <= 5) || m === 9 || m === 10) return 0.65;
  return 0.58;
}

export function pluviometriaMmOra(tipo_irrigatori, pluviometriaManuale) {
  const man = Number(pluviometriaManuale);
  if (Number.isFinite(man) && man > 0) return man;
  return PLUVIOMETRIA_MM_H[tipo_irrigatori] ?? PLUVIOMETRIA_MM_H.dinamici;
}

/** Riduzione ET da % area in ombra (poligoni mappa o profilo). */
export function modificatoreOmbra(percentuale_ombra) {
  const pct = Math.min(100, Math.max(0, Number(percentuale_ombra) || 0));
  if (pct <= 0) return 1;
  if (pct >= 75) return 0.65;
  return 1 - (pct / 75) * 0.35;
}

/** Riduzione mm per linea se parte delle teste è dentro poligoni ombra. */
export function modificatoreMmLinea(frazioneTesteInOmbra) {
  const f = Math.min(1, Math.max(0, Number(frazioneTesteInOmbra) || 0));
  return 1 - f * 0.35;
}

export function minutiDaFabbisogno(fabbisogno_mm, pluviometria_mm_ora) {
  if (fabbisogno_mm == null || fabbisogno_mm <= 0) return 0;
  const pluv = Math.max(1, Number(pluviometria_mm_ora) || 12);
  return Math.max(0, Math.round((fabbisogno_mm / pluv) * 60));
}

/** Pioggia che entra nel suolo senza superare la capacità di campo. */
export function pioggiaEfficaceMm(precip_mm, bilancioSuoloMm, cap) {
  const spazio = Math.max(0, cap - bilancioSuoloMm);
  return Math.min(Number(precip_mm || 0) * 0.85, spazio);
}

/** Avanza il bilancio suolo di un giorno (ETc, pioggia, eventuale ricarica a MAD). */
export function avanzaSuoloGiorno(suolo, { et0_mm, precip_mm }, cap, mad, kc, modOmbra, { simulaIrrigazionePassata = true } = {}) {
  const et0 = Number(et0_mm ?? 3);
  const precip = Number(precip_mm ?? 0);
  const etc = et0 * kc * modOmbra;

  let s = Number(suolo);
  s -= etc;
  s += pioggiaEfficaceMm(precip, s, cap);
  s = Math.min(Math.max(s, 0), cap);

  if (precip >= 8) return s;
  if (simulaIrrigazionePassata && s <= mad) return cap;
  return s;
}

/** Ultimi N giorni prima di oggi (per ricostruire il serbatoio, non resettare al 75%). */
export function giorniStoriciMeteo(weatherBundle, meteo, giorniIndietro = 6) {
  const ag = weatherBundle?.agronomic;
  const rows = ag?.gdd?.serie || ag?.forecast_daily || [];
  const byDate = new Map();
  for (const r of rows) {
    if (r?.date) byDate.set(r.date, r);
  }

  const oggiIso = new Date().toISOString().slice(0, 10);
  const out = [];
  for (let i = giorniIndietro; i >= 1; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (iso >= oggiIso) continue;
    const row = byDate.get(iso) || {};
    out.push({
      iso,
      et0_mm: row.et0_mm ?? row.et0 ?? meteo?.et0_mm ?? ag?.et0_mm_media_7g ?? 3,
      precip_mm: row.rain_mm ?? row.precipitation_sum ?? row.precip_mm ?? 0,
    });
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

/**
 * Suolo iniziale oggi: ricostruito dai giorni passati (non sempre 75% fisso).
 */
export function ricostruisciSuoloIniziale(weatherBundle, meteo, input, kc, percentuale_ombra, giorniIndietro = 6) {
  const cap = capacitaCampoMm(input.tipo_terreno);
  const mad = cap * MAD_FRAZIONE;
  const modOmbra = modificatoreOmbra(percentuale_ombra);
  let suolo = cap * 0.82;

  const storici = giorniStoriciMeteo(weatherBundle, meteo, giorniIndietro);
  for (const g of storici) {
    suolo = avanzaSuoloGiorno(suolo, g, cap, mad, kc, modOmbra, { simulaIrrigazionePassata: true });
  }
  return Math.round(suolo * 10) / 10;
}

/**
 * Bilancio suolo su più giorni (serbatoio). Restituisce mm da reintegrare oggi e schema 7 gg.
 */
export function simulaBilancioIdricoSettimana({
  giorniForecast,
  input,
  kc,
  percentuale_ombra,
  weatherBundle = null,
  meteo = null,
}) {
  const cap = capacitaCampoMm(input.tipo_terreno);
  const mad = cap * MAD_FRAZIONE;
  const modOmbra = modificatoreOmbra(percentuale_ombra);
  const suoloInizialeOggi =
    weatherBundle && meteo
      ? ricostruisciSuoloIniziale(weatherBundle, meteo, input, kc, percentuale_ombra)
      : cap * 0.82;
  let suolo = suoloInizialeOggi;

  const schemaGiorni = [];

  for (const giorno of giorniForecast) {
    const et0 = Number(giorno.et0_mm ?? 3);
    const precip = Number(giorno.precip_mm ?? 0);
    const etc = et0 * kc * modOmbra;

    suolo -= etc;
    const pioggiaUtile = pioggiaEfficaceMm(precip, suolo, cap);
    suolo += pioggiaUtile;
    suolo = Math.min(Math.max(suolo, 0), cap);

    const statoFineGiorno = Math.round(suolo * 10) / 10;

    let irriga = false;
    let mm_necessari = 0;

    if (precip >= 8) {
      irriga = false;
    } else if (suolo <= mad) {
      irriga = true;
      mm_necessari = Math.round((cap - suolo) * 10) / 10;
      suolo = cap;
    }

    schemaGiorni.push({
      iso: giorno.iso,
      nome: giorno.nome,
      et0_mm: Math.round(et0 * 10) / 10,
      precip_mm: Math.round(precip * 10) / 10,
      etc_mm: Math.round(etc * 10) / 10,
      stato_suolo_mm: statoFineGiorno,
      irriga,
      mm_necessari,
    });
  }

  const oggi = schemaGiorni[0];
  const fabbisogno_oggi_mm = oggi?.irriga ? oggi.mm_necessari : 0;
  const saturazione = (oggi?.precip_mm ?? 0) >= 8 || (oggi && !oggi.irriga && oggi.stato_suolo_mm >= cap * 0.9);

  const statoSuoloMm = oggi?.stato_suolo_mm ?? suolo;
  const livelloPct = Math.min(100, Math.max(0, Math.round((statoSuoloMm / cap) * 100)));
  const mmMancanti =
    fabbisogno_oggi_mm > 0
      ? fabbisogno_oggi_mm
      : Math.max(0, Math.round((mad - statoSuoloMm) * 10) / 10);

  return {
    fabbisogno_oggi_mm,
    saturazione_suolo: saturazione,
    capacita_campo_mm: cap,
    mad_mm: Math.round(mad * 10) / 10,
    stato_suolo_mm: statoSuoloMm,
    livello_serbatoio_pct: livelloPct,
    mm_mancanti_oggi: Math.round(mmMancanti * 10) / 10,
    schema_giorni: schemaGiorni,
    suolo_iniziale_oggi_mm: weatherBundle ? suoloInizialeOggi : null,
  };
}

/** Etichetta UX per dashboard (serbatoio % e mm da reintegrare). */
export function riepilogoSerbatoioUx(bilancio) {
  if (!bilancio) return null;
  const pct = bilancio.livello_serbatoio_pct ?? 0;
  const mm = bilancio.mm_mancanti_oggi ?? 0;
  const fab = bilancio.fabbisogno_oggi_mm ?? 0;
  const sat = bilancio.saturazione_suolo;
  const mad = bilancio.mad_mm ?? 0;
  const statoMm = bilancio.stato_suolo_mm ?? 0;
  let stato = `Serbatoio al ${pct}%`;
  if (sat) {
    stato += " · suolo saturo (pioggia)";
  } else if (fab > 0) {
    stato += ` · irriga ${fab} mm (sotto soglia ${mad} mm)`;
  } else if (mm > 0) {
    stato += ` · mancano ${mm} mm alla soglia`;
  } else if (statoMm <= mad + 1.5) {
    stato += " · vicino alla soglia di stress";
  } else {
    stato += " · nessun deficit oggi";
  }
  return { stato, pct, mm, sat };
}

function forecast7Giorni(weatherBundle, meteo) {
  const ag = weatherBundle?.agronomic;
  const forecastRows = ag?.forecast_daily || ag?.gdd?.serie || [];
  const byDate = new Map();
  for (const r of forecastRows) {
    if (r?.date) byDate.set(r.date, r);
  }

  const oggiDate = new Date();
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(oggiDate);
    d.setDate(oggiDate.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const row = byDate.get(iso) || {};
    const rowEt0 = row.et0_mm ?? row.et0 ?? null;
    let et0Day = rowEt0 ?? (i === 0 ? meteo.et0_mm : null) ?? ag?.et0_mm_media_7g ?? 3;
    if (i === 0 && meteo.et0_mm != null && rowEt0 != null) {
      et0Day = Math.max(Number(meteo.et0_mm), Number(rowEt0));
    } else if (i === 0 && meteo.et0_mm != null) {
      et0Day = Number(meteo.et0_mm);
    }
    out.push({
      iso,
      nome: GIORNI_BREVI[d.getDay()],
      et0_mm: et0Day,
      precip_mm: row.rain_mm ?? row.precipitation_sum ?? row.precip_mm ?? 0,
    });
  }
  return out;
}

/**
 * Estrae ET0 e precipitazioni dal bundle meteo.
 */
export function estraiMeteoIrrigazione(weatherBundle) {
  const ag = weatherBundle?.agronomic;
  const rows =
    ag?.forecast_daily ||
    weatherBundle?.history?.rows ||
    ag?.gdd?.serie ||
    [];

  const byDate = new Map();
  for (const r of rows) {
    if (!r?.date) continue;
    byDate.set(r.date, {
      et0_mm: r.et0_mm ?? r.et0 ?? null,
      precip_mm: r.rainMm ?? r.rain_mm ?? r.precipitation_sum ?? 0,
    });
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const oggiRow = byDate.get(oggi) || {};
  const ieriRow = byDate.get(ieri) || {};

  const et0_oggi = ag?.et0_mm_oggi ?? oggiRow.et0_mm ?? ag?.et0_mm_media_7g ?? null;
  const et0_ieri = ieriRow.et0_mm ?? et0_oggi;
  const precip_oggi = Number(oggiRow.precip_mm ?? 0);
  const precip_ieri = Number(ieriRow.precip_mm ?? 0);

  const main = weatherBundle?.current?.weather?.[0]?.main;
  const pioggia_in_corso = main === "Rain" || main === "Drizzle" || main === "Thunderstorm";

  return {
    et0_mm: et0_oggi != null ? Number(et0_oggi) : null,
    et0_mm_ieri: et0_ieri != null ? Number(et0_ieri) : null,
    precipitazioni_mm: Math.round((precip_oggi + precip_ieri * 0.3) * 10) / 10,
    precip_oggi_mm: precip_oggi,
    precip_ieri_mm: precip_ieri,
    pioggia_in_corso,
    fonte: weatherBundle?.provider || "open-meteo",
  };
}

/** Impronta meteo al momento del calcolo (per alert cambio previsioni). */
export function snapshotMeteoIrrigazione(weatherBundle, meteo) {
  const ag = weatherBundle?.agronomic;
  const rows = ag?.forecast_daily || [];
  let precip3g = 0;
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    precip3g += Number(rows[i]?.rain_mm ?? rows[i]?.precipitation_sum ?? 0);
  }
  return {
    et0_mm: meteo?.et0_mm ?? null,
    precip_oggi_mm: meteo?.precip_oggi_mm ?? 0,
    precip_prossimi_3gg_mm: Math.round(precip3g * 10) / 10,
    pioggia_in_corso: !!meteo?.pioggia_in_corso,
    et0_media_7g: ag?.et0_mm_media_7g ?? null,
  };
}

/** @deprecated Usare bilancio a serbatoio; mantenuto per test. */
export function calcolaFabbisognoMm(et0_mm, precipitazioni_mm, percentuale_ombra, kc = KC_PRATO) {
  if (et0_mm == null || Number.isNaN(et0_mm)) return null;
  const modOmbra = modificatoreOmbra(percentuale_ombra);
  const fabbisogno = et0_mm * kc * modOmbra - (Number(precipitazioni_mm) || 0);
  return Math.round(fabbisogno * 100) / 100;
}

export function calcolaCicli({ minuti_totali, tipo_terreno, pendenza }) {
  const argilloso = tipo_terreno === "argilloso";
  const pendenzaAlta = pendenza === "forte" || pendenza === "media";

  if (tipo_terreno === "sabbioso" && minuti_totali > 10) {
    return {
      cicli_consigliati: 1,
      minuti_per_ciclo: Math.min(minuti_totali, 12),
      pausa_tra_cicli_min: null,
      frazionamento_settimanale: true,
      nota_tecnica:
        "Terreno sabbioso: meglio irrigare meno minuti ma più spesso nella settimana.",
    };
  }

  if ((argilloso || pendenzaAlta) && minuti_totali > SOGLIA_MINUTI_CYCLE_SOAK) {
    const cicli = minuti_totali <= 25 ? 2 : 3;
    const minuti_per_ciclo = Math.max(4, Math.ceil(minuti_totali / cicli));
    return {
      cicli_consigliati: cicli,
      minuti_per_ciclo,
      pausa_tra_cicli_min: PAUSA_TRA_CICLI_MIN,
      frazionamento_settimanale: false,
      nota_tecnica: "Suolo compatto o pendenza: più passate brevi con pausa anti-ruscellamento.",
    };
  }

  return {
    cicli_consigliati: 1,
    minuti_per_ciclo: minuti_totali,
    pausa_tra_cicli_min: null,
    frazionamento_settimanale: false,
    nota_tecnica: null,
  };
}

function determinaAzione(fabbisogno_mm, minuti_totali, tempo_base, ctx) {
  if (ctx.pioggia_in_corso || ctx.saturazione_suolo) return "SPEGNI";
  if (fabbisogno_mm == null || fabbisogno_mm <= 0 || minuti_totali <= 0) return "SPEGNI";
  if (ctx.irrigazione_profilo === "pioggia" && fabbisogno_mm < 0.5) return "SPEGNI";

  const base = Math.max(1, tempo_base);
  if (minuti_totali > base * 1.15) return "AUMENTA";
  if (minuti_totali < base * 0.6) return "DIMINUISCI";
  return "IRRIGA";
}

function generaMessaggioUx({
  azione,
  input,
  meteo,
  fabbisogno_mm,
  minuti_totali,
  cicli,
  kc,
  bilancio,
}) {
  const mappa = input.contesto_mappa;
  if (azione === "SPEGNI") {
    if (bilancio?.saturazione_suolo) {
      return "Il suolo è già saturo (pioggia recente o capacità di campo raggiunta): tieni la centralina spenta per evitare ristagni e funghi.";
    }
    if (meteo.pioggia_in_corso) {
      return "Oggi piove: la natura irriga al posto tuo. Spegni la centralina e riaccendi solo se il prato non si rialza al mattino.";
    }
    return "Nessun deficit idrico oggi: il bilancio a serbatoio non richiede irrigazione.";
  }

  const parti = [
    `Oggi il prato deve reintegrare circa ${fabbisogno_mm} mm di acqua (Kc stagionale ${kc}, ET0 ${meteo.et0_mm ?? "—"} mm).`,
    `Imposta la centralina su circa ${minuti_totali} minuti totali per linea (in base al tipo di irrigatori), preferibilmente tra le 6:00 e le 8:00.`,
  ];

  if (cicli.cicli_consigliati > 1) {
    parti.push(
      `Su terreno ${input.tipo_terreno === "argilloso" ? "argilloso" : "lento"} o in pendenza: ${cicli.cicli_consigliati} partenze da ${cicli.minuti_per_ciclo} min con pausa di ${cicli.pausa_tra_cicli_min ?? 45} min.`,
    );
  }

  if (input.tempo_irrigazione_base && minuti_totali > input.tempo_irrigazione_base * 1.15) {
    parti.push(`È più dei tuoi ${input.tempo_irrigazione_base} min abituali: aumenta leggermente il tempo in centralina.`);
  } else if (input.tempo_irrigazione_base && minuti_totali < input.tempo_irrigazione_base * 0.6) {
    parti.push(`È meno dei tuoi ${input.tempo_irrigazione_base} min abituali: puoi ridurre oggi.`);
  }

  if (mappa?.ha_zone_ombra && input.percentuale_ombra > 0) {
    parti.push(
      `Zone in ombra in mappa (~${input.percentuale_ombra}% del prato): fabbisogno ridotto; le linee con getti in ombra hanno minuti ancora più bassi.`,
    );
  }
  if (mappa?.ha_pendenza_mappa) {
    parti.push(
      `Pendenze segnate in mappa: sulle linee vicino alle frecce di discesa sono consigliati cicli brevi con pausa (anti-ruscellamento).`,
    );
  }

  return parti.join(" ").slice(0, 980);
}

/**
 * Schema settimanale con accumulo deficit (serbatoio).
 */
export function calcolaSchemaSettimanale({
  weatherBundle,
  input,
  meteo,
  fabbisogno_mm,
  minuti_totali,
  cicli,
  azione,
  kc = KC_PRATO,
  pluv_riferimento = 20,
}) {
  const forecast = forecast7Giorni(weatherBundle, meteo);
  const bilancio = simulaBilancioIdricoSettimana({
    giorniForecast: forecast,
    input,
    kc,
    percentuale_ombra: input.percentuale_ombra,
    weatherBundle,
    meteo,
  });

  const schemaGiorni = bilancio.schema_giorni.map((g) => {
    if (!g.irriga) {
      const nota =
        g.precip_mm >= 8 ? "Pioggia" : g.iso === forecast[0]?.iso && azione === "SPEGNI" ? "Oggi no" : "Riposo";
      return {
        ...g,
        minuti: 0,
        passate: 0,
        nota,
        fabbisogno_mm: 0,
      };
    }
    const min = minutiDaFabbisogno(g.mm_necessari, pluv_riferimento);
    const cicl = calcolaCicli({
      minuti_totali: min,
      tipo_terreno: input.tipo_terreno,
      pendenza: input.pendenza,
    });
    return {
      ...g,
      fabbisogno_mm: g.mm_necessari,
      minuti: cicl.minuti_per_ciclo,
      passate: cicl.cicli_consigliati,
      nota:
        cicl.cicli_consigliati > 1
          ? `${g.mm_necessari} mm · ${cicl.cicli_consigliati}×${cicl.minuti_per_ciclo} min`
          : `${g.mm_necessari} mm · ${min} min`,
    };
  });

  const passateSettimana = schemaGiorni.filter((g) => g.irriga).length;
  const giorniIrrigui = schemaGiorni.filter((g) => g.irriga);
  let intervallo = 1;
  if (passateSettimana >= 5) intervallo = 1;
  else if (passateSettimana >= 3) intervallo = 2;
  else if (passateSettimana >= 1) intervallo = 3;
  else intervallo = 0;

  const frequenzaLabel =
    intervallo === 0
      ? "Nessuna passata"
      : intervallo === 1
        ? "Quando il suolo scende sotto soglia (spesso ogni giorno in estate)"
        : `Circa ogni ${intervallo} giorni (deficit accumulato)`;

  const minutiMedi =
    giorniIrrigui.length > 0
      ? Math.round(giorniIrrigui.reduce((s, g) => s + (g.minuti || 0) * (g.passate || 1), 0) / giorniIrrigui.length)
      : 0;

  const impostazione_centralina =
    passateSettimana === 0
      ? "Centralina spenta: pioggia o suolo saturo nella settimana prevista."
      : `Programma a deficit: irriga solo nei giorni indicati in griglia, con i mm indicati (non un tempo fisso «ogni N giorni» se il suolo è ancora umido).`;

  const riepilogo_ux = [
    passateSettimana === 0
      ? "Settimana senza irrigazione necessaria: serbatoio idrico coperto da pioggia o ET0 bassa."
      : `${passateSettimana} giorn${passateSettimana === 1 ? "o" : "i"} con irrigazione — recupero deficit fino a ${bilancio.capacita_campo_mm} mm nel suolo.`,
    giorniIrrigui[0]?.mm_necessari
      ? `Prossima passata tipica: ~${giorniIrrigui[0].mm_necessari} mm (~${minutiMedi} min con impianto di riferimento).`
      : null,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 520);

  return {
    frequenza: {
      intervallo_giorni: intervallo || 1,
      label: frequenzaLabel,
      passate_settimana: passateSettimana,
      minuti_per_passata: minutiMedi,
      cicli_per_giorno_irriguo: cicli.cicli_consigliati || 1,
    },
    giorni: schemaGiorni,
    riepilogo_ux,
    impostazione_centralina,
    oggi_irriga: schemaGiorni[0]?.irriga ?? false,
    bilancio_serbatoio: {
      capacita_campo_mm: bilancio.capacita_campo_mm,
      mad_mm: bilancio.mad_mm,
      stato_suolo_mm: bilancio.stato_suolo_mm,
      livello_serbatoio_pct: bilancio.livello_serbatoio_pct,
      mm_mancanti_oggi: bilancio.mm_mancanti_oggi,
      fabbisogno_oggi_mm: bilancio.fabbisogno_oggi_mm,
      saturazione_suolo: bilancio.saturazione_suolo,
    },
    meteo_fonte: meteo.fonte || weatherBundle?.provider || "open-meteo",
  };
}

/** Una riga programma centralina per uscita (`linea`), anche se più uscite sono tutte statiche. */
function modalitaProgrammaLinea(teste) {
  const counts = new Map();
  for (const t of teste) {
    const m = t.modalita || "statico";
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  let best = "statico";
  let max = 0;
  for (const [m, n] of counts) {
    if (n > max) {
      max = n;
      best = m;
    }
  }
  return best;
}

function raggruppaLineeIdrauliche(heads) {
  const byLinea = new Map();
  for (const h of heads) {
    const n = normalizeLineaCentralina(h.linea) ?? 1;
    if (!byLinea.has(n)) byLinea.set(n, []);
    byLinea.get(n).push(h);
  }
  return [...byLinea.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([linea_numero, teste]) => ({
      linea_numero,
      modalita: modalitaProgrammaLinea(teste),
      teste,
      tipi_misti: new Set(teste.map((t) => t.modalita)).size > 1,
    }));
}

/** Linee centralina dalla mappa (null se nessun irrigatore). */
export function lineeIdraulicheDaProfilo(profilo) {
  const { zone } = normalizePratoZone(profilo?.prato_zone);
  const heads = zone
    .filter((z) => z.tipo === "irrigatore")
    .map((z) => ({ ...z, modalita: normalizeIrrigatorModalita(z.modalita) }));
  if (!heads.length) return null;
  return raggruppaLineeIdrauliche(heads);
}

function formatMinutiLineaSettimana({ cicli, minuti_per_ciclo, minuti_totali }) {
  if (cicli > 1) return `${cicli}×${minuti_per_ciclo} min`;
  const m = minuti_totali ?? minuti_per_ciclo ?? 0;
  return m > 0 ? `${m} min` : "OFF";
}

function notaGiornoIrriguo(mm, lineeGiorno, fallbackMin, fallbackCicli) {
  const mmStr = `${mm} mm`;
  if (!lineeGiorno?.length) {
    if (fallbackCicli > 1) return `${mmStr} · ${fallbackCicli}×${fallbackMin} min`;
    return `${mmStr} · ${fallbackMin} min`;
  }
  if (lineeGiorno.length === 1) {
    return `${mmStr} · ${formatMinutiLineaSettimana(lineeGiorno[0])}`;
  }
  const mins = lineeGiorno.map((l) => l.minuti_totali ?? l.minuti_per_ciclo ?? 0);
  const allSame = mins.every((m) => m === mins[0]) && lineeGiorno.every((l) => l.cicli === lineeGiorno[0].cicli);
  if (allSame && lineeGiorno[0].cicli <= 1) {
    return `${mmStr} · ${formatMinutiLineaSettimana(lineeGiorno[0])}`;
  }
  return mmStr;
}

/**
 * Minuti/cicli per una uscita centralina e un fabbisogno mm del giorno.
 */
export function calcolaProgrammaLineaIdraulica(
  linea,
  { mm, input, azione, irriga = true, testeById = {} },
) {
  const tipo = modalitaToTipoCentralina(linea.modalita);
  const pluv = pluviometriaMmOra(tipo);
  const nTeste = linea.teste.length;

  const fracOmbra =
    nTeste > 0
      ? linea.teste.reduce((s, t) => s + (testeById[t.id]?.peso_ombra ?? 0), 0) / nTeste
      : 0;
  const modLinea = modificatoreMmLinea(fracOmbra);
  const mmLinea = Math.round(Math.max(0, Number(mm) || 0) * modLinea * 10) / 10;

  const vicinoPendenza = linea.teste.some((t) => testeById[t.id]?.vicino_pendenza);
  const pendenzaLinea = vicinoPendenza
    ? upgradePendenzaUnLivello(input.pendenza)
    : input.pendenza;

  let minutiTotaliLinea = 0;
  if (irriga && azione !== "SPEGNI" && mmLinea > 0) {
    minutiTotaliLinea = minutiDaFabbisogno(mmLinea, pluv);
  }

  const cicliZona = calcolaCicli({
    minuti_totali: minutiTotaliLinea,
    tipo_terreno: input.tipo_terreno,
    pendenza: pendenzaLinea,
  });

  let cicli = azione === "SPEGNI" ? 0 : cicliZona.cicli_consigliati;
  let minutiPerCiclo = azione === "SPEGNI" ? 0 : cicliZona.minuti_per_ciclo;
  if (linea.modalita === "dinamico" && minutiTotaliLinea > 0 && minutiTotaliLinea <= 50) {
    cicli = 1;
    minutiPerCiclo = minutiTotaliLinea;
  }

  return {
    zona_numero: linea.linea_numero,
    modalita: linea.modalita,
    mm_da_evadere: mmLinea,
    minuti_per_ciclo: minutiPerCiclo,
    cicli,
    minuti_totali_linea: minutiTotaliLinea,
  };
}

/** Aggiunge `linee[]` per giorno irriguo nella griglia settimanale (minuti per uscita). */
export function arricchisciSchemaSettimanalePerLinee(schema, profilo, input, azione) {
  if (!schema?.giorni?.length) return schema;

  const linee = lineeIdraulicheDaProfilo(profilo);
  if (!linee?.length) {
    schema.per_linea = false;
    return schema;
  }

  const testeById = input.contesto_mappa?.teste_by_id || {};
  const irrigaGlobale = azione !== "SPEGNI";

  schema.per_linea = linee.length > 1;
  schema.giorni = schema.giorni.map((g) => {
    if (!g.irriga) return { ...g, linee: [] };

    const mm = g.mm_necessari ?? g.fabbisogno_mm ?? 0;
    const lineeGiorno = linee.map((linea) => {
      const z = calcolaProgrammaLineaIdraulica(linea, {
        mm,
        input,
        azione,
        irriga: irrigaGlobale,
        testeById,
      });
      return {
        n: z.zona_numero,
        minuti_totali: z.minuti_totali_linea,
        cicli: z.cicli,
        minuti_per_ciclo: z.minuti_per_ciclo,
        modalita: z.modalita,
      };
    });

    return {
      ...g,
      linee: lineeGiorno,
      nota: notaGiornoIrriguo(mm, lineeGiorno, g.minuti, g.passate),
    };
  });

  const primoIrriguo = schema.giorni.find((g) => g.irriga && g.linee?.length);
  if (primoIrriguo?.linee?.length > 1 && schema.riepilogo_ux) {
    const dettaglio = primoIrriguo.linee
      .map((l) => `L${l.n} ~${formatMinutiLineaSettimana(l)}`)
      .join(", ");
    schema.riepilogo_ux = schema.riepilogo_ux.replace(
      /\(~[\d]+ min con impianto di riferimento\)/,
      `(per linea: ${dettaglio})`,
    );
    if (!schema.riepilogo_ux.includes("per linea:")) {
      schema.riepilogo_ux = `${schema.riepilogo_ux} Minuti per uscita: ${dettaglio}.`.slice(0, 520);
    }
  }

  return schema;
}

/**
 * Programma per linea centralina (non dividere mm per numero teste).
 */
export function calcolaProgrammaZoneCentralina(
  profilo,
  { mm_target, azione, schema_settimanale, input },
) {
  const linee = lineeIdraulicheDaProfilo(profilo);
  if (!linee?.length) return null;
  const freq = schema_settimanale?.frequenza;
  const frequenzaLabel = freq?.label ?? "A deficit (vedi griglia settimanale)";
  const giorniAttivi = (schema_settimanale?.giorni || []).filter((g) => g.irriga).map((g) => g.nome);
  const oggiIrriga = schema_settimanale?.oggi_irriga !== false && azione !== "SPEGNI";
  const orario = "06:30";
  const mm = Math.max(0, Number(mm_target) || 0);
  const testeById = input.contesto_mappa?.teste_by_id || {};

  const zoneOut = linee.map((linea) => {
    const nTeste = linea.teste.length;
    const inOmbra = linea.teste.filter((t) => (testeById[t.id]?.peso_ombra ?? 0) >= 0.99).length;
    const inMezzombra = linea.teste.filter((t) => testeById[t.id]?.in_mezzombra).length;
    const vicinoPendenza = linea.teste.some((t) => testeById[t.id]?.vicino_pendenza);
    const pendenzaLinea = vicinoPendenza
      ? upgradePendenzaUnLivello(input.pendenza)
      : input.pendenza;

    const calc = calcolaProgrammaLineaIdraulica(linea, {
      mm,
      input,
      azione,
      irriga: oggiIrriga,
      testeById,
    });
    const {
      mm_da_evadere: mmLinea,
      minuti_per_ciclo: minutiPerCiclo,
      cicli,
      minuti_totali_linea: minutiTotaliLinea,
    } = calc;
    const tipo = modalitaToTipoCentralina(linea.modalita);
    const pluv = pluviometriaMmOra(tipo);
    const modeLabel = IRRIGATOR_MODES[linea.modalita]?.label || linea.modalita;
    const cicliZona =
      cicli > 1
        ? { pausa_tra_cicli_min: PAUSA_TRA_CICLI_MIN }
        : { pausa_tra_cicli_min: null };

    const etichetta = `Linea ${linea.linea_numero} · ${modeLabel}${nTeste > 1 ? ` (${nTeste} teste)` : ""}`;

    let impostazione;
    if (azione === "SPEGNI" || minutiTotaliLinea === 0) {
      impostazione = `${etichetta}: OFF oggi.`;
    } else if (cicli > 1) {
      impostazione = `${etichetta}: reintegrare ${mmLinea} mm → ${cicli} partenze × ${minutiPerCiclo} min (totale ${minutiTotaliLinea} min), ore ${orario}. ${frequenzaLabel}.`;
    } else {
      impostazione = `${etichetta}: reintegrare ${mmLinea} mm → ${minutiPerCiclo} min, ore ${orario}. ${frequenzaLabel}.`;
    }

    return {
      zona_numero: linea.linea_numero,
      linea_idraulica: linea.modalita,
      etichetta,
      modalita: linea.modalita,
      tipo_irrigatore: tipo,
      pluviometria_mm_h: pluv,
      numero_teste: nTeste,
      teste_ids: linea.teste.map((t) => t.id),
      mm_da_evadere: mmLinea,
      mm_base_prato: mm,
      teste_in_ombra: inOmbra,
      pendenza_linea: pendenzaLinea,
      minuti_per_ciclo: minutiPerCiclo,
      cicli,
      minuti_totali_linea: minutiTotaliLinea,
      minuti_totali_zona: minutiTotaliLinea,
      pausa_tra_cicli_min: cicli > 1 ? cicliZona.pausa_tra_cicli_min : null,
      frequenza_label: frequenzaLabel,
      giorni_settimana: giorniAttivi,
      orario_consigliato: orario,
      attiva_oggi: oggiIrriga && minutiTotaliLinea > 0,
      impostazione,
      nota: [
        nTeste > 1
          ? "Più teste sulla stessa uscita: un solo programma in centralina, minuti per l'intera elettrovalvola."
          : null,
        linea.tipi_misti
          ? "Tipi diversi sulla stessa uscita: minuti calcolati sul tipo più frequente in mappa."
          : null,
        inOmbra > 0
          ? `${inOmbra}/${nTeste} teste in piena ombra: mm ridotti.`
          : inMezzombra > 0
            ? `${inMezzombra}/${nTeste} teste in mezz'ombra: mm leggermente ridotti.`
            : null,
        vicinoPendenza ? "Vicino a pendenza in mappa: cicli brevi con pausa consigliati." : null,
      ]
        .filter(Boolean)
        .join(" ")
        || null,
    };
  });

  return {
    numero_zone: zoneOut.length,
    numero_teste_mappa: linee.reduce((s, l) => s + l.teste.length, 0),
    zone: zoneOut,
    minuti_totali_zone: zoneOut.reduce((s, z) => s + z.minuti_totali_linea, 0),
    sintesi:
      linee.length === 1
        ? "Una linea in mappa: imposta un solo programma in centralina con i minuti sotto."
        : `${linee.length} uscite centralina (linee ${linee.map((l) => l.linea_numero).join(", ")}): ognuna con i propri minuti per reintegrare ${mm} mm (anche se più linee sono tutte statiche).`,
    ordine_centralina: zoneOut.map((z) => ({
      uscita: z.zona_numero,
      etichetta: z.etichetta,
      modalita: z.modalita,
    })),
    usa_programma_per_zona: true,
  };
}

export function calcolaIrrigazioneGiornaliera(profilo, weatherBundle, opts = {}) {
  const input = normalizzaInputIrrigazione(profilo);
  const meteo = estraiMeteoIrrigazione(weatherBundle);
  const kc = opts.kc ?? kcStagionale();

  const forecast = forecast7Giorni(weatherBundle, meteo);
  const bilancio = simulaBilancioIdricoSettimana({
    giorniForecast: forecast,
    input,
    kc,
    percentuale_ombra: input.percentuale_ombra,
    weatherBundle,
    meteo,
  });

  const fabbisogno_mm = bilancio.fabbisogno_oggi_mm;
  const pluv = pluviometriaMmOra(input.tipo_irrigatori, opts.pluviometria_mm_ora);
  let minuti_totali = fabbisogno_mm > 0 ? minutiDaFabbisogno(fabbisogno_mm, pluv) : 0;

  const cicli = calcolaCicli({
    minuti_totali,
    tipo_terreno: input.tipo_terreno,
    pendenza: input.pendenza,
  });

  const azione = determinaAzione(fabbisogno_mm, minuti_totali, input.tempo_irrigazione_base, {
    pioggia_in_corso: meteo.pioggia_in_corso,
    irrigazione_profilo: input.irrigazione_profilo,
    saturazione_suolo: bilancio.saturazione_suolo,
  });

  let schema_settimanale = calcolaSchemaSettimanale({
    weatherBundle,
    input,
    meteo,
    fabbisogno_mm,
    minuti_totali,
    cicli,
    azione,
    kc,
    pluv_riferimento: pluv,
  });

  schema_settimanale = arricchisciSchemaSettimanalePerLinee(
    schema_settimanale,
    profilo,
    input,
    azione,
  );

  const programma_zone = calcolaProgrammaZoneCentralina(profilo, {
    mm_target: fabbisogno_mm,
    azione,
    schema_settimanale,
    input,
  });

  const messaggio_ux = generaMessaggioUx({
    azione,
    input,
    meteo,
    fabbisogno_mm,
    minuti_totali,
    cicli,
    kc,
    bilancio,
  });

  const bilancio_serbatoio = {
    capacita_campo_mm: bilancio.capacita_campo_mm,
    mad_mm: bilancio.mad_mm,
    stato_suolo_mm: bilancio.stato_suolo_mm,
    livello_serbatoio_pct: bilancio.livello_serbatoio_pct,
    mm_mancanti_oggi: bilancio.mm_mancanti_oggi,
    fabbisogno_oggi_mm: bilancio.fabbisogno_oggi_mm,
    saturazione_suolo: bilancio.saturazione_suolo,
    riepilogo: riepilogoSerbatoioUx(bilancio)?.stato,
  };

  return {
    azione_irrigazione: azione,
    bilancio_serbatoio,
    dati_tecnici: {
      fabbisogno_calcolato_mm: fabbisogno_mm,
      minuti_totali_consigliati: minuti_totali,
      et0_mm: meteo.et0_mm,
      precipitazioni_mm: meteo.precip_oggi_mm,
      pluviometria_mm_ora: pluv,
      kc,
      kc_stagionale: true,
      capacita_campo_mm: bilancio.capacita_campo_mm,
      modificatore_ombra: modificatoreOmbra(input.percentuale_ombra),
      percentuale_ombra_mappa: input.percentuale_ombra,
      pendenza_effettiva: input.pendenza,
      contesto_mappa: input.contesto_mappa
        ? {
            ha_zone_ombra: input.contesto_mappa.ha_zone_ombra,
            ha_pendenza_mappa: input.contesto_mappa.ha_pendenza_mappa,
            pct_ombra_prato: input.contesto_mappa.pct_ombra_prato,
            num_pendenza: input.contesto_mappa.num_pendenza,
            num_teste_in_ombra: input.contesto_mappa.num_teste_in_ombra,
            num_teste_vicino_pendenza: input.contesto_mappa.num_teste_vicino_pendenza,
          }
        : null,
      saturazione_suolo: bilancio.saturazione_suolo,
    },
    dati_centralina: {
      cicli_consigliati: azione === "SPEGNI" ? 0 : cicli.cicli_consigliati,
      minuti_per_ciclo: azione === "SPEGNI" ? 0 : cicli.minuti_per_ciclo,
      pausa_tra_cicli_min: cicli.pausa_tra_cicli_min,
      tempo_base_minuti: input.tempo_irrigazione_base,
      tipo_irrigatori: input.tipo_irrigatori,
      mm_da_evadere_oggi: fabbisogno_mm,
    },
    input_utilizzato: input,
    meteo,
    meteo_utilizzato: meteo.et0_mm != null,
    schema_settimanale,
    programma_zone,
    messaggio_ux,
    meteo_snapshot: snapshotMeteoIrrigazione(weatherBundle, meteo),
    calcolato_il: new Date().toISOString(),
  };
}

export async function kcDaKnowledgeBase(admin, geminiEmbed, queryKnowledgeBasePrioritized) {
  if (!admin || !geminiEmbed || !queryKnowledgeBasePrioritized) return kcStagionale();
  try {
    const emb = await geminiEmbed(
      "coefficiente colturale Kc prato tappeto erboso irrigazione ET0 evapotraspirazione",
    );
    const chunks = await queryKnowledgeBasePrioritized(admin, emb, {
      matchCount: 3,
      minLibri: 1,
    });
    const blob = chunks.map((c) => c.soluzione).join(" ");
    const m = blob.match(/Kc\s*[=:]?\s*0[,.](\d{2})/i) || blob.match(/coefficiente[^0-9]{0,20}(0[,.]\d{2})/i);
    if (m) {
      const v = Number(String(m[1] || m[0]).replace(",", "."));
      if (v > 0.5 && v < 1) return v;
      const v2 = Number(`0.${m[1]}`);
      if (v2 > 0.5 && v2 < 1) return v2;
    }
  } catch {
    /* fallback */
  }
  return kcStagionale();
}

export async function calcolaIrrigazioneGiornalieraAsync(profilo, weatherBundle, opts = {}) {
  let kc = kcStagionale();
  let parametriRag = null;

  if (opts.admin && opts.geminiKey) {
    parametriRag = await recuperaParametriRag("irrigazione", {
      admin: opts.admin,
      geminiKey: opts.geminiKey,
      profilo,
    });
    kc = kcPerData(parametriRag);
  } else if (opts.admin && opts.geminiEmbed && opts.queryKnowledgeBasePrioritized) {
    kc = await kcDaKnowledgeBase(opts.admin, opts.geminiEmbed, opts.queryKnowledgeBasePrioritized);
  }

  const out = calcolaIrrigazioneGiornaliera(profilo, weatherBundle, { ...opts, kc });
  return {
    ...out,
    parametri_rag: parametriRag
      ? { fonte: parametriRag.fonte, kc_applicato: kc, kc_mensile: parametriRag.kc_mensile }
      : null,
  };
}
