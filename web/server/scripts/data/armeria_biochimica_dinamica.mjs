/**
 * Armeria biochimica dinamica Solum — interventi tattici condizionali.
 *
 * NON fanno parte del calendario base (non si applicano automaticamente ogni anno).
 * Il motore runtime (`calendarioBase.mjs` / pipeline adattiva) seleziona 0–N righe
 * quando `trigger_condizione` è soddisfatta da meteo live, vision, storico o profilo.
 *
 * Fonte concettuale: knowledge_base_raw.json (OpenAlex harvest).
 * Nessun brand commerciale.
 *
 * Blocco 1/∞ — estrazione massiva (continuare su richiesta «continua»).
 */

export const ARMERIA_BIOCHIMICA = [
  // ─── STRESS TERMICO / VPD / ET0 ───────────────────────────────────────────
  {
    trigger_condizione: "VPD > 3,5 kPa per ≥ 3 giorni consecutivi O ET0 > 5,5 mm/g",
    categoria: "biostimolante",
    titolo: "Miscela osmoprotezione GABA + prolina — crisi VPD",
    esigenze_molecolari: [
      "GABA (γ-aminobutirrico) fogliare",
      "L-prolina come osmolita",
      "Acidi fulvici come penetrativo",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Spegnere la crisi idrica fogliare quando l'aria «aspira» più acquia di quanto le radici possano rimpiazzare. 💡 LA SCIENZA: Con VPD estremo gli stomi si chiudono ma il gradiente vaporico resta violento: la pianta produce ROS nei cloroplasti. GABA modula trascrizione di geni protectivi su creeping bentgrass; la prolina stabilizza proteine denaturate. Insieme riducono il photo-inhibition senza stimolare flush azotato — segnalazione molecolare contro collasso osmotico, non concime.",
  },
  {
    trigger_condizione: "ET0 > 120% della norma climatica del mese per ≥ 5 giorni",
    categoria: "biostimolante",
    titolo: "Scavenger ROS — cascata SOD/APX/ascorbato d'emergenza",
    esigenze_molecolari: [
      "Acido ascorbico (vitamina C) fogliare",
      "Acidi fulvici con attività redox",
      "Tocoferolo o carotenoidi compatibili",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Neutralizzare il picco di radicali liberi quando l'evaporazione supera la capacità di ricarica idrica. 💡 LA SCIENZA: ROS (O₂⁻, H₂O₂, ·OH) degradano lipidi tilacoidali e il PSII. Il braccio enzimatico SOD→H₂O₂→APX rigenera l'ascorbato; il braccio non-enzimatico (ascorbato, glutatione, tocoferolo) protegge membrane. Sotto ET0 anomalo, alimentare entrambi i bracci è come inviare «spazzini» molecolari prima che la foglia perda Fv/Fm in modo irreversibile.",
  },
  {
    trigger_condizione: "Temperatura massima ≥ 32 °C per 2 giorni E umidità relativa < 40%",
    categoria: "biostimolante",
    titolo: "Stress memory HSP — richiamo trascritti trainable",
    esigenze_molecolari: [
      "Supporto antiossidante fogliare (fulvici + ascorbato)",
      "VIETATO azoto minerale ad alta dose",
      "Monitoraggio electrolyte leakage",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Amplificare la «memoria» termica se il tappeto è già stato pre-esposto, o limitare danno se è il primo ondata. 💡 LA SCIENZA: Su Festuca arundinacea, pre-acclimazione attiva transcriptional memory dei geni LMW-HSP/HMW-HSP: al secondo stress i trascritti partono da livelli più alti, PSII recupera flussi O-J-I-P, metaboloma arricchito di sucrosio e prolina. È epigenetica operativa: la pianta ricorda il caldo e risponde più in fretta — se non la sommergi di azoto che resetta il programma.",
  },
  {
    trigger_condizione: "T suolo a 10 cm > 28 °C per ≥ 4 giorni (sensore o proxy meteo)",
    categoria: "concime",
    titolo: "Potassio d'emergenza — solo K, zero azoto granulare",
    esigenze_molecolari: [
      "Potassio (K) solubile fogliare micro-dose",
      "VIETATO qualsiasi N ureico/granulare",
      "Agente umettante per assorbimento",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Regolare stomi e osmolarità senza invitare crescita succulenza in pieno stress. 💡 LA SCIENZA: Il K⁺ modula canali degli ioni negli stomi; sotto caldo il N stimola ET e tessuto tenero che amplifica traspirazione. In estate il prato deve «resistere», non «crescere»: K osmotico senza N è biochimica della sopravvivenza, non della fertilizzazione.",
  },
  {
    trigger_condizione: "Etilene endogeno elevato (foglie ingiallite, senescenza accelerata post-stress) O trapianto/shock",
    categoria: "biostimolante",
    titolo: "Crosstalk etilene vs citochinine — inversione senescenza",
    esigenze_molecolari: [
      "Estratto algale con attività citochininica",
      "Amminoacidi ramificati",
      "Acidi umici anti-senescenza",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Spostare il bilancio ormonale dalla morte programmata alla riparazione metabolica. 💡 LA SCIENZA: L'etilene è l'ormone dell'invecchiamento e della risposta al ferimento; le citochinine mantengono RuBisCO, GAPDH e integrità di membrana. Su Agrostis SAG12-ipt, picchi di CK in foglie senescenti riducono leakage e dieback radicale. Biostimolanti CK-like in crisi = guerra hormonale interna vinta dalla «giovinezza» molecolare.",
  },

  // ─── SILICIO / FITOLITI / BARRIERE FISICHE ─────────────────────────────────
  {
    trigger_condizione: "Rischio afidi/larve fogliari O trafila elevata in estate",
    categoria: "biostimolante",
    titolo: "Armatura fitolitica — silicio strutturale anti-insetto",
    esigenze_molecolari: [
      "Acido silicico / metasilicato solubile",
      "Silicio (Si) fogliare + radicale",
      "Surfattante per deposizione epidermica",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Rendere la lamina ingestibile solo a costo di consumare l'apparato boccale dell'insetto. 💡 LA SCIENZA: Il Si depositato come fitoliti (SiO₂ amorfo) irrigidisce epidermi: superfici silicee desiccano tagli microscopici e abradono mandibole. Nanomateriali silicei documentano effetti fungistatici e disidratazione di patogeni fogliari. Non è tossico: è ingegneria dei materiali sulla cuticola.",
  },
  {
    trigger_condizione: "Umidità fogliare prolungata > 10 h/notte per 3 notti (rischio fungino)",
    categoria: "biostimolante",
    titolo: "Silicio + fosfiti — barriera fisica e ISR combinata",
    esigenze_molecolari: [
      "Silicio solubile fogliare",
      "Fosfiti di potassio (ISR)",
      "VIETATO azoto che alimenta tessuto succulento",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Doppia difesa prima che il micelio penetri: barriera meccanica + priming immunitario. 💡 LA SCIENZA: I fosfiti inducono fitoalessine e barriere mesofilliche (ISR); il Si rende la cuticola ostile alla germinazione dello spora. La combo attacca sia la fisica dell'infezione sia la chimica della risposta sistemica — greenkeeper molecolare, non solo fungicida.",
  },

  // ─── ENDOFITI / ALCALOIDI / SIMBIOSI ───────────────────────────────────────
  {
    trigger_condizione: "Miscuglio seminale con endofita Epichloë/Neotyphodium documentato",
    categoria: "altro",
    titolo: "Audit simbiosi endofita — alcaloidi e gestione parassiti",
    esigenze_molecolari: [
      "Verifica ceppo: novel endophyte vs wild-type",
      "Monitoraggio afidi/larve (effetto peramine/lolitrem)",
      "VIETATO insetticida se endofita attivo e compatibile",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Sfruttare l'«esercito incorporato» senza sorprese su pascoli o cani sensibili. 💡 LA SCIENZA: Epichloë vive nei tessuti fogliari, trasmesso col seme, produce alcaloidi (peramine, lolitrem, ergovaline) neurotossici per insetti. Clavicipitaceae = ingegneri chimici con loci di alcaloidi iper-variabili. Amico contro parassiti, da gestire se animali pascolano — conoscenza del ceppo è agronomia obbligatoria.",
  },
  {
    trigger_condizione: "Infestazione afidi persistente E miscuglio endofita-free",
    categoria: "trattamento",
    titolo: "Supporto ISR + biostimolanti — compensazione assenza endofita",
    esigenze_molecolari: [
      "Fosfiti di potassio (ISR)",
      "Estratti algali con modulazione ormonale",
      "Principio attivo insetticida solo se evidenza danno (PFNPO)",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Compensare l'assenza di alcaloidi endofitici con difesa indotta e intervento mirato. 💡 LA SCIENZA: Senza Epichloë il prato perde la fabbrica di alcaloidi anti-erborivori incorporata. ISR dai fosfiti + jasmonati/SA da stress biotico attivano difesa sistemica; insetticida solo con evidenza — non sostituire una simbiosi da 10⁶ anni con spray cieco.",
  },

  // ─── FITOMELATONINA / CIRCADIANO / FREDDO ───────────────────────────────────
  {
    trigger_condizione: "Prima gelata prevista (T min < 2 °C) O gelo notturno registrato",
    categoria: "biostimolante",
    titolo: "Fitomelatonina — scavenging ROS e sincronia circadiana",
    esigenze_molecolari: [
      "Fitomelatonina fogliare (2,5–5 mM eq. campo)",
      "Applicazione fascia crepuscolare",
      "K⁺ e prolina complementari",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Preparare la cellula alla prima ondata di freddo con antiossidante e ormone del tempo vegetale. 💡 LA SCIENZA: La fitomelatonina scavenge ROS, up-regola SOD/CAT/POD e modula fotoperiodo. Studi su stress idrico: 5 mM melatonina ripristina pigmenti e osmoprotezioni. Di notte, quando scatta il gelo, la cellula ha bisogno di «veglia» biochimica — non solo coperta termica.",
  },
  {
    trigger_condizione: "Cicli gelo-disgelo ripetuti (T oscillante -2 / +8 °C)",
    categoria: "biostimolante",
    titolo: "Desaturazione lipidica — fluidità membrana d'emergenza",
    esigenze_molecolari: [
      "Prolina + zuccheri solubili fogliari",
      "Potassio (K) osmoregolante",
      "VIETATO N che rende tessuto tenero",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Impedire che le membrane esplodano osmoticamente al disgelo mattutino. 💡 LA SCIENZA: Lipidi saturi = burro in frigo; desaturasi inseriscono doppi legami = olio fluido. Gelo e siccità condividono disidratazione (cross-acclimation su Lolium/Agrostis). K⁺ e prolina favoriscono rimodellazione lipidica: compartimenti intatti fino a -5 °C.",
  },

  // ─── ALLELOPATIA / RIZOSFERA / PGPR ────────────────────────────────────────
  {
    trigger_condizione: "Picco germinazione infestanti annuali (mar–mag o set) senza barriera chimica recente",
    categoria: "diserbo",
    titolo: "Potenziamento allelopatico rizosferico — essudati radicale",
    esigenze_molecolari: [
      "Biostimolazione radicale (umici/fulvici)",
      "Estratti vegetali allelopatici compatibili",
      "Evitare N eccessivo che soffoca segnalazione",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Attivare la guerra chimica sotterranea del C3 contro semi infestanti. 💡 LA SCIENZA: Allelochemicali (fenoli, acidi organici, benzoxazinoidi in Poaceae) inibiscono germinazione altrui. Rizodeposizione massimizzata = pre-emergenza biochimico senza erbicida sintetico — il prato avvelena il letto dei competitori con i propri essudati.",
  },
  {
    trigger_condizione: "Suolo secco superficiale + rizosfera impoverita (post-estate o post-siccità)",
    categoria: "biostimolante",
    titolo: "Inoculo PGPR — biofilm EPS idro-retentivo",
    esigenze_molecolari: [
      "Consorzio PGPR (Pseudomonas / Bacillus / Azospirillum)",
      "Irrigazione leggera post-inoculo",
      "Umici come substrato per colonizzazione",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Ricostruire la «città» gelatinosa batterica che trattiene acqua e solubilizza nutrienti. 💡 LA SCIENZA: PGPR secernono IAA, fissano N₂, solubilizzano P/K, formano EPS che aumenta superficie radicale effettiva. Non è concime: è ecosistema microbico che estende l'apparato assorbente oltre la radice fisica.",
  },
  {
    trigger_condizione: "Rizosfera esposta alla luce post-scarifica o suolo nudo temporaneo",
    categoria: "biostimolante",
    titolo: "Biofilm fototrofo — O₂ e carbonio radicale",
    esigenze_molecolari: [
      "Inoculo cianobatteri / microalghe compatibili",
      "Umici come matrice di adesione",
      "Irrigazione per stabilizzare il film",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Aggiungere micro-fotosintesi alla radice appena esposta. 💡 LA SCIENZA: Biofilm fototrofi fissano CO₂, rilasciano O₂ e organici per eterotrofi nella matrice polimerica. «Prato dentro il prato» — produzione locale di energia ridotta dove la radice soffre di anossia post-scarifica.",
  },

  // ─── NANO / MICRONUTRIENTI / BLOCCHI METABOLICI ─────────────────────────────
  {
    trigger_condizione: "Stress salino (EC suolo > 4 dS/m) O irrigazione acqua salmastella",
    categoria: "concime",
    titolo: "Nano-selenio — bypass redox e K⁺/Na⁺",
    esigenze_molecolari: [
      "Nano-SeO₂ o Se nanoparticellato fogliare",
      "Agente umettante",
      "K⁺ complementare per esclusione Na⁺",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Ripristinare integrità di membrana e fotosintesi sotto shock ionico. 💡 LA SCIENZA: Se-NPs riducono O₂⁻, H₂O₂, MDA; aumentano K⁺/Na⁺, SOD/CAT/APX e clorofilla. Superficie nano penetra cuticola — corriere redox quando Na⁺ blocca pompe e enzimi.",
  },
  {
    trigger_condizione: "Clorosi intercostale / SPAD < soglia su suolo calcareo freddo",
    categoria: "concime",
    titolo: "Nano-ZnO + Fe-EDDHA — bypass assorbimento radicale bloccato",
    esigenze_molecolari: [
      "ZnO nanoparticelle fogliare micro-dose",
      "Ferro chelato Fe-EDDHA",
      "Mn complementare per PSII",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Riaccendere il ciclo di Hill quando il suolo freddo blocca Fe³⁺ e Zn²⁺. 💡 LA SCIENZA: Zn è co-fattore di decine di enzimi; Fe nel centro porfirinico. Forma nano bypassa cuticola ispessita e pH alcalino — assorbimento sub-cuticolare diretto al bersaglio enzimatico, non al suolo che non collabora.",
  },

  // ─── POLIAMMINE / GABA / RETI METABOLICHE ──────────────────────────────────
  {
    trigger_condizione: "Clorosi da degradazione clorofilla sotto caldo (Fv/Fm in calo)",
    categoria: "biostimolante",
    titolo: "Spermidina — salvaguardia tetrapirrolo e cloroplasti",
    esigenze_molecolari: [
      "Spermidina fogliare",
      "Ascorbato complementare",
      "VIETATO N ad alta dose",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Bloccare la clorofillasi e il catabolismo del tetrapirrolo. 💡 LA SCIENZA: Spd promuove uroorphyrinogen III → protoporfirina IX → clorofilla; down-regola clorofillasi; stabilizza ultrastruttura plastidiale. Su bentgrass RNA-Seq: Spd modula fotosintesi e antiossidanti sotto siccità. Guardiane del verde, non fertilizzante.",
  },
  {
    trigger_condizione: "Siccità imminente (pioggia assente 10+ giorni, ET0 alto)",
    categoria: "biostimolante",
    titolo: "Rete spermine–GABA–prolina — precablaggio osmotico",
    esigenze_molecolari: [
      "Spermine o spermidina preventiva",
      "GABA in tracce",
      "Prolina + glicina betaina",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Precablare la rete osmoprotectiva prima del crollo idrico. 💡 LA SCIENZA: Su Agrostis, spermine modula simultaneamente poliammine, GABA-shunt, prolina e metabolismo N sotto siccità. Intervento preventivo = grafo metabolico già attivo quando arriva il deficit — non rincorsa al danno.",
  },

  // ─── PATOGENI / PATOLOGIE TAPPETO ───────────────────────────────────────────
  {
    trigger_condizione: "Rischio Pythium su semina/overseeding (T suolo > 18 °C, umidità alta)",
    categoria: "trattamento",
    titolo: "Trichoderma + fosforo starter — antagonismo tellurico",
    esigenze_molecolari: [
      "Trichoderma harzianum / T. asperellum su seme/substrato",
      "P starter a basso rapporto N:P",
      "VIETATO N elevato su giovane impianto",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Proteggere il coleoptile dalla morte da Pythium nel letto caldo-umido. 💡 LA SCIENZA: Il seme germinante è buffet di zuccheri per oomiceti. Trichoderma colonizza prima, secernendo antibiotici e competendo per spazio — sincronizzazione inoculo-semina-scarifica. P basso alimenta radice senza succulenza azotata che invita Microdochium.",
  },
  {
    trigger_condizione: "Incidenza dollar spot (Sclerotinia homoeocarpa) in aumento O lesioni spot < 3 cm",
    categoria: "trattamento",
    titolo: "ISR fosfiti + umici — riduzione incidenza dollar spot",
    esigenze_molecolari: [
      "Fosfiti di potassio",
      "Acidi umici fogliari",
      "Estratto algale (SOD stimolata — studio bentgrass)",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Ridurre incidenza dollar spot senza dipendere solo da fungicida. 💡 LA SCIENZA: Su creeping bentgrass, SWE/HA hanno aumentato SOD e ridotto incidenza dollar spot in studio di campo. ISR + salute antiossidante = terreno sfavorevole per Sclerotinia — patogeno debole su tessuto metabolicamente armato.",
  },
  {
    trigger_condizione: "Umidità fogliare + T 15–25 °C (finestra Microdochium nivale)",
    categoria: "trattamento",
    titolo: "Blocco azoto succulento + potassio — anti-Microdochium",
    esigenze_molecolari: [
      "VIETATO N fogliare > 5 g/m²",
      "Potassio (K) per rigidità tessutale",
      "Fosfiti ISR complementari",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Non alimentare il fungo con tessuto tenero azotato in autunno primaverile umido. 💡 LA SCIENZA: Microdochium ama prato succulento e umido. N elevato su giovane/umido = invito al patogeno; K e ISR modulano rigidità e difesa. Gestione nutrizionale è fungicida biochimico.",
  },

  // ─── IDROFOBIA / SUOLO / IRRIGAZIONE ─────────────────────────────────────────
  {
    trigger_condizione: "Idrofobia del suolo (gocce che rotolano, WDPT > 300 s) O estate siccitale",
    categoria: "umettante",
    titolo: "Surfattante organosiliconico — rottura tensione superficiale",
    esigenze_molecolari: [
      "Surfattante organosiliconico",
      "Agente umettante non ionico",
      "Irrigazione leggera post-applicazione",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Far penetrare l'acqua in suolo che la respinge per idrofobia estiva. 💡 LA SCIENZA: Calore e materia organica ossidata creano rivestimenti idrofobici: preferential flow lascia zone arse. Surfactant abbassa angolo di contatto — acqua aderisce invece di rotolare. Riattiva matrice capillare; senza acqua nel profilo, tutta la biochimica fogliare è inutile.",
  },
  {
    trigger_condizione: "Pioggia intensa prevista entro 48 h post-trattamento fogliare",
    categoria: "umettante",
    titolo: "Rinvio o protezione — washout e aderenza cuticola",
    esigenze_molecolari: [
      "Rinvio trattamenti fogliari non essenziali",
      "Surfattante solo se necessario assorbimento rapido",
      "Priorità applicazioni radiculari",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Evitare di bruciare molecole costose con lavaggio da pioggia. 💡 LA SCIENZA: Cuticola e superficie fogliare hanno capacità di adsorbimento limitata; pioggia > 15 mm rimuove film idrofilo. La decisione tattica di posticipare è agronomia del rispetto del bilancio massa sulla lamina — non codardia, efficienza.",
  },

  // ─── EPISTRESS / PRIMING / ACIBENZOLAR ───────────────────────────────────────
  {
    trigger_condizione: "Forecast ondata di caldo (GDD 7gg > 130% norma) entro 5 giorni",
    categoria: "trattamento",
    titolo: "Priming termico leggero + antiossidanti — precondizionamento",
    esigenze_molecolari: [
      "Micro-stress controllato (irrigazione, ombra temporanea se possibile)",
      "Fulvici + ascorbato pre-ondata",
      "Monitoraggio Fv/Fm baseline",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Attivare stress memory prima dell'ondata reale. 💡 LA SCIENZA: Pre-esposizione a caldo moderato induce HSP trainable e riorganizzazione metabolica (sucrosio, acidi organici, aminoacidi). Al S2 il danno è minore. È vaccinazione vegetale — dose sbagliata brucia, dose giusta immunizza.",
  },
  {
    trigger_condizione: "Attacco erbivori/limacce in aumento E assenza endofita",
    categoria: "trattamento",
    titolo: "Silicio + estratti allelopatici — deterrente meccanico-chimico",
    esigenze_molecolari: [
      "Silicio fogliare per abrasione",
      "Estratti vegetali deterrenti compatibili",
      "Monitoraggio popolazione",
    ],
    fabbisogno_fisiologico:
      "OBIETTIVO: Rendere il prato sgradevole da mangiare senza biocida largo spettro. 💡 LA SCIENZA: Fitoliti abrasivi + allelochemicali fogliari/radicali modificano scelta dell'erborivoro. Deterrenza multisensoriale — texture + chimica — prima del danno visibile.",
  },
];

/** Alias per import runtime */
export const INTERVENTI_TATTICI = ARMERIA_BIOCHIMICA;

/** Raggruppa per tipo di trigger (utility runtime) */
export const TRIGGER_TYPES = {
  METEO: [
    "VPD",
    "ET0",
    "Temperatura",
    "gelata",
    "gelo",
    "GDD",
    "pioggia",
    "siccità",
    "umidità fogliare",
  ],
  PATOGENO: [
    "Pythium",
    "dollar spot",
    "Microdochium",
    "fungino",
    "patogen",
  ],
  SUOLO: ["idrofobia", "EC", "rizosfera", "salino"],
  PROFILO: ["endofita", "miscuglio", "SPAD", "clorosi"],
};

export default ARMERIA_BIOCHIMICA;
