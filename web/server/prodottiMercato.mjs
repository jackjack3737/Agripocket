/**
 * Vetrina prodotti_mercato → formato catalogo + indice collegamenti calendario_base_intervento.
 */

import {
  matchProdottiPerIntervento,
  normalizzaMatchScorePerDb,
} from "./link_prodotti_calendario.mjs";

const AGR_TO_LEGACY_CAT = {
  "Concime NPK": "CONCIME GRANULARE",
  Biostimolante: "BIOSTIMOLANTE",
  Fungicida: "FUNGICIDA",
  Diserbante: "DISERBANTE SELETTIVO",
  Insetticida: "INSETTICIDA",
  Bagnante: "BAGNANTE",
  Semente: "SEMENTI",
  Correttivo: "CONCIME GRANULARE",
  Altro: "CONCIME GRANULARE",
};

export function interventoTemplateKey({ categoria, macro_categoria, titolo }) {
  const t = String(titolo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 48);
  return `${String(categoria || "").toLowerCase()}|${String(macro_categoria || "").toUpperCase()}|${t}`;
}

export function mercatoToCatalogRow(row) {
  if (!row?.prodotto) return null;
  const catAg = row.categoria_agronomica || "Altro";
  const legacyCat = AGR_TO_LEGACY_CAT[catAg] || "CONCIME GRANULARE";
  const comp = Array.isArray(row.composizione_molecolare_dichiarata)
    ? row.composizione_molecolare_dichiarata.join("; ")
    : "";
  const targets = Array.isArray(row.target_fisiologico) ? row.target_fisiologico.join("; ") : "";

  return {
    id: `mercato:${row.id}`,
    mercato_id: row.id,
    nome: row.prodotto,
    marca: row.produttore || "",
    categoria: legacyCat,
    categoria_agronomica: catAg,
    composizione: comp,
    principio_attivo: comp.split(";")[0]?.trim() || null,
    descrizione: targets || row.raw_text_excerpt?.slice(0, 200) || "",
    macro_categoria: row.macro_categoria || null,
    periodo_uso: null,
    periodo_ideale: null,
    unita_misura: "g",
    dosaggio_standard_mq: null,
    dose_fogliare: null,
    dose_radicale: null,
    is_bio: row.is_bio,
    _from_mercato: true,
    _match_score: row._match_score ?? null,
    _match_reason: row._match_reason ?? null,
  };
}

export function mercatoAsMatchShape(row) {
  return {
    prodotto: row.prodotto,
    produttore: row.produttore,
    categoria_agronomica: row.categoria_agronomica,
    composizione_molecolare_dichiarata: row.composizione_molecolare_dichiarata || [],
    target_fisiologico: row.target_fisiologico || [],
  };
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function loadProdottiMercatoRows(admin) {
  const all = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin
      .from("prodotti_mercato")
      .select(
        "id, prodotto, produttore, categoria_agronomica, composizione_molecolare_dichiarata, target_fisiologico, is_bio, macro_categoria, categoria_intervento, raw_text_excerpt",
      )
      .eq("attivo", true)
      .in("validation_status", ["valid", "warning"])
      .range(from, from + 499);
    if (error) throw new Error(`prodotti_mercato: ${error.message}`);
    all.push(...(data || []));
    if (!data?.length || data.length < 500) break;
  }
  return all;
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function loadIndiceProdottiPerIntervento(admin) {
  const [{ data: templates }, { data: links }] = await Promise.all([
    admin
      .from("calendario_base_intervento")
      .select("id, categoria, macro_categoria, titolo")
      .eq("attivo", true)
      .limit(800),
    admin
      .from("prodotti_mercato_intervento")
      .select(
        "calendario_base_intervento_id, match_score, match_reason, prodotti_mercato ( id, prodotto, produttore, categoria_agronomica, composizione_molecolare_dichiarata, target_fisiologico, is_bio, macro_categoria, categoria_intervento, raw_text_excerpt )",
      )
      .order("match_score", { ascending: false })
      .limit(50000),
  ]);

  const byTemplateId = new Map();
  for (const link of links || []) {
    const pm = link.prodotti_mercato;
    if (!pm?.prodotto) continue;
    const tid = link.calendario_base_intervento_id;
    if (!byTemplateId.has(tid)) byTemplateId.set(tid, []);
    const cat = mercatoToCatalogRow({
      ...pm,
      _match_score: Number(link.match_score),
      _match_reason: link.match_reason,
    });
    if (cat) byTemplateId.get(tid).push(cat);
  }

  const byKey = new Map();
  for (const t of templates || []) {
    const key = interventoTemplateKey(t);
    const list = byTemplateId.get(t.id);
    if (list?.length) byKey.set(key, list);
  }
  return byKey;
}

/**
 * Prodotti mercato idonei per un intervento (motore matchmaking Solum).
 */
export function rankMercatoPerIntervento(intervento, mercatoRows, { max = 12, minScore } = {}) {
  const matches = matchProdottiPerIntervento(intervento, mercatoRows, {
    max,
    minScore: minScore ?? undefined,
  });
  return matches
    .map((m) => {
      const row = mercatoRows.find((r) => r.id === m.id_prodotto);
      if (!row) return null;
      return mercatoToCatalogRow({
        ...row,
        _match_score: m.match_score_db ?? normalizzaMatchScorePerDb(m.match_score),
        _match_reason: m.motivo_suggerimento,
        _match_score_punti: m.match_score,
      });
    })
    .filter(Boolean);
}

export function prodottiDaIndiceCalendario(intervento, indice, { max = 3 } = {}) {
  const key = interventoTemplateKey(intervento);
  const list = indice?.get(key);
  if (!list?.length) return [];
  return list.slice(0, max);
}
