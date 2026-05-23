/**
 * Testi educativi per l'utente finale (scheda prodotto nel calendario).
 */

export const NOTA_SCELTA_PRODOTTI =
  "I prodotti elencati sono alternative tra loro: ne scegli uno solo, quello che trovi in negozio. Non vanno applicati tutti insieme nello stesso giorno, salvo diversa indicazione in etichetta.";

const PROFILI_PRODOTTO = {
  always: {
    id: "always",
    match: /always/i,
    a_cosa_serve:
      "Sostiene il prato sotto stress (caldo, siccità, dopo un trattamento fitofarmaco). Stimola la fotosintesi e aiuta la pianta ad assorbire meglio i nutrienti. Ideale quando il verde deve reagire in fretta.",
    come_si_usa:
      "Di solito su foglia o con irrigazione leggera, in giornata mite. Cicli tipici in primavera ed estate; segui la dose sulla confezione.",
  },
  vigor: {
    id: "vigor",
    match: /vigor\s*liquid|power\s*liquid/i,
    a_cosa_serve:
      "Lavora soprattutto nel suolo: migliora fertilità e radici con acidi umici e fulvici. Utile per un prato più robusto nel tempo, non come “shock” immediato sulle foglie.",
    come_si_usa:
      "Via radicale: diluisci, applica e fai scendere il prodotto in profondità con una breve irrigazione. Deve agire nel terreno, non solo sulle foglie.",
  },
};

export function profiloProdottoEducazione(nome, composizione = "") {
  const blob = `${nome || ""} ${composizione || ""}`;
  for (const p of Object.values(PROFILI_PRODOTTO)) {
    if (p.match.test(blob)) return p;
  }
  return null;
}

export function spiegazioneProdottoPerUtente(prodotto) {
  const profilo = profiloProdottoEducazione(
    prodotto?.nome_commerciale || prodotto?.nome,
    prodotto?.composizione || prodotto?.principio_attivo,
  );
  if (profilo) {
    return {
      a_cosa_serve: profilo.a_cosa_serve,
      come_si_usa: profilo.come_si_usa,
    };
  }
  const cat = String(prodotto?.macro_categoria || "").toLowerCase();
  if (cat === "biostimolante") {
    return {
      a_cosa_serve:
        "Aiuta il prato a reagire meglio allo stress e a usare in modo più efficiente concimi e acqua. Non sostituisce irrigazione o taglio corretto.",
      come_si_usa: null,
    };
  }
  if (cat === "K" || cat === "N" || cat === "P") {
    return {
      a_cosa_serve: "Apporto nutritivo mirato per sostenere il tappeto in questa fase della stagione.",
      come_si_usa: null,
    };
  }
  return null;
}

/** Nota comparativa se in lista compaiono Always e Vigor/Power insieme. */
export function notaConfrontoBiostimolanti(prodotti) {
  const ids = new Set(
    (prodotti || []).map((p) =>
      profiloProdottoEducazione(p.nome_commerciale || p.nome, p.composizione)?.id,
    ).filter(Boolean),
  );
  if (!ids.has("always") || !ids.has("vigor")) return null;
  return (
    "Always e Vigor/Power Liquid hanno ruoli diversi: non sono la stessa cosa e non servono entrambi lo stesso giorno. " +
    "Scegli Always se il prato è sotto stress e deve recuperare in fretta; scegli Vigor/Power se vuoi migliorare suolo e radici. " +
    "In dubbio, preferisci quello più adatto al momento indicato nella spiegazione sopra."
  );
}
