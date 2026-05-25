/**
 * Fase A — Prescrizione guidata dalla knowledge (prima del copy Gemini).
 * KB → regole agronomiche → filtro/arricchimento matrice calendario deterministico.
 */

import { queryKnowledgeBasePrioritized } from "./kbQuery.mjs";
import { geminiEmbedQuery } from "./ragParametriAgronomici.mjs";
import { bloccoTermicoEstivo } from "./sanitizzaCalendario.mjs";
import { macroIntervento } from "./link_prodotti_calendario.mjs";
import { normalizzaLivelloImpegno } from "./livelloImpegno.mjs";

const MESI_VIETATO_AZOTO = new Set([7, 8]);
const MESI_PRIORITA_K = new Set([6, 7, 8, 9]);

const CHECKLIST_PER_CATEGORIA = {
  concime: [
    "Prato asciutto, senza rugiada persistente",
    "Distribuire in modo uniforme; irrigare leggermente se in granuli",
    "Evitare le ore più calde",
  ],
  biostimolante: [
    "Giornata mite, vento leggero",
    "Preferire tardo pomeriggio se caldo",
    "Breve irrigazione dopo applicazione fogliare",
  ],
  trattamento: [
    "Verificare etichetta PFNPO e tempi di rientro",
    "Non mescolare senza scheda di compatibilità",
    "Monitorare evoluzione 7–10 giorni",
  ],
  diserbo: [
    "Suolo umido ma non saturo; temperatura suolo in finestra etichetta",
    "Non tagliare 48–72 h prima/dopo se indicato",
    "Attendere pioggia leggera o irrigazione come da prodotto",
  ],
  rinnovo: [
    "Preparare letto di semina con arieggiatura nello stesso mese",
    "Semina incrociata; leggera copertura e irrigazione freque",
    "Tenere umido fino all'emergenza",
  ],
  arieggiatura: [
    "Prato asciutto; passata unica non troppo profonda",
    "Raccogliere feltro/residui",
    "Irrigare e concimare leggermente dopo 5–7 giorni",
  ],
  default: [
    "Controllare meteo 48 h (pioggia e picchi di calore)",
    "Seguire dosi calcolate sui tuoi m²",
    "Segna completato in app per aggiornare il diario",
  ],
};

function meseDaData(iso) {
  if (!iso) return 0;
  return new Date(`${iso}T12:00:00`).getMonth() + 1;
}

function blobIntervento(item) {
  return [
    item.titolo,
    item.fabbisogno_fisiologico,
    item.descrizione,
    ...(item.esigenze_molecolari || []),
  ]
    .join(" ")
    .toLowerCase();
}

function macroItem(item) {
  if (item.macro_categoria) return String(item.macro_categoria).trim();
  return macroIntervento(item);
}

function interventoRichiedeAzoto(item) {
  const macro = macroItem(item);
  if (macro === "N") return true;
  const b = blobIntervento(item);
  if (/potass|\b0-0-|\bk2o\b|autumn k|fosfor/.test(b)) return false;
  return /\bazoto\b|\burea\b|npk|\d+-\d+-[1-9]/.test(b) && !/solo potass|senza azoto|zero n|vietato n/i.test(b);
}

function interventoPotassico(item) {
  const macro = macroItem(item);
  if (macro === "K") return true;
  return /potass|\b0-0-|\bk2o\b|kalium/i.test(blobIntervento(item));
}

/** Regole estratte da chunk KB + default greenkeeper. */
export function estraiRegoleDaChunks(chunks = []) {
  const blob = chunks.map((c) => `${c.patologia || ""}\n${c.soluzione || ""}`).join("\n");
  const regole = {
    vietato_azoto_mesi: [...MESI_VIETATO_AZOTO],
    priorizza_potassio_mesi: [...MESI_PRIORITA_K],
    max_n_g_mq_estate: 5,
    note_sintesi: "",
    fonte_kb: chunks.length > 0,
  };

  if (/vietato.*azoto|zero n|no azoto|vietato n/i.test(blob)) {
    if (/luglio|agosto|estate|7|8/i.test(blob)) {
      regole.vietato_azoto_mesi = [6, 7, 8, 9];
    }
  }

  const maxN = blob.match(/(?:max|massimo|vietato)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*g\s*\/\s*m/i);
  if (maxN) {
    const v = Number(maxN[1].replace(",", "."));
    if (v > 0 && v < 30) regole.max_n_g_mq_estate = v;
  }

  const primoLibro = chunks.find((c) => String(c.soluzione || "").startsWith("[libro"));
  const primoCal = chunks.find((c) => String(c.soluzione || "").startsWith("CALENDARIO VERDE"));
  const fonte = primoLibro || primoCal || chunks[0];
  if (fonte?.soluzione) {
    regole.note_sintesi = String(fonte.soluzione).replace(/^\[[^\]]+\]\s*/, "").slice(0, 520);
  }

  return regole;
}

