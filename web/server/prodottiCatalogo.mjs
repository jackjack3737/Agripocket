/** Catalogo Prodotti (Supabase) + dosi su m² (solo concimi/biostimolanti Bottos, non fitofarmaci). */

import {
  bonusPunteggioBottosFito,
  preferisciPoolBottos,
} from "./bottosFitofarmaci.mjs";
import { bonusConcimePerProfilo, livelloConcimiTarget, tierConcime } from "./livelloConcimi.mjs";
import { bonusLivelloImpegno, filtraPoolPerLivelloImpegno } from "./livelloProdotti.mjs";
import {
  appendNotaMatchCromatico,
  filtraPoolSementiPerColore,
  scoreMatchCromaticoSemente,
} from "./colorMatchingSementi.mjs";
import {
  analizzaParassiti,
  filtraInsetticidaPerParassita,
} from "./parassitiPrato.mjs";
import {
  AVVISO_FITOFARMACO,
  AVVISO_MQ_MANCANTI,
  isInterventoFitofarmaco,
  isProdottoFitofarmaco,
  filtraProdottiConsumer,
  inferCategoriaLegale,
  AVVISO_PRODOTTO_PROFESSIONALE,
  superficieMqVerificata,
} from "./sicurezzaProdotti.mjs";
import { getProdottiCached } from "./prodottiCache.mjs";

const MAP_CATEGORIA_INTERVENTO = {
  diserbo: ["DISERBANTE SELETTIVO", "DISERBANTE", "DISERBANTE PRE-EMERGENZA", "DISERBANTE PFnPE"],
  trattamento: ["FUNGICIDA", "FUNGICIDA BIO", "INSETTICIDA", "INSETTICIDA BIO", "BIOATTIVATO"],
  concime: ["CONCIME GRANULARE", "CONCIME LIQUIDO", "CONCIME"],
  biostimolante: ["BIOSTIMOLANTE", "BIOATTIVATO"],
  umettante: ["BAGNANTE"],
  rinnovo: ["SEMENTI"],
};

const CATEGORIE_TUTTE_MARCHE = new Set([
  "FUNGICIDA",
  "FUNGICIDA BIO",
  "DISERBANTE SELETTIVO",
  "DISERBANTE",
  "DISERBANTE PRE-EMERGENZA",
  "DISERBANTE PFnPE",
  "INSETTICIDA",
  "INSETTICIDA BIO",
  "INSETTICIDA PFnPE",
]);

export function consenteTutteMarche(prodotto) {
  return CATEGORIE_TUTTE_MARCHE.has(String(prodotto?.categoria || "").toUpperCase());
}

/** Concimi, biostimolanti, umettanti, sementi: solo BOTTOS. Fungicidi/diserbanti/insetticidi: tutte le marche. */
export function filtraPoolMarca(pool) {
  return pool.filter((p) => {
    if (consenteTutteMarche(p)) return true;
    return String(p.marca || "").toUpperCase() === "BOTTOS";
  });
}

const MESI_IT = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

function meseCorrenteCode() {
  return MESI_IT[new Date().getMonth()];
}

function meseDaData(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return meseCorrenteCode();
  return MESI_IT[new Date(`${isoDate}T12:00:00`).getMonth()];
}

export function isPreEmergenzaAnnualiIntervento(intervento) {
  const t = `${intervento?.titolo || ""} ${intervento?.descrizione || ""}`.toLowerCase();
  const annuali = /setaria|digitaria|panico|annualit|sorghetta|crabgrass/i.test(t);
  const pre = /pre.?emerg|antigermin|pre emergenza|preemergenza/i.test(t);
  return pre || (annuali && intervento?.categoria === "diserbo" && !/post.?emerg|selettivo foglia|trifoglio|tarassaco/i.test(t));
}

