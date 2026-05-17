/** Catalogo Prodotti (Supabase) + dosi su m² prato. */

const MAP_CATEGORIA_INTERVENTO = {
  diserbo: ["DISERBANTE SELETTIVO", "DISERBANTE", "DISERBANTE PRE-EMERGENZA", "DISERBANTE PFnPE"],
  trattamento: ["FUNGICIDA", "FUNGICIDA BIO", "INSETTICIDA", "INSETTICIDA BIO", "BIOATTIVATO"],
  concime: ["CONCIME GRANULARE", "CONCIME LIQUIDO", "CONCIME"],
  biostimolante: ["BIOSTIMOLANTE", "BIOATTIVATO"],
  umettante: ["BAGNANTE"],
  rinnovo: ["SEMENTI"],
};

const MESI_IT = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

function meseCorrenteCode() {
  return MESI_IT[new Date().getMonth()];
}

function periodoCompatibile(periodoUso, meseCode = meseCorrenteCode()) {
  if (!periodoUso) return true;
  const p = String(periodoUso).toUpperCase();
  if (/TUTTO|ANNO|SEMPRE/.test(p)) return true;
  if (p.includes(meseCode)) return true;
  const idx = MESI_IT.indexOf(meseCode);
  if (idx < 0) return true;
  const tri = MESI_IT.slice(Math.max(0, idx - 1), idx + 2).join("");
  return p.includes(tri);
}

export async function loadProdotti(admin) {
  const { data, error } = await admin.from("Prodotti").select("*").order("nome");
  if (error) {
    console.warn("[prodotti] load:", error.message);
    return [];
  }
  return data ?? [];
}

export function mqPrato(profilo, fallback = 100) {
  const n = Number(profilo?.superficie_mq);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return fallback;
}

function formattaQuantita(valore, unita, { perMq = false } = {}) {
  const u = (unita || "g").toLowerCase();
  if (u === "ml" && valore >= 1000) return { valore: +(valore / 1000).toFixed(2), unita: "L" };
  if (u === "g" && valore >= 1000) return { valore: +(valore / 1000).toFixed(2), unita: "kg" };
  if (perMq && valore < 10) return { valore: +valore.toFixed(2), unita: u };
  if (u === "ml") return { valore: +valore.toFixed(0), unita: "ml" };
  return { valore: +valore.toFixed(0), unita: u };
}

/**
 * Dose in DB = per m². Totale = dose × mq.
 */
export function calcolaDose(prodotto, superficieMq) {
  const mq = Math.max(1, Number(superficieMq) || 100);
  const unit = (prodotto?.unita_misura || "g").toLowerCase();

  let perMq = Number(prodotto?.dose_fogliare) || 0;
  let via = "fogliare";
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

function scoreProdotto(p, { categoriaIntervento, vision, preferMarca = "BOTTOS" }) {
  let score = 0;
  if (String(p.marca || "").toUpperCase() === preferMarca) score += 8;
  if (periodoCompatibile(p.periodo_uso)) score += 5;

  const blob = `${p.nome} ${p.descrizione} ${p.composizione} ${(p.tag_meteo || []).join(" ")}`.toLowerCase();
  const problemi = (vision?.problemi_rilevati || [])
    .map((x) => `${x.problema} ${x.dettaglio}`)
    .join(" ")
    .toLowerCase();
  const mal = (vision?.malattie_sospette || []).join(" ").toLowerCase();
  const erbe = (vision?.erbette_infestanti || []).join(" ").toLowerCase();
  const ctx = `${problemi} ${mal} ${erbe}`;

  if (categoriaIntervento === "diserbo" && /erbette|trifoglio|tarassaco|dicot|foglia larga/.test(ctx + blob))
    score += 6;
  if (categoriaIntervento === "trattamento" && /fungh|marcium|patogen|oidio|fusarium|rhizoctonia/.test(ctx + blob))
    score += 6;
  if (categoriaIntervento === "concime" && /giall|cloros|nutriz|concim|azoto/.test(ctx + blob)) score += 5;
  if (categoriaIntervento === "biostimolante" && /stress|debole|ripresa/.test(ctx + blob)) score += 4;

  return score;
}

export function filtraProdottiPerIntervento(prodotti, categoriaIntervento) {
  const cats = MAP_CATEGORIA_INTERVENTO[categoriaIntervento];
  if (!cats?.length) return [];
  return prodotti.filter((p) => cats.includes(String(p.categoria || "").toUpperCase()));
}

export function scegliProdotto(prodotti, { categoriaIntervento, vision }) {
  const pool = filtraProdottiPerIntervento(prodotti, categoriaIntervento);
  if (!pool.length) return null;
  const ranked = pool
    .map((p) => ({ p, score: scoreProdotto(p, { categoriaIntervento, vision }) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.p ?? pool[0];
}

export function arricchisciInterventoConProdotto(intervento, profilo, prodotti, vision) {
  const mq = mqPrato(profilo);
  const prodotto = scegliProdotto(prodotti, {
    categoriaIntervento: intervento.categoria,
    vision,
  });
  if (!prodotto) {
    return {
      ...intervento,
      descrizione: [intervento.descrizione, mq !== Number(profilo?.superficie_mq) ? `(Superficie stimata: ${mq} m²)` : null]
        .filter(Boolean)
        .join(" ")
        .slice(0, 500),
    };
  }

  const dose = calcolaDose(prodotto, mq);
  const extra = dose
    ? `Prodotto: ${prodotto.nome} (${prodotto.marca || "—"}). ${dose.testo}.`
    : `Prodotto: ${prodotto.nome}.`;
  const desc = [intervento.descrizione, extra].filter(Boolean).join(" ").slice(0, 900);

  return {
    ...intervento,
    prodotto_id: prodotto.id,
    prodotto_nome: prodotto.nome,
    dose_totale: dose?.dose_totale ?? null,
    dose_unita: dose?.dose_unita ?? null,
    dose_per_mq: dose?.dose_per_mq ?? null,
    dose_display: dose?.dose_display ?? null,
    descrizione: desc,
  };
}

export function catalogoCompattoPerPrompt(prodotti, limit = 80) {
  return prodotti
    .slice(0, limit)
    .map(
      (p) =>
        `id=${p.id} | ${p.nome} | ${p.categoria} | ${p.marca} | fogl=${p.dose_fogliare}${p.unita_misura}/m² rad=${p.dose_radicale}${p.unita_misura}/m² | ${p.periodo_uso || ""}`,
    )
    .join("\n");
}
