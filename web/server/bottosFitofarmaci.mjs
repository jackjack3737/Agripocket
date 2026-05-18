/** Preferenza prodotti BOTTOS per fitofarmaci curativi (Fly, Trichoderma, …). */

export function prodottoBlob(p) {
  return `${p.nome || ""} ${p.descrizione || ""} ${p.composizione || ""}`.toLowerCase();
}

export function isMarcaBottos(p) {
  return String(p?.marca || "").toUpperCase() === "BOTTOS";
}

/** Insetticida Fly Bottos (larve, popillia). */
export function isFlyBottos(p) {
  return isMarcaBottos(p) && /\bfly\b/i.test(prodottoBlob(p));
}

/** Fungicida / bio con Trichoderma Bottos. */
export function isTrichodermaBottos(p) {
  return isMarcaBottos(p) && /trichoderma/i.test(prodottoBlob(p));
}

export function isFungicidaBottos(p) {
  const cat = String(p?.categoria || "").toUpperCase();
  return isMarcaBottos(p) && /^FUNGICIDA/.test(cat);
}

export function isInsetticidaBottos(p) {
  const cat = String(p?.categoria || "").toUpperCase();
  return isMarcaBottos(p) && /^INSETTICIDA/.test(cat);
}

export function isDiserboPreEmergenzaBottos(p) {
  const cat = String(p?.categoria || "").toUpperCase();
  return (
    isMarcaBottos(p) &&
    (cat === "DISERBANTE PRE-EMERGENZA" ||
      cat === "DISERBANTE PFnPE" ||
      /pre.?emerg|antigermin/i.test(prodottoBlob(p)))
  );
}

/**
 * Se in pool ci sono referenze Bottos idonee, restringi a quelle.
 * @param {object[]} pool
 * @param {"larve"|"funghi"|"pre_emergenza"|"insetti"} tipo
 */
export function preferisciPoolBottos(pool, tipo) {
  if (!pool?.length) return pool;

  if (tipo === "larve" || tipo === "insetti") {
    const fly = pool.filter(isFlyBottos);
    if (fly.length) return fly;
    const ins = pool.filter(isInsetticidaBottos);
    if (ins.length) return ins;
  }

  if (tipo === "funghi") {
    const tri = pool.filter(isTrichodermaBottos);
    if (tri.length) return tri;
    const fung = pool.filter(isFungicidaBottos);
    if (fung.length) return fung;
  }

  if (tipo === "pre_emergenza") {
    const pre = pool.filter(isDiserboPreEmergenzaBottos);
    if (pre.length) return pre;
  }

  const bottos = pool.filter(isMarcaBottos);
  return bottos.length ? bottos : pool;
}

/** Bonus punteggio catalogo per fitofarmaci Bottos. */
export function bonusPunteggioBottosFito(p, { categoriaIntervento, ctx = "" } = {}) {
  let bonus = 0;
  const blob = prodottoBlob(p);
  const contesto = String(ctx).toLowerCase();

  if (!isMarcaBottos(p)) return 0;

  bonus += 14;

  if (categoriaIntervento === "trattamento") {
    if (isFlyBottos(p) && /insett|larv|popillia|maggiolino|otiorrinco|bruco|sottoprato/.test(contesto)) {
      bonus += 38;
    } else if (isTrichodermaBottos(p) && /fungh|patogen|marcium|oidio|fusarium|rhizoctonia|microdochium/.test(contesto)) {
      bonus += 38;
    } else if (isFungicidaBottos(p) && /fungh|patogen|marcium/.test(contesto)) {
      bonus += 18;
    } else if (isInsetticidaBottos(p) && /insett|larv|afid|parassit/.test(contesto)) {
      bonus += 18;
    }
  }

  if (categoriaIntervento === "diserbo" && isDiserboPreEmergenzaBottos(p)) {
    bonus += 22;
  }

  if (/trichoderma/.test(blob) && /fungh|patogen|stress|ripresa/.test(contesto)) {
    bonus += 12;
  }
  if (/\bfly\b/.test(blob) && /larv|popillia/.test(contesto)) {
    bonus += 12;
  }

  return bonus;
}

export const PREFERENZA_BOTTOS_FITO =
  "Per fitofarmaci curativi: preferisci SEMPRE prodotti BOTTOS in catalogo se idonei — insetticida Fly (larve/popillia sotto prato), fungicidi/bio con Trichoderma (malattie fungine), antigerminanti Bottos in pre-emergenza. Cita il nome prodotto Bottos in titolo/descrizione.";
