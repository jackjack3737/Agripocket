/** Onboarding — guida per utenti non esperti */

const IMG = (name) => `/onboarding/${name}`;

export const ONBOARDING_STEPS = [
  {
    id: "uso",
    field: "uso",
    title: "Come usi il prato?",
    intro: "Primo passo: capire quanto viene calpestato e curato lo spazio verde.",
    whatToDo: "Leggi le opzioni qui sotto e tocca quella che ti assomiglia di più. Puoi cambiare idea finché non premi Avanti.",
    hint: "Non serve il nome botanico — pensa a come lo vivi nella vita quotidiana.",
    options: [
      {
        value: "giardino",
        label: "Giardino di casa",
        desc: "Prato dietro o davanti casa, per la famiglia",
        help: "Passeggiate, sdraiarvi, bambini che giocano ogni tanto.",
        image: IMG("opt-uso-giardino.png"),
      },
      {
        value: "ornamentale",
        label: "Soprattutto bello da vedere",
        desc: "Poco calpestio, cura estetica",
        help: "Lo guardi più che camminarci sopra: aiuole, bordi, prato «da vetrina».",
        image: IMG("opt-uso-ornamentale.png"),
      },
      {
        value: "sport",
        label: "Gioco e calpestio",
        desc: "Partite, cani, passaggio frequente",
        help: "Erba che deve reggere usura: calcetto, trampolino, animali che corrono.",
        image: IMG("opt-uso-sport.png"),
      },
      {
        value: "professionale",
        label: "Campo o grande area",
        desc: "Verde pubblico, campo sportivo, vaste superfici",
        help: "Manutenzione programmata, spesso con attrezzature dedicate.",
        image: IMG("opt-uso-professionale.png"),
      },
    ],
  },
  {
    id: "esposizione",
    field: "esposizione",
    title: "Quanto sole ha il prato?",
    intro: "Il sole decide molto su quali malattie compaiono e quanto va irrigato.",
    whatToDo:
      "Immagina un giorno di luglio tra le 10 e le 16: quante ore il prato resta al sole diretto, senza ombra di alberi o muri?",
    hint: "Se hai zone diverse (metà sole, metà ombra), scegli quella che copre più superficie.",
    options: [
      {
        value: "sole_pieno",
        label: "Sole per quasi tutto il giorno",
        desc: "Più di 6 ore di sole diretto",
        help: "Prato esposto a sud, poca ombra da alberi alti.",
        image: IMG("opt-esp-sole.png"),
      },
      {
        value: "mezzombra",
        label: "Metà giornata",
        desc: "Circa 3–6 ore, o sole solo al mattino",
        help: "Ombra di casa, siepe o alberi per parte del giorno.",
        image: IMG("opt-esp-mezzombra.png"),
      },
      {
        value: "ombra",
        label: "Poca luce",
        desc: "Meno di 3 ore di sole diretto",
        help: "Sotto alberi fitti, tra case strette, lato nord.",
        image: IMG("opt-esp-ombra.png"),
      },
    ],
  },
  {
    id: "tipo_terreno",
    field: "tipo_terreno",
    title: "Com'è il terreno sotto?",
    intro: "Non serve analisi di laboratorio: basta osservare dopo la pioggia.",
    whatToDo:
      "Dopo un acquazzane, il suolo asciuga in fretta (sabbioso), normale in qualche giorno (medio), o resta umido e compatto a lungo (argilloso)?",
    hint: "Se non hai mai fatto caso, scegli «Non lo so».",
    options: [
      {
        value: "sabbioso",
        label: "Asciuga in fretta",
        desc: "Terreno leggero, quasi sabbioso",
        help: "L'acqua infiltra subito; in estate si asciuga presto.",
        image: IMG("opt-ter-sabbioso.png"),
      },
      {
        value: "medio",
        label: "Normale",
        desc: "Né troppo sabbioso né pesante",
        help: "La maggior parte dei giardini domestici.",
        image: IMG("opt-ter-medio.png"),
      },
      {
        value: "argilloso",
        label: "Resta umido a lungo",
        desc: "Terreno pesante, compatto",
        help: "Forma fanghiglia con la pioggia; calpestio lascia impronte.",
        image: IMG("opt-ter-argilloso.png"),
      },
      {
        value: "non_so",
        label: "Non lo so",
        desc: "Va bene — salta questo dettaglio",
        help: "",
      },
    ],
  },
  {
    id: "irrigazione",
    field: "irrigazione",
    title: "Come lo annaffi?",
    intro: "Ultima domanda sul prato: quanta acqua riceve in estate.",
    whatToDo:
      "In una settimana senza pioggia, a luglio: come lo bagni di solito? Scegli l'opzione più frequente.",
    hint: "Se hai irrigatori automatici anche solo in parte, conta come automatica.",
    options: [
      {
        value: "automatica",
        label: "Irrigazione automatica",
        desc: "Impianto o programmatore",
        help: "Tubi, pop-up, centralina.",
        image: IMG("opt-irr-auto.png"),
      },
      {
        value: "manuale",
        label: "A mano",
        desc: "Tubo, irrigatore, qualche volta",
        help: "Annaffi quando serve, senza programma fisso.",
        image: IMG("opt-irr-manuale.png"),
      },
      {
        value: "pioggia",
        label: "Quasi solo pioggia",
        desc: "Raramente intervengo",
        help: "Niente irrigazione regolare in estate.",
        image: IMG("opt-irr-pioggia.png"),
      },
      {
        value: "non_so",
        label: "Non lo so",
        desc: "Variabile / non ricordo",
        help: "",
      },
    ],
  },
  {
    id: "eta_prato",
    field: "eta_prato",
    title: "Da quanto tempo c'è questo prato?",
    intro: "Un prato nuovo si comporta diversamente da uno maturo (feltro, rinnovi, concimi).",
    whatToDo: "Scegli l'opzione più vicina alla realtà.",
    hint: "Se l'hai seminato o posato quest'anno, è «nuovo».",
    options: [
      { value: "nuovo", label: "Nuovo", desc: "Meno di 1 anno", help: "Semina o rotovatura recente." },
      { value: "1_3_anni", label: "Giovane", desc: "Tra 1 e 3 anni", help: "Già affermato ma non «vecchio»." },
      { value: "maturo", label: "Maturo", desc: "Più di 3 anni", help: "Prato consolidato, possibile feltro." },
      { value: "non_so", label: "Non lo so", desc: "Salta", help: "" },
    ],
  },
  {
    id: "obiettivo",
    field: "obiettivo",
    title: "Cosa vuoi dal prato?",
    intro: "L'obiettivo guida taglio, concimi e frequenza dei trattamenti.",
    whatToDo: "Scegli la priorità principale.",
    options: [
      {
        value: "estetico",
        label: "Bello da vedere",
        desc: "Colore uniforme, poco calpestio",
        help: "Manutenzione curata, estetica prima di tutto.",
      },
      {
        value: "resistente",
        label: "Resistente",
        desc: "Gioco, cane, passaggio",
        help: "Erba che regge usura e si riprende.",
      },
      {
        value: "bassa_manutenzione",
        label: "Poca manutenzione",
        desc: "Interventi ridotti",
        help: "Meno tagli e trattamenti possibile.",
      },
      { value: "non_so", label: "Non lo so", desc: "Deciderò dopo", help: "" },
    ],
  },
  {
    id: "frequenza_taglio",
    field: "frequenza_taglio",
    title: "Ogni quanto tagli?",
    intro: "La frequenza di taglio influenza stress, malattie e densità.",
    whatToDo: "Pensa alla stagione tipo (aprile–giugno).",
    options: [
      { value: "settimanale", label: "Ogni settimana", desc: "Circa 1 volta a settimana", help: "" },
      { value: "quindicinale", label: "Ogni 10–14 giorni", desc: "Due volte al mese", help: "" },
      { value: "raro", label: "Raramente", desc: "Meno spesso", help: "Erba che cresce molto tra un taglio e l'altro." },
      { value: "non_so", label: "Non lo so", desc: "Variabile", help: "" },
    ],
  },
  {
    id: "altezza_taglio",
    field: "altezza_taglio_cm",
    title: "A che altezza tagli di solito?",
    intro: "Tagli troppo bassi stressano il prato; troppo alti favoriscono malattie.",
    whatToDo: "Stima l'altezza residua dopo il taglio.",
    options: [
      { value: "2_3", label: "Basso (2–3 cm)", desc: "Taglio sportivo / molto corto", help: "" },
      { value: "4_5", label: "Medio (4–5 cm)", desc: "Giardino classico", help: "" },
      { value: "6_plus", label: "Alto (oltre 6 cm)", desc: "Taglio alto o poco frequente", help: "" },
      { value: "non_so", label: "Non lo so", desc: "Non misuro", help: "" },
    ],
  },
  {
    id: "animali",
    field: "animali",
    title: "Ci sono animali sul prato?",
    intro: "Cani e altri animali cambiano usura, urine e rischio parassiti.",
    whatToDo: "Scegli l'opzione principale.",
    options: [
      { value: "nessuno", label: "No", desc: "Nessun animale abituale", help: "" },
      { value: "cane", label: "Cane", desc: "Calpestio e urine", help: "" },
      { value: "altro", label: "Altri", desc: "Gatti, conigli, pollame…", help: "" },
      { value: "non_so", label: "Non lo so", desc: "—", help: "" },
    ],
  },
  {
    id: "ultimo_trattamento",
    field: "ultimo_trattamento_tipo",
    title: "Ultimo trattamento fatto",
    intro: "Evita di sovrapporre concimi o fitofarmaci troppo vicini.",
    whatToDo: "Che tipo di prodotto hai usato l'ultima volta?",
    options: [
      { value: "concime", label: "Concime", desc: "Granulare o liquido", help: "" },
      { value: "biostimolante", label: "Biostimolante", desc: "O correttivo", help: "" },
      { value: "diserbo", label: "Diserbo", desc: "Erbicida", help: "" },
      { value: "fungicida", label: "Fungicida", desc: "", help: "" },
      { value: "insetticida", label: "Insetticida", desc: "", help: "" },
      { value: "nessuno", label: "Nessuno", desc: "Non ricordo trattamenti", help: "" },
      { value: "non_so", label: "Non lo so", desc: "—", help: "" },
    ],
  },
  {
    id: "ultimo_trattamento_quando",
    field: "ultimo_trattamento_quando",
    title: "Quando l'hai fatto?",
    intro: "Serve a calibrare il prossimo intervento in calendario.",
    whatToDo: "Riferisciti all'ultimo trattamento che hai indicato.",
    skipIf: (answers) =>
      answers.ultimo_trattamento_tipo === "nessuno" || answers.ultimo_trattamento_tipo === "non_so",
    options: [
      { value: "settimana", label: "Ultima settimana", desc: "", help: "" },
      { value: "mese", label: "Ultimo mese", desc: "", help: "" },
      { value: "stagione", label: "Questa stagione", desc: "Ultimi 3–4 mesi", help: "" },
      { value: "oltre_anno", label: "Oltre un anno fa", desc: "", help: "" },
      { value: "non_so", label: "Non lo so", desc: "—", help: "" },
    ],
  },
  {
    id: "problemi_noti",
    field: "problemi_noti",
    type: "multi",
    title: "Problemi che vedi spesso",
    intro: "Anche se non compaiono in foto, ci aiutano a capire il contesto.",
    whatToDo: "Seleziona tutto ciò che riconosci (opzionale).",
    hint: "Se non hai problemi, lascia tutto deselezionato e vai avanti.",
    optional: true,
  },
];

