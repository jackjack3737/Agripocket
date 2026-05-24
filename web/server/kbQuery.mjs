/**
 * RAG su tgif_knowledge_base con priorità fonte:
 * 1) libri universitari  2) Calendario Verde  3) catalogo Bottos  4) altro web
 */

const TIER_BONUS = {
  libro: 0.14,
  calendario: 0.07,
  catalogo: 0.0,
  altro: -0.04,
};

export function classifyKbChunk(soluzione) {
  const s = String(soluzione || "");
  if (s.startsWith("[libro_universitario:")) return "libro";
  if (s.startsWith("[fonte_scientifica_openalex:")) return "libro";
  if (s.startsWith("CALENDARIO VERDE BOTTOS")) return "calendario";
  if (s.includes("PRODOTTO COMMERCIALE BOTTOS") || s.includes("Fonte catalogo: Bottos")) {
    return "catalogo";
  }
  return "altro";
}

function rerankChunks(rows) {
  return [...rows]
    .map((r) => {
      const tier = classifyKbChunk(r.soluzione);
      const sim = Number(r.somiglianza ?? 0);
      return { ...r, _tier: tier, _score: sim + (TIER_BONUS[tier] ?? 0) };
    })
    .sort((a, b) => b._score - a._score);
}

async function rpcMatch(admin, embedding, { match_count, match_threshold }) {
  return admin.rpc("match_documenti", {
    query_embedding: embedding,
    match_count,
    match_threshold,
  });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {number[]} embedding
 * @param {{ matchCount?: number, fetchCount?: number, matchThreshold?: number, minLibri?: number }} opts
 */
export async function queryKnowledgeBasePrioritized(admin, embedding, opts = {}) {
  const matchCount = opts.matchCount ?? 8;
  const fetchCount = opts.fetchCount ?? Math.max(matchCount * 4, 32);
  const threshold = opts.matchThreshold ?? 0.18;
  const minLibri = opts.minLibri ?? 3;

  const { data, error } = await rpcMatch(admin, embedding, {
    match_count: fetchCount,
    match_threshold: threshold,
  });
  if (error) throw error;

  const ranked = rerankChunks(data ?? []);
  let picked = ranked.slice(0, matchCount);

  const libriInPicked = picked.filter((r) => r._tier === "libro").length;
  if (libriInPicked < minLibri) {
    const extraLibri = ranked.filter((r) => r._tier === "libro" && !picked.includes(r)).slice(0, minLibri - libriInPicked);
    if (extraLibri.length) {
      picked = [...extraLibri, ...picked.filter((r) => r._tier !== "libro")].slice(0, matchCount);
    }
  }

  return picked.map(({ _tier, _score, ...r }) => r);
}

/** Come analizzaPratoCore: retry su timeout con soglie più basse. */
export async function queryKnowledgeBasePrioritizedWithRetry(admin, embedding, opts = {}) {
  const attempts = opts.attempts ?? [
    { matchCount: opts.matchCount ?? 8, fetchCount: 32, matchThreshold: 0.2 },
    { matchCount: 6, fetchCount: 24, matchThreshold: 0.18 },
  ];
  let lastErr = null;
  for (const a of attempts) {
    try {
      return await queryKnowledgeBasePrioritized(admin, embedding, { ...opts, ...a });
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (!/timeout|timed out|57014/i.test(msg)) break;
    }
  }
  throw lastErr;
}
