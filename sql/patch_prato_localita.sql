-- Località prato per meteo (città o CAP) — esegui in Supabase SQL Editor

alter table public.prato_profilo
  add column if not exists localita text;

comment on column public.prato_profilo.localita is 'Città o CAP per meteo OpenWeather (AgriManager)';

notify pgrst, 'reload schema';