export function periodoCompatibile(periodoUso, meseCode = meseCorrenteCode()) {
  if (!periodoUso) return true;
  const p = String(periodoUso).toUpperCase();
  if (/TUTTO|ANNO|SEMPRE/.test(p)) return true;
  if (p.includes(meseCode)) return true;
  const idx = MESI_IT.indexOf(meseCode);
  if (idx < 0) return true;
  const tri = MESI_IT.slice(Math.max(0, idx - 1), idx + 2).join("");
  return p.includes(tri);
}

async function loadProdottiRaw(admin) {
  const { data, error } = await admin.from("Prodotti").select("*").order("nome");
  if (error) {
    console.warn("[prodotti] load:", error.message);
    return [];
  }
  const enriched = (data ?? []).map((p) => ({
    ...p,
    categoria_legale: p.categoria_legale || inferCategoriaLegale(p),
    macro_categoria: p.macro_categoria || inferMacroCategoriaProdotto(p),
    dosaggio_standard_mq: p.dosaggio_standard_mq ?? p.dose_fogliare ?? p.dose_radicale,
    periodo_ideale: p.periodo_ideale || p.periodo_uso,
  }));
  return filtraProdottiConsumer(enriched);
}

/** Catalogo con cache TTL (default 10 min). */
export async function loadProdotti(admin) {
  return getProdottiCached(admin, loadProdottiRaw);
}

/** Macro categoria brand-agnostic per guardrails (N, P, K, …). */
export function inferMacroCategoriaProdotto(prodotto, intervento) {
  if (prodotto?.macro_categoria) return prodotto.macro_categoria;
  const cat = String(prodotto?.categoria || "").toUpperCase();
  const blob = `${prodotto?.nome || ""} ${prodotto?.composizione || ""} ${prodotto?.descrizione || ""}`.toLowerCase();

  if (/SEMENT/.test(cat)) return "Semente";
  if (/BAGNANT/.test(cat)) return "Bagnante";
  if (/FUNGICID/.test(cat)) return "Fungicida";
  if (/INSETTICID/.test(cat)) return "Insetticida";
  if (/DISERBANT/.test(cat)) return "Diserbante";
  if (/BIOSTIM|BIOATTIV/.test(cat)) return "Biostimolante";
  if (/potass|autumn k|\bk2o\b|0-0-[1-9]|kalium/.test(blob)) return "K";
  if (/fosfor|phosph|\bp2o5\b/.test(blob)) return "P";
  if (/azoto|urea|ammon|nitrat|\bnpk\b/.test(blob) && !/potass/.test(blob)) return "N";
  if (/leonardit|humus|micorriz|ammend|correttiv|ferro chelat/.test(blob)) return "Correttivo";
  if (/CONCIME|NPK|FERTIL/.test(cat)) {
    const m = blob.match(/(\d+)\s*[-–]\s*(\d+)\s*[-–]\s*(\d+)/);
    if (m) {
      const n = Number(m[1]);
      const p = Number(m[2]);
      const k = Number(m[3]);
      if (k >= n && k >= p) return "K";
      if (n >= p && n >= k) return "N";
      if (p >= n && p >= k) return "P";
    }
    return "N";
  }
  const ic = String(intervento?.categoria || "").toLowerCase();
  if (ic === "biostimolante") return "Biostimolante";
  if (ic === "concime") return "N";
  return "Altro";
}

export function mqPrato(profilo) {
  return superficieMqVerificata(profilo);
}

function formattaQuantita(valore, unita, { perMq = false } = {}) {
  const u = (unita || "g").toLowerCase();
  if (u === "ml" && valore >= 1000) return { valore: +(valore / 1000).toFixed(2), unita: "L" };
  if (u === "g" && valore >= 1000) return { valore: +(valore / 1000).toFixed(2), unita: "kg" };
  if (perMq && valore < 10) return { valore: +valore.toFixed(2), unita: u };
  if (u === "ml") return { valore: +valore.toFixed(0), unita: "ml" };
  return { valore: +valore.toFixed(0), unita: u };
}