/** Opzioni checkbox problemi noti (livello A). */
export const PROBLEMI_NOTI_OPTIONS = [
  { value: "feltro_thatch", label: "Feltro / thatch", desc: "Strato feltro sotto il verde" },
  { value: "muschio", label: "Muschio", desc: "Zone verdi chiare o feltrate" },
  { value: "calve_diradamenti", label: "Calve o zone rade", desc: "Buchi o diradamenti" },
  { value: "ingiallimento", label: "Ingiallimenti", desc: "Macchie gialle o clorosi" },
  { value: "erbacce", label: "Erbacce", desc: "Infestanti tra l'erba" },
  { value: "larve_parassiti", label: "Larve / parassiti", desc: "Danni sotto o sulla superficie" },
  { value: "funghi", label: "Sospetto funghi", desc: "Macchie circolari, fioriture" },
  { value: "ristagni_acqua", label: "Ristagni d'acqua", desc: "Acqua che resta dopo pioggia" },
];

/** Campi livello C (opzionali, step finale). */
export const ADVANCED_FIELDS = {
  pendenza: {
    label: "Pendenza del terreno",
    options: [
      { value: "piana", label: "Piano" },
      { value: "leggera", label: "Leggera pendenza" },
      { value: "marcata", label: "Pendenza marcata" },
      { value: "non_so", label: "Non lo so" },
    ],
  },
  ristagno_acqua: {
    label: "Ristagni d'acqua dopo pioggia",
    options: [
      { value: "mai", label: "Mai" },
      { value: "dopo_pioggia", label: "Solo dopo piogge forti" },
      { value: "spesso", label: "Spesso / zone sempre umide" },
      { value: "non_so", label: "Non lo so" },
    ],
  },
  ombra_zone_pct: {
    label: "Quanta superficie è spesso in ombra?",
    hint: "Alberi, muri, siepi — stima sulla superficie totale del prato.",
    options: [
      { value: "0_25", label: "0–25%" },
      { value: "25_50", label: "25–50%" },
      { value: "50_75", label: "50–75%" },
      { value: "75_100", label: "Oltre 75%" },
      { value: "non_so", label: "Non lo so" },
    ],
  },
  ph_terreno: {
    label: "pH del terreno (se lo conosci)",
    options: [
      { value: "acido", label: "Acido (< 6)" },
      { value: "neutro", label: "Neutro (circa 6–7)" },
      { value: "alcalino", label: "Alcalino (> 7)" },
      { value: "non_so", label: "Non lo so" },
    ],
  },
};

