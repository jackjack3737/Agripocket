-- Mappa zone prato (irrigatori, ombra, muschio, pendenza) — JSON su profilo
-- Esegui in Supabase SQL Editor dopo patch_profilo_contesto.sql

alter table public.prato_profilo
  add column if not exists prato_zone jsonb;

comment on column public.prato_profilo.prato_zone is
  'Poligono prato + annotazioni: irrigatori (statico/dinamico), ombra, muschio, pendenza';

notify pgrst, 'reload schema';