/** Dose in DB = per m². Richiede mq verificati. Null per fitofarmaci (chiamare solo se non fitofarmaco). */
export function calcolaDose(prodotto, superficieMq) {
  const mq = Number(superficieMq);
  if (!Number.isFinite(mq) || mq <= 0) return null;
  if (isProdottoFitofarmaco(prodotto)) return null;

  const unit = (prodotto?.unita_misura || "g").toLowerCase();
  let perMq = Number(prodotto?.dosaggio_standard_mq) || 0;
  let via = "standard";
  if (perMq <= 0) {
    perMq = Number(prodotto?.dose_fogliare) || 0;
    via = "fogliare";
  }
  if (perMq <= 0) {
    perMq = Number(prodotto?.dose_radicale) || 0;
    via = "radicale";
  }
  if (perMq <= 0) return null;

  const totaleRaw = perMq * mq;
  const fmt = formattaQuantita(totaleRaw, unit);
  const fmtMq = formattaQuantita(perMq, unit, { perMq: true });

  return {
    dose_per_mq: perMq,
    dose_totale: totaleRaw,
    dose_unita: unit,
    dose_display: `${fmt.valore} ${fmt.unita}`,
    dose_per_mq_display: `${fmtMq.valore} ${fmtMq.unita}/m²`,
    via,
    superficie_mq: mq,
    testo: `Dose: ${fmtMq.valore} ${fmtMq.unita}/m² × ${mq} m² = ${fmt.valore} ${fmt.unita} (${via})`,
  };
}

function contestoVision(vision, intervento) {
  const problemi = (vision?.problemi_rilevati || [])
    .map((x) => `${x.problema} ${x.dettaglio}`)
    .join(" ")
    .toLowerCase();
  const mal = (vision?.malattie_sospette || []).join(" ").toLowerCase();
  const erbe = (vision?.erbette_infestanti || []).join(" ").toLowerCase();
  const par = (vision?.parassiti_sottoprato || [])
    .map((x) => (typeof x === "string" ? x : `${x.tipo} ${x.segni} ${x.note}`))
    .join(" ")
    .toLowerCase();
  const intTxt = `${intervento?.titolo || ""} ${intervento?.descrizione || ""}`.toLowerCase();
  return `${problemi} ${mal} ${erbe} ${par} ${intTxt}`;
}

export function scoreProdotto(p, { categoriaIntervento, vision, intervento, profilo }) {
  let score = 0;
  const isBottos = String(p.marca || "").toUpperCase() === "BOTTOS";
  const fito = consenteTutteMarche(p);
  if (isBottos) score += fito ? 10 : 8;
  else if (!fito) score -= 50;

  const meseCode = meseDaData(intervento?.data_prevista);
  if (periodoCompatibile(p.periodo_uso, meseCode)) score += 5;

  const blob = `${p.nome} ${p.descrizione} ${p.composizione} ${(p.tag_meteo || []).join(" ")}`.toLowerCase();
  const ctx = contestoVision(vision, intervento);
  const intTxt = `${intervento?.titolo || ""} ${intervento?.descrizione || ""}`.toLowerCase();
  const parassiti = analizzaParassiti({ vision, intervento, localita: profilo?.localita });

  if (fito) {
    score += bonusPunteggioBottosFito(p, {
      categoriaIntervento,
      ctx: `${ctx} ${intTxt}`,
    });
  }

  if (categoriaIntervento === "diserbo" && isPreEmergenzaAnnualiIntervento(intervento)) {
    if (String(p.categoria || "").toUpperCase() === "DISERBANTE PRE-EMERGENZA") score += 18;
    if (/setaria|digitaria|panico|annualit|pre.?emerg|antigermin/.test(blob)) score += 10;
    if (/post.?emerg|selettivo|foglia larga|dicot/.test(blob)) score -= 8;
  } else if (categoriaIntervento === "diserbo" && /erbette|trifoglio|tarassaco|dicot|foglia larga/.test(ctx + intTxt + blob))
    score += 6;
  if (categoriaIntervento === "trattamento") {
    if (/fungh|marcium|patogen|oidio|fusarium|rhizoctonia|microdochium/.test(ctx)) {
      if (/fungh|oidio|patogen|trichoderma|bacillus/.test(blob)) score += 10;
    }
    if (/insett|afid|larv|popillia|maggiolino|otiorrinco|bruco/.test(ctx + intTxt)) {
      if (/insett|afid|larv/.test(blob)) score += 8;
      if (parassiti.popillia && /\bfly\b|popillia|maggiolino|coleotter/.test(blob)) score += 22;
      if (parassiti.larveSottoprato && /\bfly\b|larv|nematocid/.test(blob)) score += 12;
      if (parassiti.rilevati.some((r) => r.id === "otiorrinco") && /otiorrinco|talpa/.test(blob)) score += 15;
    }
  }
  if (categoriaIntervento === "concime" && /giall|cloros|nutriz|concim|azoto/.test(ctx + blob)) score += 5;
  if (categoriaIntervento === "biostimolante" && /stress|debole|ripresa/.test(ctx + blob)) score += 4;

  if (categoriaIntervento === "concime" || /concim|npk|ferro|ammend/.test(blob)) {
    score += bonusConcimePerProfilo(p, profilo);
  }

  score += bonusLivelloImpegno(p, profilo);

  if (categoriaIntervento === "rinnovo") {
    score += scoreMatchCromaticoSemente(p, vision?.colore_dominante);
  }

  return score;
}

