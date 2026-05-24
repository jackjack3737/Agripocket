import { isFlyBottos, preferisciPoolBottos } from "./bottosFitofarmaci.mjs";

/**
 * Parassiti del prato (larve sotto tappeto, regioni) e abbinamento prodotti catalogo.
 * Fitofarmaci curativi: preferenza BOTTOS (Fly, Trichoderma) quando in catalogo.
 */

/** @typedef {{ id: string, label: string, prodottiPattern: RegExp, interventoPattern: RegExp }} ParassitaDef */

/** @type {ParassitaDef[]} */
const PARASSITI = [
  {
    id: "popillia",
    label: "Popillia (Maggiolino) — larve sotto il prato",
    interventoPattern:
      /popillia|maggiolino|larv[aoe].*sotto|sotto.*tappeto|tappeto.*sollev|zon[aoe].*marronc|june beetle|melolonth|coleotter.*giugno/i,
    prodottiPattern: /\bfly\b|popillia|coleotter|larv|maggiolino|nematocid.*popill/i,
  },
  {
    id: "otiorrinco",
    label: "Otiorrinco (bruchi talpa)",
    interventoPattern: /otiorrinco|bruco.*talpa|talpa.*bruco|notci|weevil/i,
    prodottiPattern: /otiorrinco|talpa|bruco/i,
  },
  {
    id: "lepidotteri",
    label: "Lepidotteri / bruchi fogliari",
    interventoPattern: /bruco|lepidotter|farfall|tunnel|foglie.*mangiat/i,
    prodottiPattern: /bruco|lepidotter|bacillus|insetticid/i,
  },
  {
    id: "afidi",
    label: "Afidi e insetti fogliari",
    interventoPattern: /afid|cimice|trip|moscerin|insetti.*fogli/i,
    prodottiPattern: /afid|insetticid|piretr|olio/i,
  },
  {
    id: "larve_generiche",
    label: "Larve / danni sotterranei non specificati",
    interventoPattern:
      /larv[aoe]|danni.*radic|radici.*mors|prato.*si.*stacca|tappeto.*si.*sollev|sottoprato|sotto.*erba/i,
    prodottiPattern: /\bfly\b|larv|nematocid|insetticid/i,
  },
];

const REGIONI = [
  {
    id: "nord_padana",
    pattern: /lombard|venet|emilia|piemont|friuli|trent|padana|bologna|milano|torino|padova|verona|venezia|trieste/i,
    note: "Nord / pianura padana: popillia (larve mag-giu), otiorrinco (autunno), afidi primavera. Per popillia: insetticida sistemico su larve sotto il tappeto (es. Acetamiprid SL, solo PFNPO).",
  },
  {
    id: "centro",
    pattern: /toscana|lazio|umbria|marche|romagna|firenze|roma|perugia|ancona/i,
    note: "Centro: popillia e lepidotteri estivi; monitorare zone marroni e prato che si stacca.",
  },
  {
    id: "sud",
    pattern: /sicilia|sardegna|puglia|calabria|campania|basilicata|molise|napoli|bari|palermo|catania/i,
    note: "Sud: più stress termico e afidi; larve coleotteri in irrigati; valutare trattamenti mirati con umidità.",
  },
  {
    id: "costa",
    pattern: /liguria|riviera|genova|sanremo|costa/i,
    note: "Costa: afidi e malattie da umidità; meno popillia intensa ma possibile.",
  },
];

