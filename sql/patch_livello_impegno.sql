-- Livello impegno calendario (densità interventi strategici)
-- Esegui in Supabase SQL Editor

alter table public.prato_profilo
  add column if not exists livello_impegno text not null default 'base'
  check (livello_impegno in ('base', 'pro', 'greenkeeper'));

comment on column public.prato_profilo.livello_impegno is
  'Densità piano: base (~20), pro (~35), greenkeeper (~50) interventi strategici/anno';

notify pgrst, 'reload schema';