export function filtraProdottiPerIntervento(prodotti, categoriaIntervento) {
  const cats = MAP_CATEGORIA_INTERVENTO[categoriaIntervento];
  if (!cats?.length) return [];
  return prodotti.filter((p) => cats.includes(String(p.categoria || "").toUpperCase()));
}

function restringiPoolDiserbo(pool, intervento) {
  if (!isPreEmergenzaAnnualiIntervento(intervento)) return pool;
  const pre = pool.filter((p) => String(p.categoria || "").toUpperCase() === "DISERBANTE PRE-EMERGENZA");
  const base = pre.length ? pre : pool.filter((p) =>
    /setaria|digitaria|panico|pre.?emerg|antigermin|annualit/i.test(
      `${p.nome} ${p.descrizione} ${p.composizione}`,
    ),
  );
  const narrowed = base.length ? base : pool;
  return preferisciPoolBottos(narrowed, "pre_emergenza");
}

function restringiPoolTrattamento(pool, vision, intervento, profilo) {
  const ctx = contestoVision(vision, intervento);
  const parassiti = analizzaParassiti({ vision, intervento, localita: profilo?.localita });

  if (/fungh|marcium|patogen|oidio|fusarium|rhizoctonia|microdochium/.test(ctx) && !parassiti.larveSottoprato) {
    const fung = filtraProdottiConsumer(
      pool.filter((p) => /^FUNGICIDA/.test(String(p.categoria || "").toUpperCase())),
    );
    if (fung.length) return preferisciPoolBottos(fung, "funghi");
  }

  if (/insett|afid|larv|trip|coleotter|popillia|maggiolino|otiorrinco|bruco|sottoprato/.test(ctx)) {
    let ins = pool.filter((p) => /^INSETTICIDA/.test(String(p.categoria || "").toUpperCase()));
    ins = filtraProdottiConsumer(ins);
    ins = filtraInsetticidaPerParassita(ins, parassiti);
    if (ins.length) return preferisciPoolBottos(ins, parassiti.larveSottoprato ? "larve" : "insetti");
  }

  if (parassiti.larveSottoprato) {
    let ins = pool.filter((p) => /^INSETTICIDA/.test(String(p.categoria || "").toUpperCase()));
    ins = filtraInsetticidaPerParassita(ins, parassiti);
    if (ins.length) return preferisciPoolBottos(ins, "larve");
  }

  return pool.filter((p) => consenteTutteMarche(p));
}

