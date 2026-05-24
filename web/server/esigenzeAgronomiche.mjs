/**
 * Solum — output puramente agronomico (necessità molecolari/fisiologiche, niente brand).
 */

const MESI_IT = [
  "GENNAIO",
  "FEBBRAIO",
  "MARZO",
  "APRILE",
  "MAGGIO",
  "GIUGNO",
  "LUGLIO",
  "AGOSTO",
  "SETTEMBRE",
  "OTTOBRE",
  "NOVEMBRE",
  "DICEMBRE",
];

/** Deriva esigenze da macro/categoria/titolo quando l'LLM non le fornisce. */
export function derivaEsigenzeMolecolari(intervento) {
  const tit = String(intervento?.titolo || "").toLowerCase();
  const desc = String(intervento?.descrizione || "").toLowerCase();
  const blob = `${tit} ${desc}`;
  const cat = String(intervento?.categoria || "").toLowerCase();
  const macro = String(intervento?.macro_categoria || "").toUpperCase();

  const out = [];

  if (macro === "N" || /azot|concimazione azot|ripresa vegetativa/i.test(blob)) {
    out.push("Azoto (N) — specificare cessione rapida o lenta in base a temperatura suolo");
  }
  if (macro === "P" || /fosfor|radic/i.test(blob)) {
    out.push("Fosforo (P) — sviluppo radicale e riserve");
  }
  if (macro === "K" || /potass|antistress/i.test(blob)) {
    out.push("Potassio (K) — tolleranza stress idrico e osmotico");
  }
  if (cat === "biostimolante" || /biostim|umic|fulv|aminoacidi|kelp/i.test(blob)) {
    if (/umic/i.test(blob)) out.push("Acidi umici");
    if (/fulv/i.test(blob)) out.push("Acidi fulvici");
    if (!/umic|fulv/i.test(blob)) out.push("Biostimolazione: Acidi umici e/o fulvici, amminoacidi");
  }
  if (cat === "umettante" || /umett|surfact/i.test(blob)) {
    out.push("Agente umettante / surfattante per migliorare assorbimento fogliare");
  }
  if (/ferro|clorosi|ingiallimento/i.test(blob)) {
    out.push("Ferro chelato (Fe-EDDHA o equivalente) — correzione clorosi ferrica");
  }
  if (/magnesio|mg/i.test(blob)) out.push("Magnesio (Mg)");
  if (cat === "diserbo" && /pre.?emerg|antigermin/i.test(blob)) {
    out.push("Principio attivo antigerminante pre-emergenza (es. Pendimetalin, Propyzamide — solo PFNPO)");
  }
  if (cat === "diserbo" && !/pre.?emerg/i.test(blob)) {
    out.push("Diserbo selettivo post-emergenza — principio attivo da etichetta PFNPO");
  }
  if (cat === "trattamento" && /fung|oidio|patogen/i.test(blob)) {
    out.push("Principio attivo fungicida o antagonista biologico (es. Propiconazolo, Trichoderma spp.)");
  }
  if (cat === "trattamento" && /insett|larv|popillia|afid/i.test(blob)) {
    out.push("Principio attivo insetticida (es. Acetamiprid SL) — solo con evidenza danno");
  }
  if (cat === "rinnovo" || /overseed|semina|trasemina/i.test(blob)) {
    out.push("Semina/overseeding — miscuglio idoneo a esposizione e uso (g/m² da tabella varietale)");
  }
  if (cat === "arieggiatura" || /scarific|arieggi|feltro|thatch/i.test(blob)) {
    out.push("Arieggiatura meccanica — decompattazione e gestione feltro");
  }

  if (!out.length) {
    out.push(intervento?.fabbisogno_fisiologico || "Intervento di gestione del tappeto erboso");
  }

  return [...new Set(out.map((s) => s.trim()).filter(Boolean))];
}

export function titoloDaEsigenze(esigenze, fallbackTitolo) {
  const first = esigenze?.[0];
  if (!first) return String(fallbackTitolo || "Intervento agronomico").slice(0, 120);
  const short = first.length > 85 ? `${first.slice(0, 82)}…` : first;
  return short.slice(0, 120);
}

export function arricchisciInterventoEsigenze(intervento, { weatherBundle } = {}) {
  const raw = intervento?.esigenze_molecolari;
  let esigenze = Array.isArray(raw)
    ? raw.map((e) => String(e).trim()).filter(Boolean)
    : typeof raw === "string" && raw.trim()
      ? raw.split(/[;•\n]/).map((s) => s.trim()).filter(Boolean)
      : [];

  if (!esigenze.length) esigenze = derivaEsigenzeMolecolari(intervento);

  const fabbisogno =
    String(intervento?.fabbisogno_fisiologico || "").trim() ||
    `Necessità fisiologica: ${esigenze.join("; ")}`.slice(0, 500);

  const titolo =
    String(intervento?.titolo || "").trim() &&
    !/tank-mix|bottos|fly |trichoderma|tryko|vigor/i.test(intervento.titolo)
      ? String(intervento.titolo).slice(0, 120)
      : titoloDaEsigenze(esigenze, intervento.titolo);

  let descrizione = String(intervento?.descrizione || "").trim();
  if (!descrizione || /catalogo|bottos|marca /i.test(descrizione)) {
    descrizione = fabbisogno;
  }
  descrizione = `${descrizione}\n\nEsigenze: ${esigenze.join(" · ")}`.slice(0, 600);

  return {
    ...intervento,
    titolo,
    descrizione,
    esigenze_molecolari: esigenze,
    fabbisogno_fisiologico: fabbisogno,
    prodotto_id: null,
    prodotto_nome: null,
    dose_totale: null,
    dose_unita: null,
    dose_per_mq: null,
  };
}

