-- Priorità fonti RAG: libri universitari > Calendario Verde > catalogo Bottos
-- Opzionale se usi già kbQuery.mjs lato server; esegui per allineare anche RPC dirette.

drop function if exists public.match_documenti(vector, double precision, integer);

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
  fetch_n int;
begin
  perform set_config('statement_timeout', '45000', true);
  perform set_config('hnsw.ef_search', '64', true);
  q := query_embedding::halfvec(3072);
  fetch_n := greatest(match_count * 4, 32);

  return query
  with nearest as (
    select
      k.id,
      k.patologia,
      k.specie,
      k.soluzione,
      (1 - (k.embedding::halfvec(3072) <=> q))::float as sim,
      case
        when k.soluzione like '[libro_universitario:%' then 0.14
        when k.soluzione like 'CALENDARIO VERDE BOTTOS%' then 0.07
        when k.soluzione like 'PRODOTTO COMMERCIALE BOTTOS%' then 0.0
        else -0.04
      end as bonus
    from public.tgif_knowledge_base k
    where k.embedding is not null
    order by k.embedding::halfvec(3072) <=> q
    limit fetch_n
  ),
  scored as (
    select
      n.*,
      (n.sim + n.bonus) as score
    from nearest n
    where n.sim > match_threshold
  )
  select
    s.id,
    s.patologia,
    s.specie,
    s.soluzione,
    s.sim::double precision as somiglianza
  from scored s
  order by s.score desc
  limit match_count;
end;
$$;

grant execute on function public.match_documenti(vector, double precision, integer) to authenticated;
grant execute on function public.match_documenti(vector, double precision, integer) to service_role;

notify pgrst, 'reload schema';