export const EXTRA_STEP = {
  title: "Ultimi dettagli",
  intro:
    "Non ti chiediamo il tipo di erba: lo riconosciamo dalla prima foto con l'intelligenza artificiale (specie botaniche, non categorie generiche).",
  whatToDo:
    "Aggiungi luogo e metri quadri del prato (obbligatori): servono per meteo, calendario e dosi di concimi/biostimolanti. Accetta il disclaimer legale per continuare.",
  localitaHint: "Città o CAP — es. Bologna, 40100",
  mqHint: "Obbligatorio — es. 120 oppure 125,5 m² (virgola per i decimali)",
  mqMapHint:
    "Apri mappa: indirizzo, contorno prato, poi «Segna zone» per irrigatori (statico/dinamico), ombra, muschio e pendenza.",
  advancedTitle: "Approfondisci il terreno (opzionale)",
  advancedIntro:
    "Questi dati migliorano concimi, drenaggio e gestione ombra. Puoi saltarli e completarli dopo da «Aggiorna profilo».",
  phValoreHint: "Se hai un valore da analisi (es. 6,5), inseriscilo qui.",
  noteTerrenoHint: "Es. carenze NPK, salinità, % sabbia/argilla da laboratorio.",
};

export const LABELS = {
  uso: {
    giardino: "Giardino",
    ornamentale: "Decorativo",
    sport: "Sportivo",
    professionale: "Professionale",
  },
  esposizione: {
    sole_pieno: "Pieno sole",
    mezzombra: "Mezz'ombra",
    ombra: "Ombra",
  },
  tipo_terreno: {
    sabbioso: "Sabbioso",
    medio: "Medio",
    argilloso: "Argilloso",
    non_so: "—",
  },
  irrigazione: {
    automatica: "Automatica",
    manuale: "Manuale",
    pioggia: "Meteorica",
    non_so: "—",
  },
  eta_prato: {
    nuovo: "Prato nuovo",
    "1_3_anni": "1–3 anni",
    maturo: "Maturo",
    non_so: "—",
  },
  obiettivo: {
    estetico: "Estetico",
    resistente: "Resistente",
    bassa_manutenzione: "Bassa manutenzione",
    non_so: "—",
  },
  frequenza_taglio: {
    settimanale: "Taglio settimanale",
    quindicinale: "Taglio 10–14 gg",
    raro: "Taglio raro",
    non_so: "—",
  },
  altezza_taglio_cm: {
    "2_3": "Taglio 2–3 cm",
    "4_5": "Taglio 4–5 cm",
    "6_plus": "Taglio alto",
    non_so: "—",
  },
  animali: {
    nessuno: "Senza animali",
    cane: "Con cane",
    altro: "Altri animali",
    non_so: "—",
  },
  pendenza: {
    piana: "Piano",
    leggera: "Pendenza leggera",
    marcata: "Pendenza marcata",
    non_so: "—",
  },
  ristagno_acqua: {
    mai: "No ristagni",
    dopo_pioggia: "Ristagni occasionali",
    spesso: "Ristagni frequenti",
    non_so: "—",
  },
  ombra_zone_pct: {
    "0_25": "Ombra 0–25%",
    "25_50": "Ombra 25–50%",
    "50_75": "Ombra 50–75%",
    "75_100": "Ombra >75%",
    non_so: "—",
  },
  ph_terreno: {
    acido: "pH acido",
    neutro: "pH neutro",
    alcalino: "pH alcalino",
    non_so: "—",
  },
};

const PROBLEMI_LABELS = Object.fromEntries(
  PROBLEMI_NOTI_OPTIONS.map((o) => [o.value, o.label]),
);

export function profileSummary(profile) {
  if (!profile) return "";
  const parts = [
    "uso",
    "esposizione",
    "tipo_terreno",
    "irrigazione",
    "eta_prato",
    "obiettivo",
    "frequenza_taglio",
    "altezza_taglio_cm",
    "animali",
  ]
    .map((k) => LABELS[k]?.[profile[k]])
    .filter((v) => v && v !== "—");
  const specie =
    profile.specie_botanica ||
    (profile.note?.match(/Specie[^:]*:\s*(.+)/)?.[1]?.trim() ?? null);
  if (specie) parts.push(specie);
  if (profile.marca_seme?.trim()) parts.push(profile.marca_seme.trim());
  const problemi = (profile.problemi_noti || [])
    .map((k) => PROBLEMI_LABELS[k])
    .filter(Boolean);
  if (problemi.length) parts.push(problemi.slice(0, 2).join(", ") + (problemi.length > 2 ? "…" : ""));
  return parts.join(" · ");
}
