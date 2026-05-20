/**
 * Tier commerciale prodotti Bottos per livello_impegno (consumer vs Master Green).
 */

import { normalizzaLivelloImpegno } from "./livelloImpegno.mjs";

const LINEA_MASTER_GREEN =
  /royal|summer\s*k|super\s*turf|master\s*green|golf\s*plus|strong\s*plus|shade\s*plus|royal\s*sport|royal\s*sea|micorrize\s*pro|green\s*power\s*pro/i;

const LINEA_CONSUMER =
  /universale|prato\s*(facile|base|home|classico)|giardino|starter|nutrattiva|rilascio\s*lento|facile|soft|8-8-8|10-10-10|12-12-12|micorrize\s*classic|soil\s*life|prato\s*verde/i;

const TAG_ESPLICITO_PRO = /\blinea\s*pro\b|\btag:\s*pro\b|\bonly\s*pro\b|\buso\s*professionale\b/i;

function blobProdotto(p) {
  return `${p?.nome || ""} ${p?.descrizione || ""} ${p?.composizione || ""} ${p?.categoria || ""}`.toLowerCase();
}

/** @returns {"consumer"|"standard"|"master"|"pro_escluso"} */
export function tierLineaProdotto(prodotto) {
  const legale = String(prodotto?.categoria_legale || "").toUpperCase();
  if (legale === "PROFESSIONALE") return "pro_escluso";

  const blob = blobProdotto(prodotto);
  if (TAG_ESPLICITO_PRO.test(blob)) return "pro_escluso";
  if (LINEA_MASTER_GREEN.test(blob)) return "master";
  if (LINEA_CONSUMER.test(blob)) return "consumer";
  return "standard";
}

/** Filtra pool prima del ranking (base: no linea pro/master esplicita). */
export function filtraPoolPerLivelloImpegno(pool, profilo) {
  const livello = normalizzaLivelloImpegno(profilo?.livello_impegno);
  return pool.filter((p) => {
    const tier = tierLineaProdotto(p);
    if (livello === "base") {
      if (tier === "pro_escluso" || tier === "master") return false;
    }
    return tier !== "pro_escluso";
  });
}

/** Bonus/penalità in scoreProdotto. */
export function bonusLivelloImpegno(prodotto, profilo) {
  const livello = normalizzaLivelloImpegno(profilo?.livello_impegno);
  const tier = tierLineaProdotto(prodotto);

  if (livello === "base") {
    if (tier === "consumer") return 18;
    if (tier === "standard") return 6;
    return 0;
  }
  if (livello === "greenkeeper") {
    if (tier === "master") return 22;
    if (tier === "standard") return 6;
    if (tier === "consumer") return -6;
    return 0;
  }
  if (tier === "master") return 10;
  if (tier === "consumer") return 4;
  return 8;
}
