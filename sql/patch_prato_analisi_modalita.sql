-- Modalità analisi (prato completo vs macchia Chiedi all'agronomo) + GC foto 15gg
alter table public.prato_analisi
  add column if not exists modalita text;

comment on column public.prato_analisi.modalita is
  'prato = analisi foto completa prato; macchia_zona = modulo Chiedi all''agronomo';

-- Storico senza flag: trattato come analisi prato (non toccato dalla GC)
update public.prato_analisi
set modalita = 'prato'
where modalita is null;

-- Backfill macchia da interventi ia_macchia collegati
update public.prato_analisi a
set modalita = 'macchia_zona'
where coalesce(a.modalita, 'prato') <> 'macchia_zona'
  and exists (
    select 1
    from public.prato_interventi i
    where i.analisi_id = a.id
      and i.fonte = 'ia_macchia'
  );

create index if not exists prato_analisi_macchia_cleanup_idx
  on public.prato_analisi (user_id, created_at)
  where modalita = 'macchia_zona';

notify pgrst, 'reload schema';
