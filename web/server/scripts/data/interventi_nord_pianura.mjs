/**

 * Calendario base anno tipo — nord_pianura (C3, pianura padana).

 * Livello greenkeeper: fisiologia avanzata, spoon-feeding, ISR, osmoprozione.

 * fabbisogno_fisiologico: divulgazione biochimica (fonte: knowledge_base_raw.json / OpenAlex).
 * 59 interventi anno tipo — base / pro / greenkeeper (magie oscure incluse).

 * Nessun brand commerciale.

 */



export const INTERVENTI_NORD_PIANURA = [

  // ─── FEBBRAIO ─────────────────────────────────────────────────────────────

  {

    livello_impegno: "base",

    mese: 2,

    giorno_mese: 12,

    categoria: "concime",

    priorita: "media",

    titolo: "Correzione ferrica pre-fotosintesi primaverile",

    fabbisogno_fisiologico:

      "OBIETTIVO: Ripristinare il verde intenso del tappeto prima che la luce primaverile esploda, correggendo la clorosi ferrica tipica dei suoli freddi e calcarei. 💡 LA SCIENZA: Con T suolo bassa, il Fe³⁺ non viene ridotto efficientemente dalle reduttasi radicali: la sintesi di clorofilla si blocca nel ciclo di Hill del fotosistema II. Il ferro chelato (Fe-EDDHA) bypassa questo collo di bottiglia, reintegrando il centro magnesio-porfirina e ripristinando il turgore cellulare e l'assorbimento del PAR — come accendere di nuovo le «fabbriche di luce» fogliari.",

    esigenze_molecolari: [

      "Ferro chelato Fe-EDDHA (orto-orto) — assorbimento radicale e fogliare",

      "Monitoraggio SPAD / clorosi intercostale su Lolium perenne",

    ],

    macro_categoria: "Correttivo",

    finestra_shift_giorni: 14,

    ordine: 100,

  },

  {

    livello_impegno: "pro",

    mese: 2,

    giorno_mese: 22,

    categoria: "concime",

    priorita: "media",

    titolo: "Complesso microelementi e Mn per enzimi clorofilliani",

    fabbisogno_fisiologico:

      "OBIETTIVO: Sbloccare la fotosintesi su suoli calcarei dove il prato è «verde stanco», integrando i co-fattori metallici mancanti. 💡 LA SCIENZA: Il Mn è indispensabile per lo scissione dell'acqua nel PSII; lo Zn stabilizza le proteine della membrana tilacoidale. Senza questi ioni, si accumula photo-inhibition: la pianta assorbe luce ma non la converte in zuccheri. I microelementi chelati ripristinano l'efficienza quantica (Fv/Fm) prima del picco di crescita primaverile.",

    esigenze_molecolari: [

      "Manganese (Mn) e Zinco (Zn) chelati",

      "Boro (B) se tessuti meristematici compatti",

    ],

    macro_categoria: "Correttivo",

    finestra_shift_giorni: 12,

    ordine: 110,

  },



  // ─── MARZO ──────────────────────────────────────────────────────────────────

  {

    livello_impegno: "base",

    mese: 3,

    giorno_mese: 6,

    categoria: "diserbo",

    priorita: "alta",

    titolo: "Barriera antigerminativa annuali primaverili",

    fabbisogno_fisiologico:

      "OBIETTIVO: Impedire che Digitaria e Setaria competano per luce e azoto nel momento in cui il C3 riprende a crescere. 💡 LA SCIENZA: I germinanti annuali devono assemblare microtubuli per la prima divisione cellulare della radice. Pendimetalin e Propyzamide bloccano la polimerizzazione del tubulina: la cellula «muore da fermo» senza disturbare il rizoma del prato già installato — una barriera biochimica prima del picco GDD di competizione.",

    esigenze_molecolari: [

      "Pendimetalin (inibizione microtubuli)",

      "Propyzamide se T suolo < 12 °C persistente (solo PFNPO)",

    ],

    macro_categoria: "Diserbante",

    finestra_shift_giorni: 10,

    ordine: 200,

  },

  {

    livello_impegno: "pro",

    mese: 3,

    giorno_mese: 14,

    categoria: "arieggiatura",

    priorita: "media",

    titolo: "Decompattazione superficiale pre-picco vegetativo",

    fabbisogno_fisiologico:

      "OBIETTIVO: Ridare ossigeno alle radici che escono dal letargo e accelerare il drenaggio del primo strato. 💡 LA SCIENZA: Suolo compattato = bassa diffusività di O₂: le radici passano dalla respirazione aerobica a quella anaerobica, con perdita di ATP e assorbimento ridotto di N e P. L'arieggiatura abbassa la densità apparente e riapre i pori capillari: è come «ventilare» il polmone sotterraneo del tappeto prima del boom metabolico.",

    esigenze_molecolari: [

      "Arieggiatura verticale 2–3 cm",

      "Rimozione feltro se indice > 1,5 cm",

    ],

    macro_categoria: "Altro",

    finestra_shift_giorni: 12,

    ordine: 210,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 3,

    giorno_mese: 10,

    categoria: "arieggiatura",

    priorita: "alta",

    titolo: "Scarifica profonda + inoculo Trichoderma e micorrize",

    fabbisogno_fisiologico:

      "OBIETTIVO: Ricostruire una rizosfera viva subito dopo la scarifica, colonizzando le radici esposte con alleati simbiotici. 💡 LA SCIENZA: Le piante secernono essudati radicali (zuccheri, acidi organici) che reclutano PGPR e micorrize arbuscolari (AMF): in cambio ricevono fosforo mobilizzato e protezione da patogeni tellurici. Trichoderma compete per spazio e nutrizione con Pythium; Glomus penetra la corteccia radicale formando arbuscoli — un «mercato sotterraneo» che amplifica l'assorbimento idrico e minerale.",

    esigenze_molecolari: [

      "Scarifica / svasatura 3–5 cm",

      "Inoculo Trichoderma harzianum / T. asperellum",

      "Inoculo micorrize endo (Glomus spp.) su apparato radicale esposto",

      "Acidi fulvici come vettore di adesione al rizosfera",

    ],

    macro_categoria: "Altro",

    finestra_shift_giorni: 10,

    ordine: 220,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 3,

    giorno_mese: 24,

    categoria: "concime",

    priorita: "alta",

    titolo: "Azoto a rilascio controllato modulato su rapporto C/N",

    fabbisogno_fisiologico:

      "OBIETTIVO: Avviare la ripresa vegetativa senza picchi di ammoniaca che bruciano le radici o alimentano solo i muschi. 💡 LA SCIENZA: L'N a rilascio controllato (IBDU/urea rivestita) si mineralizza in sincronia con la temperatura del suolo e il rapporto C/N: i microbi scompongono la materia organica e rilasciano NH₄⁺ solo quando l'apparato radicale può assorbirlo. Migliora la NUE (Nitrogen Use Efficiency): meno perdite per lisciviazione, più N convertito in aminoacidi e enzimi come la nitrito reduttasi del ciclo dell'azoto.",

    esigenze_molecolari: [

      "Azoto (N) IBDU / ureico rivestito — 12–16 g/m² N totale",

      "Rapporto C/N suolo considerato prima del split successivo",

      "VIETATO urea non stabilizzata su prato sottile",

    ],

    macro_categoria: "N",

    finestra_shift_giorni: 12,

    ordine: 230,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 3,

    giorno_mese: 28,

    categoria: "concime",

    priorita: "media",

    titolo: "Spoon-feeding fogliare N + Mg (ciclo 1/8)",

    fabbisogno_fisiologico:

      "OBIETTIVO: Nutrire la lamina fogliare a micro-dosi, evitando flush vegetativo e burn da salinità della solution. 💡 LA SCIENZA: Lo spoon-feeding mantiene il potenziale osmotico fogliare senza saturare il suolo di sali: il Mg²⁺ occupa il centro del anello porfirinico della clorofilla. È nutrizione chirurgica — piccole quantità, alta frequenza — che imita il «drip metabolico» dei greenkeeper professionisti.",

    esigenze_molecolari: [

      "Nitrato di ammonio solubile in dose micro (spoon-feeding)",

      "Magnesio (Mg) come centro porfirinico",

      "Volume solution 400–600 L/ha equivalente",

    ],

    macro_categoria: "N",

    finestra_shift_giorni: 5,

    ordine: 235,

  },



  // ─── APRILE ─────────────────────────────────────────────────────────────────

  {

    livello_impegno: "base",

    mese: 4,

    giorno_mese: 8,

    categoria: "concime",

    priorita: "alta",

    titolo: "Concimazione azotata a lenta cessione — spinta C3",

    fabbisogno_fisiologico:

      "OBIETTIVO: Massimizzare la densità del tappeto e la LAI durante la finestra di crescita esponenziale del C3. 💡 LA SCIENZA: In aprile la pianta opera a massima assimilazione netta: CO₂ fissato nel ciclo di Calvin diventa amidi e proteine strutturali. L'azoto a lenta cessione alimenta la sintesi di RuBisCO e nuove cellule meristematiche senza picco osmotico che richiuderebbe gli stomi — crescita potente ma controllata.",

    esigenze_molecolari: [

      "Azoto (N) a lenta cessione — 18–22 g/m² N equivalente",

      "Split se pioggia intensa prevista entro 48 h",

    ],

    macro_categoria: "N",

    finestra_shift_giorni: 12,

    ordine: 300,

  },

  {

    livello_impegno: "pro",

    mese: 4,

    giorno_mese: 4,

    categoria: "biostimolante",

    priorita: "media",

    titolo: "Biostimolazione rizosferica post-inverno",

    fabbisogno_fisiologico:

      "OBIETTIVO: Risvegliare la rizosfera dopo l'inverno e migliorare l'assorbimento di nutrienti legati al suolo. 💡 LA SCIENZA: Gli acidi umici aumentano la CEC radicale e modulano l'espressione genica legata allo stress; i fulvici migliorano la fluidità delle membrane plasmatiche, facilitando l'ingresso di ioni. Sul bentgrass da studio, applicazioni liquide di humati stimolano crescita e recupero post-inverno: la pianta passa da metabolismo prevalentemente respiratorio ad assimilatorio con maggiore efficienza di captazione.",

    esigenze_molecolari: [

      "Acidi umici (humati)",

      "Acidi fulvici — aumento permeabilità membrana plasmatica",

      "Estratti algali (cytokinin-like activity opzionale)",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 10,

    ordine: 310,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 4,

    giorno_mese: 18,

    categoria: "arieggiatura",

    priorita: "alta",

    titolo: "Aerazione + topdressing sabbia per porosità",

    fabbisogno_fisiologico:

      "OBIETTIVO: Eliminare lo strato compatto superficiale e creare una matrice minerale che regge il traffico senza asfissiare le radici. 💡 LA SCIENZA: Il core aeration inserisce canali di aria nel profilo; la sabbia topdressing stabilizza i pori macropori contro il collasso. L'acqua infiltrata raggiunge le radici profonde invece di evaporare in superficie — un «scaffold» fisico che ottimizza l'interfaccia suolo-atmosfera e l'ancoraggio radicale sotto calpestio.",

    esigenze_molecolari: [

      "Core aeration 2,5–4 cm",

      "Topdressing sabbia quarzifera 0,5–1,5 mm — 1–2 L/m²",

      "Integrazione acidi fulvici nel riempimento dei fori",

    ],

    macro_categoria: "Altro",

    finestra_shift_giorni: 14,

    ordine: 320,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 4,

    giorno_mese: 26,

    categoria: "concime",

    priorita: "media",

    titolo: "Spoon-feeding fogliare N + S (ciclo 2/8)",

    fabbisogno_fisiologico:

      "OBIETTIVO: Sostenere la sintesi proteica durante la crescita verticale senza eccedere in azoto. 💡 LA SCIENZA: Lo zolfo è componente dei aminoacidi cisteina e metionina: senza S, le proteine strutturali e gli enzimi antiossidanti (glutathione) non si formano. Il micro-apporto fogliare di N+S in fase di espansione fogliare mantiene il «motore proteico» attivo con EC della solution controllata (< 1,2 mS/cm).",

    esigenze_molecolari: [

      "N solubile micro-dose",

      "Zolfo (S) solfato solubile",

      "Monitoraggio EC del solution < 1,2 mS/cm",

    ],

    macro_categoria: "N",

    finestra_shift_giorni: 5,

    ordine: 325,

  },



  // ─── MAGGIO ─────────────────────────────────────────────────────────────────

  {

    livello_impegno: "pro",

    mese: 5,

    giorno_mese: 4,

    categoria: "trattamento",

    priorita: "alta",

    titolo: "Induzione resistenza sistemica — fosfiti di potassio",

    fabbisogno_fisiologico:

      "OBIETTIVO: Immunizzare metabolicamente il tappeto prima delle notti umide che favoriscono oomiceti e patogeni foliar. 💡 LA SCIENZA: I fosfiti non nutrono come i fosfati: agiscono come elicitori dell'ISR (Induced Systemic Resistance). La pianta accumula fitoalessine e rinforza le barriere mesofilliche — come un «addestramento» immunitario senza infezione reale. È prevenzione biochimica, non solo veleno per il fungo.",

    esigenze_molecolari: [

      "Fosfiti di potassio (K₂HPO₃ / KH₂PO₃) — ISR",

      "Potassio (K) complementare per osmoregolazione",

      "Applicazione preventiva pre-umidità fogliare prolungata",

    ],

    macro_categoria: "Fungicida",

    finestra_shift_giorni: 10,

    ordine: 400,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 5,

    giorno_mese: 2,

    categoria: "trattamento",

    priorita: "alta",

    titolo: "Programma ISR fosfiti + micronutrienti fogliari",

    fabbisogno_fisiologico:

      "OBIETTIVO: Combinare immunità sistemica e ottimizzazione enzimatica prima dello stress estivo. 💡 LA SCIENZA: L'ISR dai fosfiti attiva cascate di segnalazione (acido salicilico, jasmonati); Mn, Zn e B sono co-fattori di decine di enzimi del ciclo di Krebs e della difesa ossidativa. I fulvici fungono da penetrativi: due fronti — difesa immunitaria e efficienza metabolica — in un'unica finestra fisiologica.",

    esigenze_molecolari: [

      "Fosfiti di potassio — 2–3 L/ha equivalente acido fosforoso",

      "Mn, Zn, B in miscela compatibile",

      "Acidi fulvici come coadiuvante di penetrazione",

    ],

    macro_categoria: "Fungicida",

    finestra_shift_giorni: 8,

    ordine: 405,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 5,

    giorno_mese: 16,

    categoria: "biostimolante",

    priorita: "media",

    titolo: "Spoon-feeding amminoacidi ramificati + biostimolanti",

    fabbisogno_fisiologico:

      "OBIETTIVO: Riparare il tessuto fogliare danneggiato dal traffico e preparare le proteine di stress. 💡 LA SCIENZA: Leucina, isoleucina e valina sono precursori diretti della biosintesi proteica e modulatori del metabolismo del carbonio sotto calpestio. Invece di mobilizzare le proteine di riserva, la pianta riceve «mattoni» pronti: riduce il catabolismo fogliare e mantiene l'integrità del PSII quando il prato è più sollecitato meccanicamente.",

    esigenze_molecolari: [

      "Amminoacidi liberi (L-leucina, L-isoleucina, L-valina)",

      "Acidi umici / fulvici in solution",

      "Spoon-feeding — ciclo 3/8",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 5,

    ordine: 415,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 5,

    giorno_mese: 28,

    categoria: "concime",

    priorita: "media",

    titolo: "Spoon-feeding K + Ca fogliare pre-stress estivo",

    fabbisogno_fisiologico:

      "OBIETTIVO: Precondizionare stomi e pareti cellulari prima dell'arrivo di ET0 e VPD elevati. 💡 LA SCIENZA: Il K⁺ regola l'apertura stomatica: senza potassio, gli stomi non rispondono correttamente alla luce. Il Ca²⁺ stabilizza i fosfolipidi di membrana contro la disorganizzazione da calore. È un «allenamento osmotico» pre-estate: rafforzi le difese prima che il termometro le metta alla prova.",

    esigenze_molecolari: [

      "Potassio (K) nitrato solubile — dose micro",

      "Calcio (Ca) solubile per stabilità membrana",

      "VIETATO N ad alta dose se ET0 in aumento",

    ],

    macro_categoria: "K",

    finestra_shift_giorni: 7,

    ordine: 420,

  },



  // ─── GIUGNO — nessun N granulare ────────────────────────────────────────────

  {

    livello_impegno: "base",

    mese: 6,

    giorno_mese: 6,

    categoria: "concime",

    priorita: "alta",

    titolo: "Potassio antistress pre-picco ET0",

    fabbisogno_fisiologico:

      "OBIETTIVO: Preparare il prato al picco evaporativo estivo senza stimolare succulenza azotata. 💡 LA SCIENZA: In giugno l'ET0 sale e la pianta rischia chiusura stomatica parziale: il K⁺ modula i canali ionici delle cellule di guardia, bilanciando idratazione e CO₂. Vietare N granulare evita growth flush che aumenta la traspirazione — passi dal «crescere» al «resistere» con osmoregolazione potassica.",

    esigenze_molecolari: [

      "Potassio (K) solfato o solubile — 12–18 g/m² K₂O equivalente",

      "VIETATO azoto granulare o ureico",

    ],

    macro_categoria: "K",

    finestra_shift_giorni: 10,

    ordine: 500,

  },

  {

    livello_impegno: "pro",

    mese: 6,

    giorno_mese: 14,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Acidi fulvici fogliari — efficienza assimilatoria",

    fabbisogno_fisiologico:

      "OBIETTIVO: Mantenere la fotosintesi efficiente sotto PAR elevato e caldo. 💡 LA SCIENZA: I fulvici aumentano la permeabilità cuticolare e modulano la conduttanza stomatica: più CO₂ fissato per mm di H₂O perso (migliore WUE). Su bentgrass, humati/fulvati migliorano qualità del tappeto sotto stress: ottimizzano la quota di radiazione utilizzata (RUE) quando la luce è abbondante ma l'acqua è il fattore limitante.",

    esigenze_molecolari: [

      "Acidi fulvici purificati — applicazione fogliare",

      "Accompagnamento con agente umettante se cuticola ispessita",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 8,

    ordine: 510,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 6,

    giorno_mese: 4,

    categoria: "concime",

    priorita: "alta",

    titolo: "Spoon-feeding K + silicio solubile (ciclo 4/8)",

    fabbisogno_fisiologico:

      "OBIETTIVO: Indurire la lamina fogliare e ridurre la traspirazione cuticolare prima dello stress. 💡 LA SCIENZA: Il silicio assorbito viene depositato come fitoliti (SiO₂ amorfo) extra- e intracellularmente — una «armatura di vetro» che irrigidisce epidermi e pareti. I paper su nanomateriali silicei documentano effetti fungistatici (disidratazione del micelio) e abrasione dell'apparato boccale degli insetti. Combinato al K⁺ osmoregolante, è doppia difesa fisica e osmotica.",

    esigenze_molecolari: [

      "Potassio (K) micro-dose",

      "Acido silicico / metasilicato solubile",

      "Silicio (Si) come barriera fisica a patogeni fogliari",

    ],

    macro_categoria: "K",

    finestra_shift_giorni: 5,

    ordine: 515,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 6,

    giorno_mese: 20,

    categoria: "umettante",

    priorita: "alta",

    titolo: "Surfattante anti-idrofobia del profilo",

    fabbisogno_fisiologico:

      "OBIETTIVO: Far penetrare l'acqua di irrigazione in un suolo che «respinge» l'umidità per idrofobia estiva. 💡 LA SCIENZA: Calore e materia organica ossidata creano rivestimenti idrofobici sui grumi: l'acqua scivola via (preferential flow) lasciando zone arse. I surfattanti abbassano la tensione superficiale del gocciolino d'irrigazione, come sapone sulla cera: riattivano la matrice capillare e uniformano l'idratazione radicale.",

    esigenze_molecolari: [

      "Agente umettante non ionico (organosiliconi o polialcoli)",

      "Surfattante per migliorare wettability del suolo",

      "Irrigazione leggera post-applicazione per lavaggio stomatico",

    ],

    macro_categoria: "Bagnante",

    finestra_shift_giorni: 7,

    ordine: 520,

  },



  // ─── LUGLIO — stress ossidativo, GABA, proline, no N ────────────────────────

  {

    livello_impegno: "base",

    mese: 7,

    giorno_mese: 6,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Osmoprotezione e mitigazione stress ossidativo",

    fabbisogno_fisiologico:

      "OBIETTIVO: Proteggere le membrane fogliari dal caldo estremo senza stimolare crescita azotata. 💡 LA SCIENZA: Con ET0 alta, cloroplasti e mitocondri producono ROS (O₂⁻, H₂O₂) che degradano lipidi e proteine del PSII. Prolina e fulvici agiscono come osmoliti e co-antiossidanti: la prolina stabilizza strutture proteiche; il sistema enzimatico (SOD, APX) viene supportato — «spazzini molecolari» contro i radicali liberi.",

    esigenze_molecolari: [

      "Acidi fulvici fogliari",

      "Prolina (osmolita compatibile)",

      "VIETATO N minerale",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 7,

    ordine: 600,

  },

  {

    livello_impegno: "pro",

    mese: 7,

    giorno_mese: 4,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Miscela antistress + umettante per penetrazione fogliare",

    fabbisogno_fisiologico:

      "OBIETTIVO: Far entrare gli osmoliti nella foglia quando VPD e cuticola ispessita bloccano l'assorbimento. 💡 LA SCIENZA: Sotto ET0 estremo gli stomi si chiudono: senza umettante, la solution resta sulla cuticola. Umici/fulvici + glicina betaina e prolina, penetrati grazie al surfattante, ripristinano il potenziale idrico fogliare e modulano l'ABA endogeno — segnalazione chimica contro la disidratazione.",

    esigenze_molecolari: [

      "Acidi umici + fulvici",

      "Agente umettante / penetrante",

      "Prolina e glicina betaina",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 6,

    ordine: 610,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 7,

    giorno_mese: 2,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "GABA + prolina — modulazione stress abiotico",

    fabbisogno_fisiologico:

      "OBIETTIVO: Attivare la risposta molecolare al caldo e alla siccità sul creeping bentgrass. 💡 LA SCIENZA: Il GABA (acido γ-aminobutirrico) non è solo neurotrasmettitore animale: nelle graminacee modula trascrizione di geni protectivi e si lega al metabolismo di poliammine e prolina. Studi su Agrostis stolonifera mostrano maggiore tolleranza a caldo/siccità con GABA exogeno — la pianta «ricorda» come sopravvivere abbassando ROS e stabilizzando il PSII.",

    esigenze_molecolari: [

      "GABA (γ-aminobutirrico) fogliare",

      "L-prolina come osmolita",

      "Trehalosio opzionale per stabilizzazione proteica",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 5,

    ordine: 620,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 7,

    giorno_mese: 12,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Scavenger ROS — ascorbato e antiossidanti fogliari",

    fabbisogno_fisiologico:

      "OBIETTIVO: Neutralizzare il cocktail ossidativo prodotto dai cloroplasti sotto stress termico. 💡 LA SCIENZA: La cascata antiossidante prevede SOD → H₂O₂ → ascorbato perossidasi (APX) che rigenera l'acido ascorbico. Applicare ascorbato fogliare e fulvici redox alimenta il braccio non-enzimatico insieme a carotenoidi e tocoferolo: proteggi i lipidi tilacoidali e il centro reazione del PSII dalla perossidazione — spegni l'incendio molecolare prima che la foglia «bruci» visivamente.",

    esigenze_molecolari: [

      "Acido ascorbico (vitamina C) fogliare",

      "Acidi fulvici con attività redox",

      "Carotenoidi / tocoferolo in formulazioni compatibili",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 5,

    ordine: 625,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 7,

    giorno_mese: 22,

    categoria: "concime",

    priorita: "media",

    titolo: "Spoon-feeding K micronizzato (ciclo 5/8)",

    fabbisogno_fisiologico:

      "OBIETTIVO: Sostenere l'equilibrio ionico fogliare a luglio senza un grammo di azoto. 💡 LA SCIENZA: Il K⁺ è il controione principale per la regolazione osmotica: sostituisce il ruolo «osmotico» del Na⁺ senza tossicità. Micro-dosi fogliari mantengono turgor e apertura stomatica parziale per la fotosintesi residua — nutrizione minima, massima precisione, zero flush azotato che esploderebbe il VPD.",

    esigenze_molecolari: [

      "K nitrato o solfato solubile — micro-dose",

      "VIETATO qualsiasi fonte N",

    ],

    macro_categoria: "K",

    finestra_shift_giorni: 5,

    ordine: 630,

  },



  // ─── AGOSTO ─────────────────────────────────────────────────────────────────

  {

    livello_impegno: "pro",

    mese: 8,

    giorno_mese: 6,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Rinforzo antiossidante e ripristino turgore",

    fabbisogno_fisiologico:

      "OBIETTIVO: Recuperare turgore e funzionalità fotosintetica nel secondo picco di caldo estivo. 💡 LA SCIENZA: Le HSP (Heat Shock Proteins) sono «cuffie molecolari» che ripiegano proteine denaturate dal calore. Amminoacidi ramificati e prolina supportano la sintesi proteica di riparazione; fulvici migliorano l'assorbimento. Sul festuca, lo stress memory delle HSP può accelerare la risposta al secondo episodio caldo — la pianta impara dall'esperienza.",

    esigenze_molecolari: [

      "Acidi fulvici + amminoacidi ramificati",

      "Prolina in solution",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 7,

    ordine: 700,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 8,

    giorno_mese: 3,

    categoria: "umettante",

    priorita: "alta",

    titolo: "Surfattante + umettante — idrofobia estiva",

    fabbisogno_fisiologico:

      "OBIETTIVO: Garantire che irrigazione e trattamenti fogliari bagnino uniformemente sotto irraggiamento intenso. 💡 LA SCIENZA: L'idrofobia del suolo e la cuticola cerosa della foglia condividono lo stesso nemico: alta tensione superficiale. Gli organosiliconi riducono l'angolo di contatto della goccia — l'acqua si «appiccica» invece di rotolare via. Applicare al mattino (VPD minimo) massimizza infiltrazione e assorbimento prima che il sole chiuda gli stomi.",

    esigenze_molecolari: [

      "Surfattante organosiliconico",

      "Agente umettante per solution a bassa tensione superficiale",

      "Applicazione nelle prime ore del mattino (VPD minimo)",

    ],

    macro_categoria: "Bagnante",

    finestra_shift_giorni: 6,

    ordine: 710,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 8,

    giorno_mese: 18,

    categoria: "biostimolante",

    priorita: "media",

    titolo: "Spoon-feeding biostimolanti + K (ciclo 6/8)",

    fabbisogno_fisiologico:

      "OBIETTIVO: Preparare metabolicamente il passaggio estate–autunno senza crescita vegetativa indotta da N. 💡 LA SCIENZA: Tracce di GABA modulano ancora il segnale di stress residuo; umici/fulvici mantengono attivo il metabolismo radicale in declino termico. Il K⁺ stabilizza i pool di zuccheri solubili fogliari: la pianta smette di «crescere» e inizia a riorganizzare le riserve per la ripresa autunnale.",

    esigenze_molecolari: [

      "Acidi umici / fulvici",

      "K solubile micro-dose",

      "GABA in tracce per modulazione stress residuo",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 5,

    ordine: 715,

  },



  // ─── SETTEMBRE — finestra metabolica overseeding ────────────────────────────

  {

    livello_impegno: "base",

    mese: 9,

    giorno_mese: 8,

    categoria: "arieggiatura",

    priorita: "alta",

    titolo: "Scarifica e preparazione letto di semina",

    fabbisogno_fisiologico:

      "OBIETTIVO: Creare il letto ideale per la germinazione autunnale del nuovo seme. 💡 LA SCIENZA: In settembre T suolo e umidità riattivano enzimi (amilasi, proteasi) nel seme e nell'apparato radicale esistente. Rimuovere feltro e debris libera O₂ e contatto seme-suolo: la germinazione è un'esplosione metabolica che richiede respirazione aerobica — senza scarifica, il coleoptile muore annegato nella matrice organica.",

    esigenze_molecolari: [

      "Scarifica profonda",

      "Rimozione feltro e debris organico",

    ],

    macro_categoria: "Altro",

    finestra_shift_giorni: 10,

    ordine: 800,

  },

  {

    livello_impegno: "base",

    mese: 9,

    giorno_mese: 16,

    categoria: "rinnovo",

    priorita: "alta",

    titolo: "Overseeding C3 — densificazione",

    fabbisogno_fisiologico:

      "OBIETTIVO: Ripopolare il tappeto nella finestra termica ottimale per Lolium e Festuca. 💡 LA SCIENZA: Il C3 autunnale germina con Q₁₀ ottimale tra 10–22 °C: imbibizione → attivazione mRNA per enzimi della mobilizzazione del riserva → divisione cellulare radicale. Overseeding in questa finestra sfrutta suolo ancora caldo e giornate più corte che riducono lo stress post-emergenza — massima probabilità di establishment prima del freddo.",

    esigenze_molecolari: [

      "Seme C3 — 30–45 g/m²",

      "Fosforo starter a basso rapporto N:P",

    ],

    macro_categoria: "Semente",

    finestra_shift_giorni: 8,

    ordine: 810,

  },

  {

    livello_impegno: "pro",

    mese: 9,

    giorno_mese: 4,

    categoria: "concime",

    priorita: "alta",

    titolo: "Fosforo per radicazione e riserve",

    fabbisogno_fisiologico:

      "OBIETTIVO: Alimentare la costruzione di nuove radici e meristemi in autunno. 💡 LA SCIENZA: Il P è elemento chiave dell'ATP: senza fosforo, la respirazione ossidativa e la sintesi di acidi nucleici si fermano. In overseeding, il P starter spinge la crescita radicale primaria che ancora il seme al suolo — è «energia in bottiglia» per la fase più vulnerabile del ciclo vitale.",

    esigenze_molecolari: [

      "Fosforo (P) solubile o MAP — 15–20 g/m² P₂O₅ equivalente",

      "Micorrize inoculo su area seminata",

    ],

    macro_categoria: "P",

    finestra_shift_giorni: 12,

    ordine: 820,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 9,

    giorno_mese: 6,

    categoria: "concime",

    priorita: "alta",

    titolo: "Finestra metabolica P + chelati Fe per fotosintesi",

    fabbisogno_fisiologico:

      "OBIETTIVO: Sincronizzare radicazione profonda e massima efficienza fotosintetica post-germinazione. 💡 LA SCIENZA: Il Fe è catalizzatore della sintesi di clorofilla e componente dei citocromi della catena di trasporto elettronico. P + Fe-EDDHA in autunno = radici che esplorano il profilo e foglie che convertono il PAR autunnale (ancora intenso) in zuccheri per il giovane impianto — doppio investimento bioenergetico.",

    esigenze_molecolari: [

      "Fosforo (P) elevato pre-overseeding",

      "Ferro chelato Fe-EDDHA fogliare post-germinazione",

      "Acidi fulvici per chelazione endogena",

    ],

    macro_categoria: "P",

    finestra_shift_giorni: 10,

    ordine: 830,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 9,

    giorno_mese: 14,

    categoria: "rinnovo",

    priorita: "alta",

    titolo: "Overseeding ad alta densità + Trichoderma su seme",

    fabbisogno_fisiologico:

      "OBIETTIVO: Proteggere il giovane impianto da Pythium e competizione fungina nel letto appena aperto. 💡 LA SCIENZA: Il seme germinante è un buffet di zuccheri per patogeni tellurici. Trichoderma colonizza prima il rizosfera, secernendo antibiotici e competendo per spazio. Sincronizzare scarifica-semina-inoculo crea un «corridoio biologico» protetto: il C3 si stabilisce mentre i fungini patogeni restano fuori gioco.",

    esigenze_molecolari: [

      "Miscuglio C3 selezionato per traffico",

      "Trichoderma spp. su seme / substrato",

      "P starter 1-34-0 o equivalente a basso N",

    ],

    macro_categoria: "Semente",

    finestra_shift_giorni: 8,

    ordine: 835,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 9,

    giorno_mese: 26,

    categoria: "concime",

    priorita: "media",

    titolo: "Spoon-feeding N + P post-germinazione (ciclo 7/8)",

    fabbisogno_fisiologico:

      "OBIETTIVO: Sostenere il giovane meristema senza favorire Microdochium con eccesso di succulenza. 💡 LA SCIENZA: Il giovane tessuto ha bisogno di N per sintesi proteica e di P per ATP, ma dosi micro evitano il «tall fescue syndrome» da over-fertilization autunnale: troppo N = tessuto tenero, più suscettibile a patogeni criofili. Spoon-feeding post-germinazione è chirurgia nutrizionale per il plantule stage.",

    esigenze_molecolari: [

      "N micro-dose + P solubile",

      "VIETATO N > 5 g/m² in singola applicazione",

    ],

    macro_categoria: "N",

    finestra_shift_giorni: 5,

    ordine: 840,

  },



  // ─── OTTOBRE / NOVEMBRE — riserve glucidiche ────────────────────────────────

  {

    livello_impegno: "base",

    mese: 10,

    giorno_mese: 6,

    categoria: "concime",

    priorita: "alta",

    titolo: "Azoto autunnale a lenta cessione",

    fabbisogno_fisiologico:

      "OBIETTIVO: Ripresa vegetativa autunnale verde intenso senza tessuto troppo tenero. 💡 LA SCIENZA: L'N autunnale alimenta sintesi di clorofilla e proteine quando la temperatura scende gradualmente: la pianta ricostruisce LAI perso in estate. Lenta cessione evita picco di succulenza — bilanciamento tra crescita e resistenza a patogeni autunnali che amano zuccheri solubili e tessuto morbido.",

    esigenze_molecolari: [

      "Azoto (N) IBDU / slow release — 14–18 g/m² N",

      "Integrazione K se estate secca",

    ],

    macro_categoria: "N",

    finestra_shift_giorni: 12,

    ordine: 900,

  },

  {

    livello_impegno: "pro",

    mese: 10,

    giorno_mese: 18,

    categoria: "diserbo",

    priorita: "media",

    titolo: "Pre-emergenza annuali autunnali post-semina",

    fabbisogno_fisiologico:

      "OBIETTIVO: Bloccare le infestanti annuali autunnali senza compromettere il tappeto rinnovato. 💡 LA SCIENZA: Le annuali autunnali (es. Poa annua da seme) competono per luce e N proprio quando il nuovo C3 è fragile. Pre-emergenza inibisce la mitosi della radice emergente nel letto aperto post-scarifica — barriera chimica selettiva se rispetti lo stadio fenologico del tappeto (PFNPO).",

    esigenze_molecolari: [

      "Pendimetalin o Propyzamide (solo PFNPO, rispetto stadio semina)",

    ],

    macro_categoria: "Diserbante",

    finestra_shift_giorni: 10,

    ordine: 910,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 10,

    giorno_mese: 4,

    categoria: "concime",

    priorita: "alta",

    titolo: "Accumulo riserve — N lenta + K (carbohydrate loading)",

    fabbisogno_fisiologico:

      "OBIETTIVO: Invertire il metabolismo da «crescita» ad «accumulo di riserve» prima dell'inverno. 💡 LA SCIENZA: Il carbohydrate burn rate estivo consuma amidi; in autunno la pianta deve invertire il flusso: zuccheri vanno a rizomi e radici, non a nuove foglie. N moderato + K elevato favorisce traslocazione di saccarosio e sintesi di amido di riserva — come riempire il serbatoio energetico per i 5 mesi senza sole.",

    esigenze_molecolari: [

      "Azoto (N) a rilascio controllato — dose moderata",

      "Potassio (K) solfato — 15–20 g/m² K₂O",

      "Monitoraggio % zuccheri solubili fogliari (Brix) opzionale",

    ],

    macro_categoria: "N",

    finestra_shift_giorni: 12,

    ordine: 920,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 10,

    giorno_mese: 20,

    categoria: "concime",

    priorita: "alta",

    titolo: "Chelati Fe + Mn — efficienza fotosintetica autunnale",

    fabbisogno_fisiologico:

      "OBIETTIVO: Catturare ogni fotone del PAR autunnale ancora disponibile. 💡 LA SCIENZA: Con LAI in declino, ogni foglia deve operare al massimo quantum yield (Fv/Fm). Fe e Mn restaurano la catena di trasporto elettronico del PSII; i fulvici migliorano chelazione endogena. È «ottimizzazione dell'ultimo trimestre fotosintetico» — più zuccheri per riserva con meno superficie fogliare.",

    esigenze_molecolari: [

      "Fe-EDDHA fogliare",

      "Mn chelato",

      "Acidi fulvici come vettore",

    ],

    macro_categoria: "Correttivo",

    finestra_shift_giorni: 10,

    ordine: 925,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 10,

    giorno_mese: 28,

    categoria: "concime",

    priorita: "media",

    titolo: "Spoon-feeding N + K (ciclo 8/8)",

    fabbisogno_fisiologico:

      "OBIETTIVO: Chiudere il ciclo nutrizionale fogliare dell'anno con l'ultimo split mirato. 💡 LA SCIENZA: L'ultimo spoon-feeding N+K sincronizza aminoacidi e potassio osmoregolante nelle foglie che stanno per entrare in quiescenza: micro-dose IBDU equivalente evita picco salino; il K⁺ accompagna la traslocazione finale degli zuccheri verso i tessuti di riserva — sigillo biochimico sulla stagione.",

    esigenze_molecolari: [

      "N micro-dose IBDU equivalente in solution",

      "K solubile complementare",

    ],

    macro_categoria: "N",

    finestra_shift_giorni: 5,

    ordine: 930,

  },

  {

    livello_impegno: "base",

    mese: 11,

    giorno_mese: 8,

    categoria: "concime",

    priorita: "media",

    titolo: "Potassio per tolleranza al freddo",

    fabbisogno_fisiologico:

      "OBIETTIVO: Rendere le cellule più resistenti alle prime gelate notturne. 💡 LA SCIENZA: Il K⁺ accumulato nei vacuoli abbassa il punto di congelamento effettivo del citoplasma e modula il metabolismo dei ROS da freddo. Su Lolium perenne overseeded, nutrienti primari modulano il ROS metabolism sotto cold stress — meno danno da O₂⁻ ai lipidi di membrana, migliore sopravvivenza invernale.",

    esigenze_molecolari: [

      "Potassio (K) — 10–14 g/m² K₂O",

      "VIETATO N ad alta dose",

    ],

    macro_categoria: "K",

    finestra_shift_giorni: 14,

    ordine: 1000,

  },

  {

    livello_impegno: "pro",

    mese: 11,

    giorno_mese: 20,

    categoria: "biostimolante",

    priorita: "media",

    titolo: "Induzione hardening invernale",

    fabbisogno_fisiologico:

      "OBIETTIVO: Addestrare il prato al freddo prima che arrivi il gelo costante. 💡 LA SCIENZA: L'acclimatazione al freddo richiede HSP e modifiche delle membrane (più acidi grassi insaturi). Prolina e carboidrati solubili fogliari agiscono come crioprotectant: legano l'acqua e stabilizzano proteine. Fulvici + K completano il quadro — la pianta «esercita» le difese mentre le temperature scendono gradualmente.",

    esigenze_molecolari: [

      "Acidi fulvici",

      "Prolina e carboidrati solubili fogliari",

      "K complementare",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 14,

    ordine: 1010,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 11,

    giorno_mese: 12,

    categoria: "concime",

    priorita: "alta",

    titolo: "Riserve glucidiche — K dominante + N traccia IBDU",

    fabbisogno_fisiologico:

      "OBIETTIVO: Massimizzare l'indice di riserve glucidiche (amido in rizomi/radici) prima del riposo. 💡 LA SCIENZA: Il K attiva enzimi della sintesi di amido e inibisce la mobilizzazione prematura; N traccia mantiene solo il minimo metabolismo per la fissazione finale di CO₂ autunnale. Studi su bermudagrass mostrano che carboidrati e proteine in rizoma determinano il green-up primaverile — investi ora nel «conto in banca» della pianta.",

    esigenze_molecolari: [

      "Potassio (K) solfato granulare o solubile",

      "Azoto (N) traccia IBDU — max 5 g/m² N",

      "VIETATO ureico rapido",

    ],

    macro_categoria: "K",

    finestra_shift_giorni: 12,

    ordine: 1020,

  },

  // ─── MAGIE OSCURE — data-mining knowledge_base_raw.json ─────────────────────

  {

    livello_impegno: "greenkeeper",

    mese: 6,

    giorno_mese: 26,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Armatura fitolitica — silicio strutturale anti-insetto e anti-fungino",

    fabbisogno_fisiologico:

      "OBIETTIVO: Trasformare le foglie in superfici abrasive e impermeabili al micelio prima del picco estivo. 💡 LA SCIENZA: Le Poaceae attive di silicio depositano SiO₂ come fitoliti tramite trasportatori Lsi: la lamina diventa un mosaico microscopico di vetro. Contro gli insetti, l'apparato boccale si consuma sulla cuticola silicizzata; contro i funghi, superfici silicee causano disidratazione del micelio (effetti fungistatici documentati). Non è un pesticida: è ingegneria dei materiali applicata alla biologia vegetale.",

    esigenze_molecolari: [

      "Acido silicico / metasilicato solubile — fogliare + radicale",

      "Silicio (Si) — barriera meccanica e fungistatica",

      "Agente umettante per assorbimento cuticolare",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 8,

    ordine: 525,

  },

  {

    livello_impegno: "pro",

    mese: 5,

    giorno_mese: 22,

    categoria: "altro",

    priorita: "media",

    titolo: "Simbiosi Epichloë — audit endofita nel miscuglio seminale",

    fabbisogno_fisiologico:

      "OBIETTIVO: Verificare che il tappeto sfrutti (o eviti consapevolmente) la simbiosi verticale Lolium/Festuca–fungo endofita. 💡 LA SCIENZA: Epichloë e Neotyphodium vivono DENTRO i tessuti fogliari, trasmessi con il seme. In cambio di zuccheri sintetizzano alcaloidi (peramine, lolitrem, ergovaline) neurotossici per insetti — un esercito chimico incorporato nella pianta. La review Clavicipitaceae li definisce «ingegneri chimici» con loci di alcaloidi ultra-variabili: alleato contro parassiti, da gestire se pascoli con animali sensibili.",

    esigenze_molecolari: [

      "Verifica miscuglio: endofita+ / endofita-free / novel endophyte",

      "Monitoraggio afidi/larve vs prato standard",

      "Nessun insetticida se endofita attivo e compatibile con uso",

    ],

    macro_categoria: "Altro",

    finestra_shift_giorni: 14,

    ordine: 425,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 11,

    giorno_mese: 2,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Fitomelatonina — regolazione circadiana e scavenging ROS invernale",

    fabbisogno_fisiologico:

      "OBIETTIVO: Potenziare le difese antiossidanti e la regolazione del ritmo circadiano alle prime gelate. 💡 LA SCIENZA: La fitomelatonina agisce come scavenger di ROS, up-regola SOD/CAT/POD e modula risposte al fotoperiodo. Studi su stress idrico: 5 mM melatonina fogliare ripristina pigmenti e osmoprotezioni. In autunno-inverno è un segnale temporale che aiuta la cellula a spegnere i radicali prima che danneggino il PSII — l'ormone del sonno animale che veglia sul prato di notte.",

    esigenze_molecolari: [

      "Fitomelatonina fogliare (2,5–5 mM equivalente dose campo)",

      "Applicazione in fascia crepuscolare",

      "Sinergia con K⁺ e prolina per crioprotezione",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 10,

    ordine: 1005,

  },

  {

    livello_impegno: "pro",

    mese: 3,

    giorno_mese: 20,

    categoria: "diserbo",

    priorita: "media",

    titolo: "Guerra allelopatica rizosferica — essudati radicale pre-emergenza",

    fabbisogno_fisiologico:

      "OBIETTIVO: Inibire la germinazione delle infestanti con chimica naturale emessa dalle radici del C3. 💡 LA SCIENZA: L'allelopatia è guerra chimica sotterranea: il prato secerne allelochemicali (fenoli, acidi organici, benzoxazinoidi nelle Poaceae) che bloccano la germinazione altrui. Le review su allelopathy as weed management tool mostrano che rizosfera attiva e cover crop riducono erbicidi sintetici. Potenziare rizodeposizione in marzo = barriera biochimica pre-emergenza che colpisce il seme infestante prima che veda la luce.",

    esigenze_molecolari: [

      "Biostimolazione radicale (umici/fulvici) per rizodeposizione",

      "Evitare N eccessivo che soffoca segnalazione allelopatica",

      "Estratti vegetali allelopatici compatibili (opzionale)",

    ],

    macro_categoria: "Diserbante",

    finestra_shift_giorni: 12,

    ordine: 205,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 11,

    giorno_mese: 26,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Desaturazione lipidica — fluidità membrana anti-gelo/disgelo",

    fabbisogno_fisiologico:

      "OBIETTIVO: Impedire che le membrane si rompano nei cicli gelo–disgelo notturni. 💡 LA SCIENZA: A basse T i lipidi saturi diventano rigidi come burro in frigo; la cellula perde compartimenti. L'acclimatazione attiva desaturasi che inseriscono doppi legami — da burro a olio. Su Lolium e Agrostis, gelo primaverile e siccità estiva condividono disidratazione cellulare (cross-acclimation). K⁺, prolina e zuccheri ora favoriscono rimodellazione lipidica: membrane fluide fino a -5 °C, niente esplosione osmotica al disgelo mattutino.",

    esigenze_molecolari: [

      "Potassio (K) fogliare — modulazione osmotica",

      "Prolina + zuccheri solubili (crioprotezione citosolica)",

      "VIETATO N ad alta dose pre-gelo (tessuto tenero)",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 12,

    ordine: 1030,

  },

  // ─── MAGIE ESTREME II — stress memory, nano, ormoni, biofilm, poliammine ───

  {

    livello_impegno: "greenkeeper",

    mese: 6,

    giorno_mese: 1,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Priming termico — memoria HSP e riorganizzazione PSII",

    fabbisogno_fisiologico:

      "OBIETTIVO: «Addestrare» il tappeto a luglio con un primo stress termico controllato a giugno, sfruttando la stress memory. 💡 LA SCIENZA: Su Festuca arundinacea, pre-acclimazione al caldo attiva memoria trascritzionale: i geni LMW-HSP e HMW-HSP mantengono abbondanza elevata negli stress successivi (S2, S3, S4) rispetto al primo (S1) — fenomeno di «transcriptional memory» trainable fino a 4 giorni. Il PSII recupera flussi O-J-I-P e il metaboloma si arricchisce di sucrosio, prolina e acidi organici. Non stai stressando: stai scrivendo un manuale epigenetico-operativo che luglio leggerà più velocemente.",

    esigenze_molecolari: [

      "Micro-stress termico controllato (non bruciare il tappeto)",

      "Spoon-feeding successivo con antiossidanti (ascorbato, fulvici)",

      "Monitoraggio Fv/Fm e electrolyte leakage post-priming",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 7,

    ordine: 1035,

  },

  {

    livello_impegno: "pro",

    mese: 7,

    giorno_mese: 8,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Richiamo memoria stress — potenziamento HSP in picco ET0",

    fabbisogno_fisiologico:

      "OBIETTIVO: Sfruttare il secondo picco di caldo quando la pianta ha già «imparato» dal primo episodio. 💡 LA SCIENZA: La stress memory non è psicologia vegetale: è persistenza di segnali stabili e riarrangiamento del metaboloma fogliare dopo pre-esposizione. Al secondo stress, i trascritti HSP partono da livelli basali più alti e il danno al PSII è minore (minore leakage elettrolitico). Intervento di supporto antiossidante in questa finestra = amplificare un vantaggio già inciso nel profilo di espressione genica.",

    esigenze_molecolari: [

      "Acidi fulvici + ascorbato in fase di richiamo stress",

      "Prolina per sinergia con profilo metabolico post-priming",

      "Evitare N che resetta il programma di acclimatazione",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 5,

    ordine: 1040,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 4,

    giorno_mese: 12,

    categoria: "concime",

    priorita: "media",

    titolo: "Nano-selenio (Se-NPs) — bypass redox e stabilità membrana",

    fabbisogno_fisiologico:

      "OBIETTIVO: Correggere blocchi metabolici da stress salino/osmotico con micronutriente in forma nanoparticellare ad alta biodisponibilità. 💡 LA SCIENZA: Il Se nanoparticellare foliare (≈1 mM) riduce O₂⁻ e H₂O₂, abbassa MDA e leakage ionico, aumenta K⁺/Na⁺ e attività di SOD/CAT/APX. Le nanoparticelle penetrano cuticola e pareti con superficie attiva enorme: non è «più selenio», è un corriere che ripristina integrità di membrana e pigmenti clorofilliani quando il suolo o il VPD bloccano l'assorbimento classico.",

    esigenze_molecolari: [

      "Nano-SeO₂ o equivalente Se nanoparticellato — dose campo tracciata",

      "Applicazione fogliare con umettante",

      "Non miscelare con prodotti alcalini incompatibili",

    ],

    macro_categoria: "Correttivo",

    finestra_shift_giorni: 10,

    ordine: 1045,

  },

  {

    livello_impegno: "pro",

    mese: 2,

    giorno_mese: 26,

    categoria: "concime",

    priorita: "media",

    titolo: "Nano-ZnO fogliare — assorbimento sub-cuticolare enzimi clorofilliani",

    fabbisogno_fisiologico:

      "OBIETTIVO: Superare il blocco dell'assorbimento radicale in suolo freddo con Zn in forma nanoparticellare. 💡 LA SCIENZA: Le nanoparticelle di ZnO aumentano clorofilla totale, carotenoidi, attività POX/APX/CAT e parametri di crescita sotto stress salino — effetto documentato su leguminose e trasferibile come principio su C3. Il Zn²⁺ è co-fattore di decine di enzimi; la forma nano bypassa limitazioni di diffusione in cuticola ispessita da freddo, alimentando direttamente il centro enzimatico del ciclo di Hill.",

    esigenze_molecolari: [

      "ZnO nanoparticelle — dose micro fogliare",

      "Integrazione con Mn chelato (sinergia PSII)",

      "Volume solution controllato (EC bassa)",

    ],

    macro_categoria: "Correttivo",

    finestra_shift_giorni: 12,

    ordine: 1050,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 8,

    giorno_mese: 10,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Guerra etilene vs citochinine — blocco senescenza fogliare",

    fabbisogno_fisiologico:

      "OBIETTIVO: Impedire che l'etilene «invecchi» il tappeto sotto stress tardo-estivo mentre le citochinine mantengono il meristema attivo. 💡 LA SCIENZA: Sotto stress idrico, l'ABA e l'etilene accelerano senescenza; le citochinine (zeatin riboside) restano correlate alla tolleranza su Festuca. Su Agrostis stolonifera transgenico SAG12-ipt, il picco di CK in foglie in senescenza riduce leakage elettrolitico, mantiene RuBisCO e GAPDH, e sopprime dieback radicale. Estratti algali e biostimolanti con CK-like modulano il crosstalk ormonale: sposti il bilancio dalla morte programmata alla riparazione metabolica.",

    esigenze_molecolari: [

      "Estratto algale con attività citochininica",

      "Acidi umici / amminoacidi ramificati anti-senescenza",

      "Evitare stress meccanico che picca etilene endogeno",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 7,

    ordine: 1055,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 3,

    giorno_mese: 25,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "PGPR e biofilm rizosferico — matrice EPS idro-retentiva",

    fabbisogno_fisiologico:

      "OBIETTIVO: Costruire una «città» batterica gelatinosa intorno alle radici che trattiene acqua e solubilizza nutrienti. 💡 LA SCIENZA: I PGPR (Pseudomonas, Bacillus, Azospirillum) colonizzano la rizosfera, secernono IAA, fissano N₂, solubilizzano P e K, e formano biofilm con matrice di polisaccaridi (EPS). La matrice aumenta superficie radicale effettiva e ritenzione idrica nel primo mm di suolo. Non è concime: è un ecosistema microbico che estende l'apparato assorbente oltre la radice fisica.",

    esigenze_molecolari: [

      "Inoculo PGPR multi-ceppo (Pseudomonas / Bacillus / Azospirillum)",

      "Integrazione post-scarifica su radici esposte",

      "Irrigazione leggera per stabilizzare il biofilm",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 10,

    ordine: 1060,

  },

  {

    livello_impegno: "pro",

    mese: 4,

    giorno_mese: 2,

    categoria: "biostimolante",

    priorita: "media",

    titolo: "Biofilm fototrofo — cianobatteri e diatomee nella rizosfera",

    fabbisogno_fisiologico:

      "OBIETTIVO: Aggiungere un strato fotosintetico microscopico che produce O₂ e carbonio organico direttamente sulla radice. 💡 LA SCIENZA: I biofilm fototrofi (cianobatteri, diatomee, alghe verdi) fissano CO₂ e rilasciano O₂ e substrati organici nella matrice condivisa con eterotrofi. La matrice polimerica lega la comunità al suolo esposto alla luce. È un «prato dentro il prato»: microfotosintesi locale che alimenta batteri benefici e migliora redox della rizosfera in primavera.",

    esigenze_molecolari: [

      "Inoculo consorzio fototrofo compatibile (cianobatteri / microalghe)",

      "Esposizione suolo alla luce (non coprire eccessivamente)",

      "Umici come collante matrice",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 12,

    ordine: 1065,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 7,

    giorno_mese: 18,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Poliammine — putrescina e spermidina salvano la clorofilla",

    fabbisogno_fisiologico:

      "OBIETTIVO: Bloccare la degradazione della clorofilla e il catabolismo del tetrapirrolo sotto caldo estremo. 💡 LA SCIENZA: Putrescina, spermidina e spermine regolano il percorso uroorphyrinogen III → protoporfirina IX → clorofilla. Spermidina exogena su pomodoro sotto stress sale-alcalinità ripristina clorofilla a/b, down-regola clorofillasi e stabilizza ultrastruttura del cloroplasto. Su creeping bentgrass, RNA-Seq mostra che Spd modula trascrizioni di fotosintesi, antiossidanti e trasporto sotto siccità. Le poliammine non sono fertilizzante: sono «guardie del tetrapirrolo».",

    esigenze_molecolari: [

      "Spermidina fogliare",

      "Putrescina in tracce compatibili",

      "Integrazione con ascorbato e fulvici",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 5,

    ordine: 1070,

  },

  {

    livello_impegno: "pro",

    mese: 5,

    giorno_mese: 25,

    categoria: "biostimolante",

    priorita: "media",

    titolo: "Rete metabolica poliammine–GABA–prolina pre-stress",

    fabbisogno_fisiologico:

      "OBIETTIVO: Precostruire la rete osmoprotectiva prima che luglio accenda ROS e catabolismo proteico. 💡 LA SCIENZA: Su Agrostis stolonifera, spermine pre-trattamento migliora tolleranza a siccità modulando simultaneamente poliammine, GABA-shunt, prolina e metabolismo dell'azoto. GABA e poliammine sono nodi dello stesso grafo metabolico sotto stress abiotico: GABA esogena altera trascrizione di geni protectivi; Spm stabilizza membrane e cloroplasti. Intervento di maggio = cablaggio preventivo della rete, non rincorsa al danno.",

    esigenze_molecolari: [

      "Spermine o spermidina in dose preventiva",

      "GABA in tracce sinergiche",

      "Prolina complementare",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 8,

    ordine: 1075,

  },

  {

    livello_impegno: "pro",

    mese: 9,

    giorno_mese: 2,

    categoria: "rinnovo",

    priorita: "media",

    titolo: "Nano-priming seme C3 — attivazione germinazione sotto stress",

    fabbisogno_fisiologico:

      "OBIETTIVO: Preparare il seme dell'overseeding con tecnologie nano-priming per germinazione uniforme su letto stressato. 💡 LA SCIENZA: Il nano-priming (nanoparticelle su seme in imbibizione) è tecnologia emergente che modifica assorbimento d'acqua, attività antiossidante e velocità di emergenza. Combinato con priming osmotico (GB, SA), stabilizza enzimi della mobilizzazione del riserva nel coleoptile. Sul letto post-scarifica — microclima variabile — il seme «pre-addestrato» attraversa la barriera idrica/osmotica con meno fallimenti.",

    esigenze_molecolari: [

      "Seme C3 nano-primed o trattamento in vaschetta pre-semina",

      "Glicina betaina o SA in priming opzionale",

      "P starter al contatto seme-suolo",

    ],

    macro_categoria: "Semente",

    finestra_shift_giorni: 8,

    ordine: 1080,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 6,

    giorno_mese: 15,

    categoria: "biostimolante",

    priorita: "media",

    titolo: "Consorzio PGPR estivo — fissazione N₂ e chelazione Fe in rizosfera",

    fabbisogno_fisiologico:

      "OBIETTIVO: Mantenere attività microbica benefica nel suolo caldo quando molti batteri dormienti abbandonano la rizosfera. 💡 LA SCIENZA: Pseudomonas e Bacillus PGPR producono siderofori che mobilizzano Fe³⁺, acidi organici che solubilizzano P, e IAA che allarga l'architettura radicale. Azospirillum fissa N₂ usando essudati come carburante — la review PGPR documenta aumenti di germinazione e resilienza al cambiamento climatico. In estate, micro-inoculo ripetuto sostiene la «fabbrica sotterranea» quando l'azoto granulare è vietato.",

    esigenze_molecolari: [

      "Inoculo Azospirillum + Pseudomonas fluorescens",

      "Applicazione irrigua o su feltro sottile",

      "VIETATO N granulare contestuale",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 7,

    ordine: 1085,

  },

  {

    livello_impegno: "pro",

    mese: 10,

    giorno_mese: 12,

    categoria: "altro",

    priorita: "media",

    titolo: "Epigenetica rizosfera — profilo metilazione post-stress estivo",

    fabbisogno_fisiologico:

      "OBIETTIVO: Consolidare a ottobre i adattamenti epigenetici indotti dallo stress estivo prima del riposo invernale. 💡 LA SCIENZA: Oltre ai geni HSP trainable, la letteratura su epigenetica e biostimolanti rizosferici indica che stress abiotici e PGPR modulano metilazione del DNA e profili metabolici persistenti. Recupero autunnale con biostimolanti (umici, alghe) su tappeto «memorizzato» favorisce rimodellamento della rizosfera e transizione a metabolismo di riserva — ponte tra stress memory estiva e acclimatazione invernale.",

    esigenze_molecolari: [

      "Biostimolanti radiculari (umici + estratto algale)",

      "K e P per ricostruzione radicale",

      "Monitoraggio qualità tappeto post-estate",

    ],

    macro_categoria: "Altro",

    finestra_shift_giorni: 14,

    ordine: 1090,

  },

  {

    livello_impegno: "greenkeeper",

    mese: 8,

    giorno_mese: 24,

    categoria: "biostimolante",

    priorita: "alta",

    titolo: "Spermine ad alta dose — blocco catabolismo clorofilla tardo-estate",

    fabbisogno_fisiologico:

      "OBIETTIVO: Intercettare il crollo della clorofilla nelle ultime settimane calde prima dell'autunno. 💡 LA SCIENZA: Su grano sotto heat stress, Spm e Spd exogeni aumentano peso del chicco, SOD/POD/CAT e pool di Spd/Pro, riducendo Put e MDA. Il meccanismo passa per stabilizzazione dei granuli di clorofilla e ritardo della clorofillasi. Su bentgrass, è la stessa leva molecolare contro il «brown patch» fisiologico da caldo — mantieni il verde fotosintetico quando l'etilene vorrebbe smontare il tetrapirrolo.",

    esigenze_molecolari: [

      "Spermine fogliare (dose da protocollo heat stress)",

      "Ascorbato complementare",

      "Applicazione mattutina (VPD minimo)",

    ],

    macro_categoria: "Biostimolante",

    finestra_shift_giorni: 6,

    ordine: 1095,

  },

];


