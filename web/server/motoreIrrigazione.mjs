/**
 * Motore irrigazione — bilancio idrico a serbatoio (ET0 × Kc − pioggia utile) → minuti per linea centralina.
 */

import { normalizzaInputIrrigazione } from "./irrigazioneInput.mjs";
import { IRRIGATOR_MODES, normalizeIrrigatorModalita, normalizePratoZone } from "./pratoZone.mjs";

const ORDINE_MODALITA = { statico: 0, rotator: 1, dinamico: 2 };

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

export function modificatoreOmbra(percentuale_ombra) {
  const pct = Number(percentuale_ombra) || 0;
  return pct > SOGLIA_OMBRA_ALTA ? COEFF_OMBRA_ALTA : 1;
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

/**
 * Bilancio suolo su più giorni (serbatoio). Restituisce mm da reintegrare oggi e schema 7 gg.
 */
export function simulaBilancioIdricoSettimana({
  giorniForecast,
  input,
  kc,
  percentuale_ombra,
}) {
  const cap = capacitaCampoMm(input.tipo_terreno);
  const mad = cap * MAD_FRAZIONE;
  const modOmbra = modificatoreOmbra(percentuale_ombra);
  let suolo = cap * 0.75;

  const schemaGiorni = [];

  for (const giorno of giorniForecast) {
    const et0 = Number(giorno.et0_mm ?? 3);
    const precip = Number(giorno.precip_mm ?? 0);
    const etc = et0 * kc * modOmbra;

    suolo -= etc;
    const pioggiaUtile = pioggiaEfficaceMm(precip, suolo, cap);
    suolo += pioggiaUtile;
    suolo = Math.min(Math.max(suolo, 0), cap);

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
      stato_suolo_mm: Math.round(suolo * 10) / 10,
      irriga,
      mm_necessari,
    });
  }

  const oggi = schemaGiorni[0];
  const fabbisogno_oggi_mm = oggi?.irriga ? oggi.mm_necessari : 0;
  const saturazione = (oggi?.precip_mm ?? 0) >= 8 || (oggi && !oggi.irriga && oggi.stato_suolo_mm >= cap * 0.9);

  return {
    fabbisogno_oggi_mm,
    saturazione_suolo: saturazione,
    capacita_campo_mm: cap,
    schema_giorni: schemaGiorni,
  };
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
    out.push({
      iso,
      nome: GIORNI_BREVI[d.getDay()],
      et0_mm: row.et0_mm ?? row.et0 ?? (i === 0 ? meteo.et0_mm : null) ?? ag?.et0_mm_media_7g ?? 3,
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

function generaMessaggioUx({ azione, input, meteo, fabbisogno_mm, minuti_totali, cicli, kc, bilancio }) {
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
      fabbisogno_oggi_mm: bilancio.fabbisogno_oggi_mm,
    },
    meteo_fonte: meteo.fonte || weatherBundle?.provider || "open-meteo",
  };
}

/** Raggruppa teste mappa per linea idraulica (stesso tipo = stessa elettrovalvola tipica). */
function raggruppaLineeIdrauliche(heads) {
  const map = new Map();
  for (const h of heads) {
    const m = h.modalita;
    if (!map.has(m)) map.set(m, []);
    map.get(m).push(h);
  }
  return [...map.entries()]
    .sort((a, b) => (ORDINE_MODALITA[a[0]] ?? 9) - (ORDINE_MODALITA[b[0]] ?? 9))
    .map(([modalita, teste], idx) => ({ modalita, teste, linea_numero: idx + 1 }));
}

/**
 * Programma per linea centralina (non dividere mm per numero teste).
 */