function testoCompleto(vision, intervento, report) {
  const parts = [
    vision?.sintesi_visiva,
    ...(vision?.problemi_rilevati || []).map((x) => `${x.problema} ${x.dettaglio}`),
    ...(vision?.malattie_sospette || []),
    ...(vision?.parassiti_sottoprato || []).map((x) =>
      typeof x === "string" ? x : `${x.tipo || ""} ${x.segni || ""} ${x.note || ""}`,
    ),
    intervento?.titolo,
    intervento?.descrizione,
    report,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function regioneDaLocalita(localita) {
  const loc = String(localita || "").toLowerCase();
  for (const r of REGIONI) {
    if (r.pattern.test(loc)) return r;
  }
  return null;
}

/**
 * @returns {{ rilevati: { id: string, label: string }[], regione: object|null, popillia: boolean, larveSottoprato: boolean, testoPrompt: string }}
 */
export function analizzaParassiti({ vision, intervento, report, localita } = {}) {
  const txt = testoCompleto(vision, intervento, report);
  const rilevati = [];

  for (const p of PARASSITI) {
    if (p.interventoPattern.test(txt)) rilevati.push({ id: p.id, label: p.label });
  }

  const regione = regioneDaLocalita(localita);
  const popillia = rilevati.some((r) => r.id === "popillia");
  const larveSottoprato =
    popillia || rilevati.some((r) => r.id === "larve_generiche" || r.id === "otiorrinco");

  const lines = [];
  if (rilevati.length) {
    lines.push(`Parassiti/insetti rilevati: ${rilevati.map((r) => r.label).join("; ")}.`);
    if (popillia) {
      lines.push(
        "Popillia: trattamento mirato contro larve sotto il tappeto (insetticida sistemico, es. Acetamiprid SL). Categoria trattamento, priorità alta se danni visibili.",
      );
    }
  }
  if (regione) lines.push(`Contesto regionale (${regione.id}): ${regione.note}`);
  else if (localita) {
    lines.push(
      "Valuta larve sotto prato (popillia mag-giu al Nord), otiorrinco in autunno, afidi in primavera — principio attivo insetticida da etichetta PFNPO.",
    );
  }

  return {
    rilevati,
    regione,
    popillia,
    larveSottoprato,
    testoPrompt: lines.join("\n"),
  };
}

export function hintParassitiRegionali(localita) {
  const regione = regioneDaLocalita(localita);
  if (regione) {
    return `## Monitoraggio parassiti (zona)
${regione.note}
NON inserire trattamenti insetticidi/fungicidi preventivi: solo monitoraggio visivo o dopo difetti in foto.`;
  }
  return `## Monitoraggio parassiti
Valuta larve sotto prato, otiorrinco e afidi con ispezioni periodiche — nessun trattamento fitofarmaco curativo nel calendario senza danni visibili in foto.`;
}

/** Pool insetticida ristretto al parassita (tutte le marche ammesse). */
export function filtraInsetticidaPerParassita(pool, analisiParassiti) {
  if (!analisiParassiti?.rilevati?.length) return pool;

  const matched = new Set();
  for (const r of analisiParassiti.rilevati) {
    const def = PARASSITI.find((p) => p.id === r.id);
    if (!def) continue;
    for (const p of pool) {
      const blob = `${p.nome} ${p.descrizione} ${p.composizione}`.toLowerCase();
      if (def.prodottiPattern.test(blob)) matched.add(p);
    }
  }

  const arr = [...matched];
  if (arr.length) return preferisciPoolBottos(arr, analisiParassiti.larveSottoprato ? "larve" : "insetti");

  if (analisiParassiti.popillia || analisiParassiti.larveSottoprato) {
    const fly = pool.filter((p) => /\bfly\b/i.test(`${p.nome} ${p.descrizione}`));
    const flyBottos = fly.filter(isFlyBottos);
    if (flyBottos.length) return flyBottos;
    if (fly.length) return fly;
  }

  return preferisciPoolBottos(pool, "insetti");
}

export function ensureInterventoParassiti(interventi, analisiParassiti, oggi, addDays) {
  if (!analisiParassiti?.rilevati?.length) return interventi;
  if (!analisiParassiti?.popillia && !analisiParassiti?.larveSottoprato) return interventi;

  const blob = (i) => `${i.titolo} ${i.descrizione}`.toLowerCase();
  const has = interventi.some(
    (i) =>
      (i.categoria === "trattamento" || i.categoria === "diserbo") &&
      /popillia|larv|fly|maggiolino|sotto.*prato/.test(blob(i)),
  );
  if (has) return interventi;

  const titolo = analisiParassiti.popillia
    ? "Controllo larve popillia sotto il prato"
    : "Monitoraggio larve e insetti sottoprato";

  return [
    ...interventi,
    {
      titolo,
      descrizione: `${analisiParassiti.testoPrompt} Prodotto preferito: insetticida Fly (BOTTOS) da catalogo per larve di coleotteri. Verificare etichetta e normativa.`,
      priorita: analisiParassiti.popillia ? "alta" : "media",
      categoria: "trattamento",
      data_prevista: addDays(oggi, 10),
      ordine: 8500,
    },
  ].sort((a, b) => a.data_prevista.localeCompare(b.data_prevista) || (a.ordine ?? 0) - (b.ordine ?? 0));
}
