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
];

export const EXTRA_STEP = {
  title: "Ultimi dettagli",
  intro:
    "Non ti chiediamo il tipo di erba: lo riconosciamo dalla prima foto con l'intelligenza artificiale (specie botaniche, non categorie generiche).",
  whatToDo:
    "Aggiungi luogo e metri quadri del prato (obbligatori): servono per meteo, calendario e dosi di concimi/biostimolanti. Accetta il disclaimer legale per continuare.",
  localitaHint: "Città o CAP — es. Bologna, 40100",
  mqHint: "Obbligatorio — es. 120 oppure 125,5 m² (virgola per i decimali)",
  mqMapHint: "Apri mappa: cerca l'indirizzo, disegna il prato e conferma — riempie luogo e m² insieme.",
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
};

export function profileSummary(profile) {
  if (!profile) return "";
  const parts = ["uso", "esposizione", "tipo_terreno", "irrigazione"]
    .map((k) => LABELS[k]?.[profile[k]])
    .filter((v) => v && v !== "—");
  const specie =
    profile.specie_botanica ||
    (profile.note?.match(/Specie[^:]*:\s*(.+)/)?.[1]?.trim() ?? null);
  if (specie) parts.push(specie);
  if (profile.marca_seme?.trim()) parts.push(profile.marca_seme.trim());
  return parts.join(" · ");
}