export function calcolaProgrammaZoneCentralina(
  profilo,
  { mm_target, azione, schema_settimanale, input },
) {
  const { zone } = normalizePratoZone(profilo?.prato_zone);
  const heads = zone
    .filter((z) => z.tipo === "irrigatore")
    .map((z) => ({ ...z, modalita: normalizeIrrigatorModalita(z.modalita) }));

  if (!heads.length) return null;

  const linee = raggruppaLineeIdrauliche(heads);
  const freq = schema_settimanale?.frequenza;
  const frequenzaLabel = freq?.label ?? "A deficit (vedi griglia settimanale)";
  const giorniAttivi = (schema_settimanale?.giorni || []).filter((g) => g.irriga).map((g) => g.nome);
  const oggiIrriga = schema_settimanale?.oggi_irriga !== false && azione !== "SPEGNI";
  const orario = "06:30";
  const mm = Math.max(0, Number(mm_target) || 0);

  const zoneOut = linee.map((linea) => {
    const tipo = modalitaToTipoCentralina(linea.modalita);
    const pluv = pluviometriaMmOra(tipo);
    const modeLabel = IRRIGATOR_MODES[linea.modalita]?.label || linea.modalita;
    const nTeste = linea.teste.length;

    let minutiTotaliLinea = 0;
    if (oggiIrriga && mm > 0) {
      minutiTotaliLinea = minutiDaFabbisogno(mm, pluv);
    }

    const cicliZona = calcolaCicli({
      minuti_totali: minutiTotaliLinea,
      tipo_terreno: input.tipo_terreno,
      pendenza: input.pendenza,
    });

    let cicli = azione === "SPEGNI" ? 0 : cicliZona.cicli_consigliati;
    let minutiPerCiclo = azione === "SPEGNI" ? 0 : cicliZona.minuti_per_ciclo;
    if (linea.modalita === "dinamico" && minutiTotaliLinea > 0 && minutiTotaliLinea <= 50) {
      cicli = 1;
      minutiPerCiclo = minutiTotaliLinea;
    }

    const etichetta = `Linea ${linea.linea_numero} · ${modeLabel}${nTeste > 1 ? ` (${nTeste} teste)` : ""}`;

    let impostazione;
    if (azione === "SPEGNI" || minutiTotaliLinea === 0) {
      impostazione = `${etichetta}: OFF oggi.`;
    } else if (cicli > 1) {
      impostazione = `${etichetta}: reintegrare ${mm} mm → ${cicli} partenze × ${minutiPerCiclo} min (totale ${minutiTotaliLinea} min), ore ${orario}. ${frequenzaLabel}.`;
    } else {
      impostazione = `${etichetta}: reintegrare ${mm} mm → ${minutiPerCiclo} min, ore ${orario}. ${frequenzaLabel}.`;
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
      mm_da_evadere: mm,
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
      nota:
        nTeste > 1
          ? "Più teste sulla stessa linea: un solo programma in centralina, minuti per l'intera elettrovalvola."
          : null,
    };
  });

  return {
    numero_zone: zoneOut.length,
    numero_teste_mappa: heads.length,
    zone: zoneOut,
    minuti_totali_zone: zoneOut.reduce((s, z) => s + z.minuti_totali_linea, 0),
    sintesi:
      linee.length === 1
        ? "Una linea in mappa: imposta un solo programma in centralina con i minuti sotto."
        : `${linee.length} linee idrauliche (${linee.map((l) => IRRIGATOR_MODES[l.modalita]?.label).join(", ")}): ogni uscita centralina = una linea, con ${mm} mm da reintegrare quando irrighi (non divisi per testa).`,
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

  const schema_settimanale = calcolaSchemaSettimanale({
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

  return {
    azione_irrigazione: azione,
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
  if (opts.admin && opts.geminiEmbed && opts.queryKnowledgeBasePrioritized) {
    kc = await kcDaKnowledgeBase(
      opts.admin,
      opts.geminiEmbed,
      opts.queryKnowledgeBasePrioritized,
    );
  }
  return calcolaIrrigazioneGiornaliera(profilo, weatherBundle, { ...opts, kc });
}
