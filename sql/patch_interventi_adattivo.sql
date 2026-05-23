-- Piano adattivo: stato sospeso + metadati adattamento (opzionale)
-- Esegui in Supabase SQL Editor

alter table public.prato_interventi drop constraint if exists prato_interventi_stato_check;

alter table public.prato_interventi
  add constraint prato_interventi_stato_check
  check (stato in ('pianificato', 'completato', 'sospeso'));

comment on column public.prato_interventi.stato is
  'pianificato | completato | sospeso (es. azoto bloccato per fungo in foto)';

notify pgrst, 'reload schema';
