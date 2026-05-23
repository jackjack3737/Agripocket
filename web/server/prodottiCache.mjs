/**
 * Cache in-memory catalogo Prodotti (dati statici) — riduce query ripetute su Supabase.
 */

const TTL_MS = Number(process.env.PRODOTTI_CACHE_TTL_MS || 10 * 60 * 1000);

let cache = { data: null, expiresAt: 0, loading: null };

export function invalidateProdottiCache() {
  cache = { data: null, expiresAt: 0, loading: null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {() => Promise<object[]>} loader — es. loadProdottiRaw
 */
export async function getProdottiCached(admin, loader) {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) return cache.data;

  if (cache.loading) return cache.loading;

  cache.loading = (async () => {
    const data = await loader(admin);
    cache.data = data;
    cache.expiresAt = Date.now() + TTL_MS;
    cache.loading = null;
    return data;
  })();

  return cache.loading;
}
