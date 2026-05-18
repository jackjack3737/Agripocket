-- Aggiunge valore 'robot' a frequenza_taglio (robot tagliaerba)
-- Esegui in Supabase SQL Editor se patch_profilo_contesto.sql è già stato applicato senza 'robot'

alter table public.prato_profilo drop constraint if exists prato_profilo_frequenza_taglio_check;

alter table public.prato_profilo
  add constraint prato_profilo_frequenza_taglio_check check (
    frequenza_taglio is null
    or frequenza_taglio in ('settimanale', 'quindicinale', 'robot', 'raro', 'non_so')
  );

notify pgrst, 'reload schema';
