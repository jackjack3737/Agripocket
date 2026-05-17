-- Fix timeout RAG su tgif_knowledge_base (~11k+ chunk, embedding 3072)
-- Esegui in Supabase SQL Editor (una volta)

create extension if not exists vector;

-- Indice ANN per cosine (se fallisce per dimensioni, vedi nota sotto)
drop index if exists public.tgif_knowledge_base_embedding_hnsw_idx;
create index tgif_knowledge_base_embedding_hnsw_idx
  on public.tgif_knowledge_base
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Funzione RAG: prima i K piu vicini (usa indice), poi filtro soglia
create or replace function public.match_documenti(
  query_embedding vector(3072),
  match_threshold float default 0.2,
  match_count int default 8
)
returns table (
  id bigint,
  patologia text,
  specie text,
  soluzione text,
  somiglianza float
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('statement_timeout', '45000', true);
  perform set_config('hnsw.ef_search', '64', true);

  return query
  with nearest as (
    select
      k.id,
      k.patologia,
      k.specie,
      k.soluzione,
      (1 - (k.embedding <=> query_embedding))::float as sim
    from public.tgif_knowledge_base k
    where k.embedding is not null
    order by k.embedding <=> query_embedding
    limit greatest(match_count * 3, 24)
  )
  select
    n.id,
    n.patologia,
    n.specie,
    n.soluzione,
    n.sim as somiglianza
  from nearest n
  where n.sim > match_threshold
  order by n.sim desc
  limit match_count;
end;
$$;

grant execute on function public.match_documenti(vector, float, int) to authenticated;
grant execute on function public.match_documenti(vector, float, int) to service_role;

notify pgrst, 'reload schema';

-- Se HNSW su vector(3072) non e supportato nel tuo piano, usa IVFFlat:
-- drop index if exists public.tgif_knowledge_base_embedding_hnsw_idx;
-- create index tgif_knowledge_base_embedding_ivfflat_idx
--   on public.tgif_knowledge_base
--   using ivfflat (embedding vector_cosine_ops) with (lists = 150);
