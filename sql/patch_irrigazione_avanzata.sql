-- Irrigazione avanzata: impianto, tempo base, snapshot giornaliero
-- Esegui in Supabase SQL Editor dopo patch_profilo_contesto.sql

alter table public.prato_profilo
  add column if not exists tipo_irrigatori text check (
    tipo_irrigatori is null or tipo_irrigatori in (
      'statici', 'dinamici', 'testine_rotator', 'ala_gocciolante'
    )
  ),
  add column if not exists tempo_irrigazione_base integer check (
    tempo_irrigazione_base is null or (tempo_irrigazione_base >= 1 and tempo_irrigazione_base <= 180)
  ),
  add column if not exists irrigazione_oggi jsonb,
  add column if not exists irrigazione_oggi_aggiornato timestamptz;

comment on column public.prato_profilo.tipo_irrigatori is
  'Tipo impianto: statici, dinamici, testine_rotator, ala_gocciolante';
comment on column public.prato_profilo.tempo_irrigazione_base is
  'Minuti impostati sulla centralina (riferimento per AUMENTA/DIMINUISCI)';
comment on column public.prato_profilo.irrigazione_oggi is
  'Ultimo output motoreIrrigazione (JSON giornaliero)';

notify pgrst, 'reload schema';
