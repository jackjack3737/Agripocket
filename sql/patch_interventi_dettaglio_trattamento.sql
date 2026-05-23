-- Educazione → Soluzione: JSON strutturato su prato_interventi
-- Esegui in Supabase SQL Editor dopo patch_prodotti_agronomic_guardrails.sql

alter table public.prato_interventi
  add column if not exists spiegazione_semplice text,
  add column if not exists dettaglio_trattamento jsonb;

comment on column public.prato_interventi.spiegazione_semplice is
  'Testo educativo per utente finale (fase 2 pipeline trattamenti)';
comment on column public.prato_interventi.dettaglio_trattamento is
  'JSON: tipo_intervento, spiegazione_semplice, prodotti_consigliati[], contesto_meteo';

notify pgrst, 'reload schema';
