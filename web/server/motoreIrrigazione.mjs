/**
 * Motore irrigazione — bilancio idrico (ET0 × Kc − pioggia) → minuti centralina.
 * Precision Turfgrass Management semplificato per utente finale.
 */

import { normalizzaInputIrrigazione } from "./irrigazioneInput.mjs";

const KC_PRATO = 0.75;
const COEFF_OMBRA_ALTA = 0.7;
const SOGLIA_OMBRA_ALTA = 50;
const SOGLIA_MINUTI_CYCLE_SOAK = 15;
const PAUSA_TRA_CICLI_MIN = 60;

const PLUVIOMETRIA_MM_H = {
  statici: 35,
  dinamici: 12,
  testine_rotator: 15,
  ala_gocciolante: 20,
};

/**
 * Estrae ET0 e precipitazioni (ieri + oggi) dal bundle meteo Open-Meteo.
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
  const pioggiaInCorso = main === "Rain" || main === "Drizzle" || main === "Thunderstorm";

  return {
    et0_mm: et0_oggi != null ? Number(et0_oggi) : null,
    et0_mm_ieri: et0_ieri != null ? Number(et0_ieri) : null,
    precipitazioni_mm: Math.round((precip_oggi + precip_ieri * 0.5) * 10) / 10,
    precip_oggi_mm: precip_oggi,
    precip_ieri_mm: precip_ieri,
    pioggia_in_corso: pioggiaInCorso,
    fonte: weatherBundle?.provider || "open-meteo",
  };
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

/**
 * Fabbisogno netto mm/giorno.
 */
export function calcolaFabbisognoMm(et0_mm, precipitazioni_mm, percentuale_ombra, kc = KC_PRATO) {
  if (et0_mm == null || Number.isNaN(et0_mm)) return null;
  const modOmbra = modificatoreOmbra(percentuale_ombra);
  const fabbisogno = et0_mm * kc * modOmbra - (Number(precipitazioni_mm) || 0);
  return Math.round(fabbisogno * 100) / 100;
}

export function minutiDaFabbisogno(fabbisogno_mm, pluviometria_mm_ora) {
  if (fabbisogno_mm == null || fabbisogno_mm <= 0) return 0;
  const pluv = Math.max(1, Number(pluviometria_mm_ora) || 12);
  return Math.max(0, Math.round((fabbisogno_mm / pluv) * 60));
}

/**
 * Cycle & soak + note terreno sabbioso.
 */