/** Timeline predittiva da piano + meteo (deterministico, integra LLM se presente). */
export function buildTimelineBisogni(interventi, oggi, { llmTimeline, weatherBundle } = {}) {
  const oggiDate = oggi || new Date().toISOString().slice(0, 10);
  const futuri = (interventi || [])
    .filter((i) => i.stato !== "completato" && i.data_prevista >= oggiDate)
    .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));

  const oggiList = futuri.filter((i) => i.data_prevista === oggiDate || i.priorita === "alta").slice(0, 3);
  const tra30 = futuri.filter((i) => {
    const d = new Date(`${i.data_prevista}T12:00:00`);
    const o = new Date(`${oggiDate}T12:00:00`);
    const diff = (d - o) / (86400000);
    return diff > 0 && diff <= 31;
  });

  const lineaOggi =
    llmTimeline?.oggi ||
    (oggiList.length
      ? `OGGI: ${oggiList.map((i) => i.titolo || i.esigenze_molecolari?.[0]).join("; ")}`
      : "OGGI: nessun intervento urgente in agenda — monitorare ET0 e umidità suolo.");

  const lineaMese =
    llmTimeline?.prossimo_mese ||
    (tra30.length
      ? `PROSSIMO MESE: ${tra30
          .slice(0, 4)
          .map((i) => i.titolo || i.esigenze_molecolari?.[0])
          .join("; ")}`
      : "PROSSIMO MESE: mantenere equilibrio idrico; valutare NPK in base a ripresa vegetativa.");

  const finestre = llmTimeline?.finestre_stagionali?.length
    ? llmTimeline.finestre_stagionali
    : buildFinestreStagionali(futuri, oggiDate);

  const et0 = weatherBundle?.agronomic?.et0_mm ?? weatherBundle?.current?.et0;
  if (et0 != null && et0 > 4.5 && !/stress|ET0/i.test(lineaOggi)) {
    return {
      oggi: `OGGI: stress termico (ET0 ~${et0} mm/g) — biostimolazione con Acidi Umici/Fulvici e agente umettante se trattamenti fogliari.`,
      prossimo_mese: lineaMese.replace(/^PROSSIMO MESE:\s*/i, ""),
      prossimo_mese_label: "PROSSIMO MESE",
      finestre_stagionali: finestre,
    };
  }

  return {
    oggi: lineaOggi.replace(/^OGGI:\s*/i, ""),
    oggi_label: "OGGI",
    prossimo_mese: lineaMese.replace(/^PROSSIMO MESE:\s*/i, ""),
    prossimo_mese_label: "PROSSIMO MESE",
    finestre_stagionali: finestre,
  };
}

function buildFinestreStagionali(interventi, oggi) {
  const bySeason = new Map();
  for (const i of interventi) {
    const m = new Date(`${i.data_prevista}T12:00:00`).getMonth();
    const label = MESI_IT[m];
    if (!bySeason.has(label)) bySeason.set(label, []);
    bySeason.get(label).push(i);
  }

  const keys = [...bySeason.keys()];
  const oggiM = new Date(`${oggi}T12:00:00`).getMonth();
  const ordered = [
    ...keys.filter((k) => MESI_IT.indexOf(k) >= oggiM),
    ...keys.filter((k) => MESI_IT.indexOf(k) < oggiM),
  ];

  return ordered.slice(0, 6).map((periodo) => {
    const items = bySeason.get(periodo) || [];
    const esigenze = items
      .slice(0, 3)
      .map((x) => x.esigenze_molecolari?.[0] || x.titolo)
      .filter(Boolean)
      .join("; ");
    return { periodo, esigenza: esigenze || "Monitoraggio fisiologico e meteo" };
  });
}

/** Arricchimento calendario senza catalogo prodotti (foto / piano). */
export function arricchisciInterventoCalendarioPuro(intervento, profilo, weatherBundle) {
  const enriched = arricchisciInterventoEsigenze(intervento, { weatherBundle });
  const det = dettaglioPureAgronomy(enriched, { profilo, weatherBundle });
  return {
    ...enriched,
    titolo: String(det.tipo_intervento).slice(0, 120),
    macro_categoria: det.macro_categoria || enriched.macro_categoria,
    spiegazione_semplice: det.spiegazione_semplice,
    messaggio_ux: det.fabbisogno_fisiologico || det.spiegazione_semplice,
    razionale_scientifico: det.razionale_scientifico,
    dettaglio_trattamento: det,
    prodotto_id: null,
    prodotto_nome: null,
  };
}

export function dettaglioPureAgronomy(intervento, { profilo, weatherBundle } = {}) {
  const enriched = arricchisciInterventoEsigenze(intervento, { weatherBundle });
  const esigenze = enriched.esigenze_molecolari || [];

  return {
    tipo_intervento: enriched.titolo,
    macro_categoria: intervento.macro_categoria || null,
    spiegazione_semplice: enriched.fabbisogno_fisiologico || enriched.descrizione,
    esigenze_molecolari: esigenze,
    fabbisogno_fisiologico: enriched.fabbisogno_fisiologico,
    nota_scelta_prodotti: null,
    prodotti_consigliati: [],
    razionale_scientifico: enriched.descrizione?.slice(0, 400),
    contesto_meteo: weatherBundle
      ? {
          utilizzato_nel_calcolo: true,
          nota_utente: "Calendario predittivo Solum: bisogni molecolari, senza raccomandazione commerciale.",
        }
      : null,
  };
}