function buildQueryPrescrizione(profilo, matrice) {
  const livello = normalizzaLivelloImpegno(profilo?.livello_impegno);
  return [
    "calendario concimazione prato tappeto erboso greenkeeper",
    "finestre NPK potassio estate azoto vietato luglio agosto",
    "spoon feeding osmoprotezione stress ET0 GDD",
    `zona ${matrice?.zona_climatica || ""}`,
    `livello ${livello}`,
    profilo?.localita,
    profilo?.tipo_prato || profilo?.specie,
    profilo?.note,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function recuperaChunkPrescrizione(admin, geminiKey, profilo, matrice) {
  if (!admin || !geminiKey?.trim()) return [];
  try {
    const emb = await geminiEmbedQuery(buildQueryPrescrizione(profilo, matrice), geminiKey);
    if (!emb?.length) return [];
    return await queryKnowledgeBasePrioritized(admin, emb, {
      matchCount: 8,
      fetchCount: 28,
      minLibri: 3,
    });
  } catch (e) {
    console.warn("[prescrizioneKb]", e.message);
    return [];
  }
}

function arricchisciVoceIntervento(item, regole, deltaMeteo) {
  const mese = meseDaData(item.data_prevista);
  const cat = String(item.categoria || "").toLowerCase();
  const checklist = CHECKLIST_PER_CATEGORIA[cat] || CHECKLIST_PER_CATEGORIA.default;
  const noteKb = [];

  if (regole.note_sintesi && (MESI_PRIORITA_K.has(mese) || cat === "concime")) {
    noteKb.push(`Riferimento KB: ${regole.note_sintesi.slice(0, 280)}…`);
  }

  if (deltaMeteo?.et0_picco_estivo && /stress|osmoprotez|gaba/i.test(blobIntervento(item))) {
    noteKb.push(
      "Priorità elevata: ET0 in picco rispetto alla norma — mitigazione stress consigliata dal calendario Solum.",
    );
  }

  if (MESI_VIETATO_AZOTO.has(mese) && interventoRichiedeAzoto(item) && item.categoria === "concime") {
    noteKb.push(
      `Regola KB: evitare apporti azotati tra luglio e agosto (max ~${regole.max_n_g_mq_estate} g N/m² se eccezione documentata).`,
    );
  }

  if (MESI_PRIORITA_K.has(mese) && interventoPotassico(item)) {
    noteKb.push("Finestra ideale potassio: sostiene turgor e salinità senza spinta vegetativa da azoto.");
  }

  const adattamento = [item.adattamento_dinamico, ...noteKb].filter(Boolean).join(" ");

  return {
    ...item,
    adattamento_dinamico: adattamento || item.adattamento_dinamico,
    prescrizione_kb: {
      checklist_operativa: checklist,
      fonte: regole.fonte_kb ? "tgif_knowledge_base" : "regole_solum",
      mese,
      macro: macroItem(item),
    },
  };
}

function filtraInterventiKb(interventi, regole) {
  return interventi.filter((item) => {
    const mese = meseDaData(item.data_prevista);
    if (!regole.vietato_azoto_mesi.includes(mese)) return true;
    if (String(item.categoria || "").toLowerCase() !== "concime") return true;
    if (!interventoRichiedeAzoto(item)) return true;
    if (interventoPotassico(item)) return true;
    return false;
  });
}

function prioritaDaRegole(item, regole) {
  const mese = meseDaData(item.data_prevista);
  let priorita = item.priorita || "media";
  if (MESI_PRIORITA_K.has(mese) && interventoPotassico(item) && priorita === "bassa") {
    priorita = "media";
  }
  if (MESI_PRIORITA_K.has(mese) && interventoPotassico(item) && priorita === "media") {
    priorita = "alta";
  }
  if (regole.fonte_kb && /stress|fung|patogen/i.test(blobIntervento(item))) {
    priorita = "alta";
  }
  return priorita;
}

/**
 * Applica KB + regole greenkeeper alla matrice prima di Gemini/trattamentoPipeline.
 * @param {object} matrice — output generaCalendarioDeterministico
 */
export async function applicaPrescrizioneKbGuidata(matrice, opts = {}) {
  const { profilo, admin, geminiKey, parametriRag = null, chunksPrecaricati = null } = opts;

  const chunks =
    chunksPrecaricati ??
    (await recuperaChunkPrescrizione(admin, geminiKey, profilo, matrice));

  const regole = estraiRegoleDaChunks(chunks);
  let interventi = [...(matrice.interventi || [])];

  interventi = filtraInterventiKb(interventi, regole);
  interventi = bloccoTermicoEstivo(interventi);

  interventi = interventi.map((item) => {
    const arricchito = arricchisciVoceIntervento(item, regole, matrice.delta_meteo);
    return {
      ...arricchito,
      priorita: prioritaDaRegole(arricchito, regole),
      fonte: arricchito.fonte || "calendario_base",
    };
  });

  const kbBlock = chunks
    .slice(0, 6)
    .map((c, i) => `[${i + 1}] ${(c.soluzione || "").slice(0, 900)}`)
    .join("\n\n");

  return {
    ...matrice,
    interventi,
    prescrizione_kb: {
      fonte: chunks.length ? "rag" : "regole_solum",
      chunk_count: chunks.length,
      regole,
      kb_block: kbBlock,
      parametri_rag_fonte: parametriRag?.fonte ?? null,
    },
  };
}