export function calcolaCicli({
  minuti_totali,
  tipo_terreno,
  pendenza,
}) {
  const argilloso = tipo_terreno === "argilloso";
  const pendenzaAlta = pendenza === "forte" || pendenza === "media";

  if (tipo_terreno === "sabbioso" && minuti_totali > 10) {
    return {
      cicli_consigliati: 1,
      minuti_per_ciclo: Math.min(minuti_totali, 12),
      pausa_tra_cicli_min: null,
      frazionamento_settimanale: true,
      nota_tecnica:
        "Terreno sabbioso: meglio irrigare meno minuti ma più spesso nella settimana, così l'acqua non scende in profondità lasciando la superficie secca.",
    };
  }

  if ((argilloso || pendenzaAlta) && minuti_totali > SOGLIA_MINUTI_CYCLE_SOAK) {
    const cicli = minuti_totali <= 24 ? 2 : 3;
    const minuti_per_ciclo = Math.max(5, Math.ceil(minuti_totali / cicli));
    return {
      cicli_consigliati: cicli,
      minuti_per_ciclo,
      pausa_tra_cicli_min: PAUSA_TRA_CICLI_MIN,
      frazionamento_settimanale: false,
      nota_tecnica:
        "Suolo compatto o in pendenza: più passate brevi con pausa tra un ciclo e l'altro evitano ruscellamento e pozzanghere.",
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
  if (ctx.pioggia_in_corso || fabbisogno_mm != null && fabbisogno_mm <= 0) {
    return "SPEGNI";
  }
  if (minuti_totali <= 0) return "SPEGNI";
  if (ctx.irrigazione_profilo === "pioggia" && fabbisogno_mm < 1) return "SPEGNI";

  const base = Math.max(1, tempo_base);
  if (minuti_totali > base * 1.2) return "AUMENTA";
  if (minuti_totali < base * 0.55) return "DIMINUISCI";
  return "MANTIENI";
}

function generaMessaggioUx({
  azione,
  input,
  meteo,
  fabbisogno_mm,
  minuti_totali,
  cicli,
  kc,
}) {
  if (azione === "SPEGNI") {
    if (meteo.pioggia_in_corso) {
      return "Oggi piove (o è in arrivo): la natura irriga al posto tuo. Spegni la centralina e riaccendi solo quando il prato inizia ad appassire leggermente al mattino.";
    }
    if ((meteo.precipitazioni_mm ?? 0) >= 3) {
      return `Le ultime piogge hanno già dato acqua sufficiente (${meteo.precipitazioni_mm} mm conteggiati). Non serve irrigare oggi: risparmi acqua e eviti ristagni che favoriscono funghi.`;
    }
    return "Il bilancio idrico di oggi è a posto: il prato non ha bisogno di acqua aggiuntiva. Lascia la centralina spenta e controlla domani mattina.";
  }

  const parti = [];

  if (meteo.et0_mm != null) {
    parti.push(
      input.percentuale_ombra > SOGLIA_OMBRA_ALTA
        ? `Con le temperature attuali il prato in ombra «beve» meno (ho ridotto il fabbisogno del 30% rispetto al sole pieno).`
        : `Oggi il prato può evaporare circa ${meteo.et0_mm} mm di acqua (ET0).`,
    );
  }

  if (cicli.cicli_consigliati > 1) {
    parti.push(
      `Hai un terreno ${input.tipo_terreno === "argilloso" ? "argilloso" : "che assorbe lentamente"}${input.pendenza !== "piana" ? " e una certa pendenza" : ""}: invece di un unico ciclo lungo, imposta la centralina su ${cicli.cicli_consigliati} partenze da ${cicli.minuti_per_ciclo} minuti ciascuna, distanziate di circa ${cicli.pausa_tra_cicli_min} minuti. Così l'acqua entra nel suolo senza scivolare via.`,
    );
  } else if (cicli.frazionamento_settimanale) {
    parti.push(
      `Terreno sabbioso: non usare tutti i minuti in un solo giorno. Meglio ${minuti_totali} minuti oggi e, se serve, un altro passaggio leggero tra 2–3 giorni.`,
    );
  } else {
    parti.push(
      azione === "AUMENTA"
        ? `Rispetto ai ${input.tempo_irrigazione_base} minuti che avevi impostato, oggi servono circa ${minuti_totali} minuti totali: gira la rotella verso l'alto.`
        : azione === "DIMINUISCI"
          ? `Oggi basta meno acqua: circa ${minuti_totali} minuti totali (meno dei tuoi ${input.tempo_irrigazione_base} minuti abituali).`
          : `I tuoi ${input.tempo_irrigazione_base} minuti sono vicini al fabbisogno di oggi (~${minuti_totali} min): puoi mantenere l'impostazione attuale.`,
    );
  }

  parti.push(
    `Applica al mattino presto (6:00–8:00) o nel tardo pomeriggio: meno perdite per evaporazione e foglie più felici.`,
  );

  return parti.join(" ").slice(0, 980);
}

/**
 * Calcolo principale.
 * @param {object} profilo — riga prato_profilo (+ prato_zone)
 * @param {object} weatherBundle — output fetchWeatherBundle
 * @param {{ kc?: number, pluviometria_mm_ora?: number }} [opts]
 */
export function calcolaIrrigazioneGiornaliera(profilo, weatherBundle, opts = {}) {
  const input = normalizzaInputIrrigazione(profilo);
  const meteo = estraiMeteoIrrigazione(weatherBundle);
  const kc = opts.kc ?? KC_PRATO;

  if (input.irrigazione_profilo === "pioggia" && (meteo.precipitazioni_mm ?? 0) < 1 && meteo.et0_mm < 2) {
    return {
      azione_irrigazione: "SPEGNI",
      dati_tecnici: {
        fabbisogno_calcolato_mm: 0,
        minuti_totali_consigliati: 0,
        et0_mm: meteo.et0_mm,
        precipitazioni_mm: meteo.precipitazioni_mm,
        kc,
        modificatore_ombra: modificatoreOmbra(input.percentuale_ombra),
      },
      dati_centralina: {
        cicli_consigliati: 0,
        minuti_per_ciclo: 0,
        pausa_tra_cicli_min: null,
        tempo_base_minuti: input.tempo_irrigazione_base,
      },
      input_utilizzato: input,
      meteo,
      messaggio_ux:
        "Hai indicato che il prato vive soprattutto di pioggia naturale: oggi non serve accendere l'impianto salvo siccità prolungata con foglie che non si rialzano la mattina.",
      calcolato_il: new Date().toISOString(),
    };
  }

  const pluv = pluviometriaMmOra(input.tipo_irrigatori, opts.pluviometria_mm_ora);
  const fabbisogno_mm = calcolaFabbisognoMm(
    meteo.et0_mm,
    meteo.precipitazioni_mm,
    input.percentuale_ombra,
    kc,
  );

  let minuti_totali = 0;
  if (fabbisogno_mm != null && fabbisogno_mm > 0) {
    minuti_totali = minutiDaFabbisogno(fabbisogno_mm, pluv);
  }

  const cicli = calcolaCicli({
    minuti_totali,
    tipo_terreno: input.tipo_terreno,
    pendenza: input.pendenza,
  });

  const azione = determinaAzione(fabbisogno_mm, minuti_totali, input.tempo_irrigazione_base, {
    pioggia_in_corso: meteo.pioggia_in_corso,
    irrigazione_profilo: input.irrigazione_profilo,
  });

  const messaggio_ux = generaMessaggioUx({
    azione,
    input,
    meteo,
    fabbisogno_mm,
    minuti_totali,
    cicli,
    kc,
  });

  return {
    azione_irrigazione: azione,
    dati_tecnici: {
      fabbisogno_calcolato_mm: fabbisogno_mm ?? 0,
      minuti_totali_consigliati: minuti_totali,
      et0_mm: meteo.et0_mm,
      precipitazioni_mm: meteo.precipitazioni_mm,
      pluviometria_mm_ora: pluv,
      kc,
      modificatore_ombra: modificatoreOmbra(input.percentuale_ombra),
    },
    dati_centralina: {
      cicli_consigliati: azione === "SPEGNI" ? 0 : cicli.cicli_consigliati,
      minuti_per_ciclo: azione === "SPEGNI" ? 0 : cicli.minuti_per_ciclo,
      pausa_tra_cicli_min: cicli.pausa_tra_cicli_min,
      tempo_base_minuti: input.tempo_irrigazione_base,
      tipo_irrigatori: input.tipo_irrigatori,
    },
    input_utilizzato: input,
    meteo,
    messaggio_ux,
    calcolato_il: new Date().toISOString(),
  };
}

/**
 * Opzionale: arricchisce Kc da RAG (libri universitari). Fallback 0.75.
 */
export async function kcDaKnowledgeBase(admin, geminiEmbed, queryKnowledgeBasePrioritized) {
  if (!admin || !geminiEmbed || !queryKnowledgeBasePrioritized) return KC_PRATO;
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
  return KC_PRATO;
}

/**
 * Pipeline async completa (profilo + meteo + opz. RAG).
 */
export async function calcolaIrrigazioneGiornalieraAsync(profilo, weatherBundle, opts = {}) {
  let kc = KC_PRATO;
  if (opts.admin && opts.geminiEmbed && opts.queryKnowledgeBasePrioritized) {
    kc = await kcDaKnowledgeBase(
      opts.admin,
      opts.geminiEmbed,
      opts.queryKnowledgeBasePrioritized,
    );
  }
  return calcolaIrrigazioneGiornaliera(profilo, weatherBundle, { ...opts, kc });
}
