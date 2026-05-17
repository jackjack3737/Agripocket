-- Campi prodotto suggerito + dose calcolata sui m² del prato
-- Esegui in Supabase SQL Editor

alter table public.prato_interventi
  add column if not exists prodotto_id integer,
  add column if not exists prodotto_nome text,
  add column if not exists dose_totale numeric,
  add column if not exists dose_unita text,
  add column if not exists dose_per_mq numeric;

notify pgrst, 'reload schema';
