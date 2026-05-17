-- Fix timeout RAG su tgif_knowledge_base (~11k chunk, embedding 3072 Gemini)
-- HNSW su vector(3072) non e supportato (max 2000): indice su halfvec(3072).
-- Esegui in Supabase SQL Editor (una volta)

create extension if not exists vector;

drop index if exists public.tgif_knowledge_base_embedding_hnsw_idx;
drop index if exists public.tgif_knowledge_base_embedding_ivfflat_idx;

-- Indice HNSW su halfvec (fino a 4000 dim con pgvector >= 0.7)
create index tgif_knowledge_base_embedding_hnsw_idx
  on public.tgif_knowledge_base
  using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Ricrea da zero se cambia il tipo di ritorno (CREATE OR REPLACE non basta)
drop function if exists public.match_documenti(vector, double precision, integer);
drop function if exists public.match_documenti(vector, real, integer);
drop function if exists public.match_documenti(vector, float, integer);

create function public.match_documenti(
  query_embedding vector(3072),
  match_threshold float default 0.2,
  match_count int default 8
)
returns table (
  id bigint,
  patologia text,
  specie text,
  soluzione text,
  somiglianza double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q halfvec(3072);
begin
  perform set_config('statement_timeout', '45000', true);
  perform set_config('hnsw.ef_search', '64', true);
  q := query_embedding::halfvec(3072);

  return query
  with nearest as (
    select
      k.id,
      k.patologia,
      k.specie,
      k.soluzione,
      (1 - (k.embedding::halfvec(3072) <=> q))::float as sim
    from public.tgif_knowledge_base k
    where k.embedding is not null
    order by k.embedding::halfvec(3072) <=> q
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

grant execute on function public.match_documenti(vector, double precision, integer) to authenticated;
grant execute on function public.match_documenti(vector, double precision, integer) to service_role;

notify pgrst, 'reload schema';

-- Fallback se halfvec non disponibile (pgvector vecchio): solo funzione + timeout, senza indice.
-- La ricerca resta lenta (~8s) ma non va in timeout grazie a statement_timeout 45s.