export function rankProdotti(prodotti, opts) {
  let grezzo = filtraProdottiPerIntervento(prodotti, opts.categoriaIntervento);
  if (opts.categoriaIntervento === "trattamento") {
    grezzo = restringiPoolTrattamento(grezzo, opts.vision, opts.intervento, opts.profilo);
  }
  if (opts.categoriaIntervento === "diserbo") {
    grezzo = restringiPoolDiserbo(grezzo, opts.intervento);
  }
  if (opts.categoriaIntervento === "rinnovo") {
    grezzo = filtraPoolSementiPerColore(grezzo, opts.vision);
  }
  let pool = filtraProdottiConsumer(filtraPoolMarca(grezzo));
  pool = filtraPoolPerLivelloImpegno(pool, opts.profilo);
  return pool
    .map((p) => ({ p, score: scoreProdotto(p, opts) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bA = String(a.p.marca || "").toUpperCase() === "BOTTOS" ? 1 : 0;
      const bB = String(b.p.marca || "").toUpperCase() === "BOTTOS" ? 1 : 0;
      if (bB !== bA) return bB - bA;
      return String(a.p.nome).localeCompare(String(b.p.nome));
    });
}

/** Tutti i prodotti con punteggio vicino al migliore (non solo il primo). */
export function scegliProdottiSimili(prodotti, opts, { max = 8, sogliaPunti = 5 } = {}) {
  const ranked = rankProdotti(prodotti, opts);
  if (!ranked.length) return [];
  const top = ranked[0].score;
  return ranked
    .filter((r) => top - r.score <= sogliaPunti)
    .slice(0, max)
    .map((r) => r.p);
}

function motiviPunteggio(p, opts, score) {
  const motivi = [];
  const isBottos = String(p.marca || "").toUpperCase() === "BOTTOS";
  if (isBottos) motivi.push("marca Bottos (+8)");
  else if (consenteTutteMarche(p)) motivi.push("categoria ammessa tutte le marche");
  const meseCode = meseDaData(opts.intervento?.data_prevista);
  if (periodoCompatibile(p.periodo_uso, meseCode)) motivi.push(`periodo d'uso ok per ${meseCode}`);
  const intTxt = `${opts.intervento?.titolo || ""} ${opts.intervento?.descrizione || ""}`.toLowerCase();
  if (opts.categoriaIntervento === "concime" && /liquido|liquid|nutri|npk/.test(intTxt + String(p.nome).toLowerCase())) {
    motivi.push("coerente con concimazione liquida");
  }
  const par = analizzaParassiti({ vision: opts.vision, intervento: opts.intervento, localita: opts.profilo?.localita });
  if (par.popillia && /\bfly\b/i.test(String(p.nome))) {
    motivi.push("idoneo per larve popillia (Fly Bottos)");
  }
  if (/trichoderma/i.test(String(p.nome + p.composizione)) && isBottos) {
    motivi.push("Trichoderma Bottos per difesa fungina");
  }
  if (opts.categoriaIntervento === "concime" && opts.profilo) {
    const target = livelloConcimiTarget(opts.profilo);
    const tier = tierConcime(p);
    if (tier === target) motivi.push(`concime ${tier} (coerente con obiettivo)`);
  }
  const imp = opts.profilo?.livello_impegno;
  if (imp) motivi.push(`linea prodotto coerente con impegno ${imp}`);
  if (opts.categoriaIntervento === "rinnovo" && opts.vision?.colore_dominante) {
    motivi.push(`match cromatico (${opts.vision.colore_dominante})`);
  }
  if (!motivi.length) motivi.push(`punteggio totale ${score}`);
  return motivi;
}

function formattaOpzioniCatalogo(prodotti, profilo, fito) {
  const mq = superficieMqVerificata(profilo);
  const righe = prodotti.map((p, i) => {
    let extra = "";
    if (!fito && !isProdottoFitofarmaco(p) && mq) {
      const dose = calcolaDose(p, mq);
      if (dose) extra = ` — ${dose.dose_display} su ${mq} m²`;
    }
    return `${i + 1}) ${p.nome} (${p.categoria}, ${p.marca || "?"})${extra}`;
  });
  return `Alternative catalogo (${prodotti.length}): ${righe.join("; ")}.`;
}

export function scegliProdotto(prodotti, opts) {
  return scegliProdottiSimili(prodotti, opts, { max: 1 })[0] ?? null;
}

export function arricchisciInterventoConProdotto(intervento, profilo, prodotti, vision) {
  const mq = superficieMqVerificata(profilo);
  const fito = isInterventoFitofarmaco(intervento.categoria);
  const opts = { categoriaIntervento: intervento.categoria, vision, intervento, profilo };
  const simili = scegliProdottiSimili(prodotti, opts);
  const prodotto = simili[0] ?? null;
  const ranked = rankProdotti(prodotti, opts);
  const topScore = ranked[0]?.score ?? 0;

  const blocchi = [];
  if (prodotto) {
    blocchi.push(
      `Prodotto catalogo: ${prodotto.nome} (${motiviPunteggio(prodotto, opts, topScore).join(", ")}).`,
    );
  }

  if (fito) {
    const hint = prodotto
      ? `Riferimento catalogo PFNPO/uso domestico (non prescrizione): ${prodotto.nome} — ${prodotto.composizione || prodotto.categoria}.`
      : "Nessun prodotto fitosanitico idoneo al consumatore in catalogo per questo caso: valuta intervento non chimico o agronomo.";
    return {
      ...intervento,
      prodotto_id: prodotto?.id ?? null,
      prodotto_nome: prodotto?.nome ?? null,
      dose_totale: null,
      dose_unita: null,
      dose_per_mq: null,
      dose_display: null,
      avviso_fitofarmaco: true,
      descrizione: [intervento.descrizione, hint, ...blocchi, AVVISO_FITOFARMACO].filter(Boolean).join(" ").slice(0, 1200),
    };
  }

  if (!prodotto) {
    return {
      ...intervento,
      descrizione: appendNotaMatchCromatico(
        [intervento.descrizione, !mq ? AVVISO_MQ_MANCANTI : null].filter(Boolean).join(" "),
        vision,
        intervento.categoria,
      ).slice(0, 500),
    };
  }

  const dose = calcolaDose(prodotto, mq);
  if (!dose) {
    return {
      ...intervento,
      prodotto_id: prodotto.id,
      prodotto_nome: prodotto.nome,
      descrizione: appendNotaMatchCromatico(
        [intervento.descrizione, ...blocchi, AVVISO_MQ_MANCANTI].filter(Boolean).join(" "),
        vision,
        intervento.categoria,
      ).slice(0, 1200),
    };
  }

  const extra = `Dose principale (${prodotto.nome}): ${dose.testo}.`;
  const descrizioneFinale = appendNotaMatchCromatico(
    [intervento.descrizione, extra, ...blocchi].filter(Boolean).join(" "),
    vision,
    intervento.categoria,
  );
  return {
    ...intervento,
    prodotto_id: prodotto.id,
    prodotto_nome: prodotto.nome,
    macro_categoria: inferMacroCategoriaProdotto(prodotto, intervento),
    dose_totale: dose.dose_totale,
    dose_unita: dose.dose_unita,
    dose_per_mq: dose.dose_per_mq,
    dose_display: dose.dose_display,
    dosaggio_calcolato: `${dose.dose_display} per ${mq} m²`,
    avviso_fitofarmaco: false,
    descrizione: descrizioneFinale.slice(0, 900),
  };
}

export function catalogoCompattoPerPrompt(prodotti, limit = 80) {
  const eligibili = filtraPoolMarca(prodotti);
  return eligibili
    .slice(0, limit)
    .map(
      (p) =>
        `id=${p.id} | ${p.nome} | ${p.categoria} | ${p.marca} | fogl=${p.dose_fogliare}${p.unita_misura}/m² rad=${p.dose_radicale}${p.unita_misura}/m² | ${p.periodo_uso || ""}`,
    )
    .join("\n");
}
