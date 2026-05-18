/**
 * Tier concimi catalogo: professionale / bilanciato / blando.
 * Allineato a obiettivo, uso e frequenza taglio (incluso robot).
 */

const PROFESSIONALE =
  /ferro|chelat|npk\s*\d|n-\d|p-\d|k-\d|\d-\d-\d|slow\s*release|rilascio\s*lento|coated|mfu|attiv|activ|intens|premium|pro\b|max\b|sport|stress|ripresa|green\s*power|nutrizione|concime\s*liquido|liquid|granular|erboso|tappeto|magnesium|azoto|fosforo|potassio/i;

const BLANDO =
  /universale|facile|starter|base\b|leggero|soft|organic|organico|ammendant|humus|leonardit|micorriz|soil\s*life|nutrattiva|8-8-8|10-10-10|12-12-12|prato\s*facile|rilascio\s*graduale|lento\s*generico|mild|gentile|equilibrat/i;

/** @returns {"professionale"|"bilanciato"|"blando"} */
export function tierConcime(prodotto) {
  const blob = `${prodotto?.nome || ""} ${prodotto?.descrizione || ""} ${prodotto?.composizione || ""} ${prodotto?.categoria || ""}`.toLowerCase();

  const cat = String(prodotto?.categoria || "").toUpperCase();
  if (/AMMEND|ORGANIC|HUMUS|MICORRIZ/.test(cat) || /ammendant|organico|humus|micorriz|soil life/.test(blob)) {
    return "blando";
  }

  const isPro = PROFESSIONALE.test(blob);
  const isBland = BLANDO.test(blob);

  if (isPro && !isBland) return "professionale";
  if (isBland && !isPro) return "blando";
  if (isPro && isBland) return "bilanciato";
  if (/concim|npk|fertil|nutri/.test(blob)) return "bilanciato";
  return "bilanciato";
}

/** @returns {"professionale"|"bilanciato"|"blando"} */
export function livelloConcimiTarget(profilo) {
  const ob = profilo?.obiettivo;
  const uso = profilo?.uso;
  const freq = profilo?.frequenza_taglio;

  if (ob === "bassa_manutenzione" || freq === "raro") return "blando";
  if (freq === "robot") {
    return ob === "bassa_manutenzione" ? "blando" : "professionale";
  }
  if (ob === "estetico" || uso === "ornamentale" || freq === "settimanale") return "professionale";
  if (ob === "resistente" || uso === "sport") return "bilanciato";
  if (uso === "professionale") return "professionale";
  return "bilanciato";
}

const TIER_LABEL = {
  professionale: "concimi professionali (NPK mirati, ferro, slow release, liquidi concentrati)",
  bilanciato: "concimi bilanciati per giardino curato",
  blando: "concimi blandi / universali / a rilascio lento (poco intervento)",
};

export function formatLivelloConcimiForPrompt(profilo) {
  const target = livelloConcimiTarget(profilo);
  const freq = profilo?.frequenza_taglio;
  const lines = [`Livello concimi consigliato: ${TIER_LABEL[target]}.`];
  if (freq === "robot") {
    lines.push(
      "Taglio con robot: micro-tagli frequenti; concimi liquidi leggeri in piccole dosi o slow release; evitare eccessi di azoto rapido.",
    );
  }
  if (profilo?.obiettivo === "estetico") {
    lines.push("Priorità estetica: ferro e NPK per colore, non solo universale.");
  }
  if (profilo?.obiettivo === "bassa_manutenzione") {
    lines.push("Poca manutenzione: massimo 2–3 concimazioni stagionali con prodotti a rilascio lento.");
  }
  return lines.join("\n");
}

/** Punteggio per ranking catalogo. */
export function bonusConcimePerProfilo(prodotto, profilo) {
  const cat = String(prodotto?.categoria || "").toUpperCase();
  if (!/CONCIME|NUTRI|FERTIL|AMMEND|ORGANIC/.test(cat) && !/concim|npk|nutri|ammend/.test(prodottoBlob(prodotto))) {
    return 0;
  }

  const target = livelloConcimiTarget(profilo);
  const tier = tierConcime(prodotto);

  if (target === tier) return 24;
  const order = { blando: 0, bilanciato: 1, professionale: 2 };
  const diff = order[tier] - order[target];
  if (diff === 1) return 6;
  if (diff === -1) return 10;
  if (diff >= 2) return -18;
  if (diff <= -2) return -14;
  return 0;
}

function prodottoBlob(p) {
  return `${p?.nome || ""} ${p?.descrizione || ""}`.toLowerCase();
}

/** Per integrazione catalogo: esclude concimi fuori tier (tolleranza ±1). */
export function concimeAmmessoPerProfilo(prodotto, profilo) {
  const cat = String(prodotto?.categoria || "").toUpperCase();
  if (!/CONCIME|NUTRI|FERTIL/.test(cat) && !/concim|npk/.test(prodottoBlob(prodotto))) {
    return true;
  }
  return bonusConcimePerProfilo(prodotto, profilo) >= -5;
}
