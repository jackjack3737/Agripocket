-- Contesto prato livello A (obbligatorio in onboarding) e C (avanzato opzionale)
-- Esegui in Supabase SQL Editor dopo prato_profilo.sql

alter table public.prato_profilo
  add column if not exists eta_prato text check (
    eta_prato is null or eta_prato in ('nuovo', '1_3_anni', 'maturo', 'non_so')
  ),
  add column if not exists obiettivo text check (
    obiettivo is null or obiettivo in ('estetico', 'resistente', 'bassa_manutenzione', 'non_so')
  ),
  add column if not exists frequenza_taglio text check (
    frequenza_taglio is null or frequenza_taglio in ('settimanale', 'quindicinale', 'robot', 'raro', 'non_so')
  ),
  add column if not exists altezza_taglio_cm text check (
    altezza_taglio_cm is null or altezza_taglio_cm in ('2_3', '4_5', '6_plus', 'non_so')
  ),
  add column if not exists animali text check (
    animali is null or animali in ('nessuno', 'cane', 'altro', 'non_so')
  ),
  add column if not exists ultimo_trattamento_tipo text check (
    ultimo_trattamento_tipo is null
    or ultimo_trattamento_tipo in (
      'concime', 'diserbo', 'fungicida', 'biostimolante', 'insetticida', 'nessuno', 'non_so'
    )
  ),
  add column if not exists ultimo_trattamento_quando text check (
    ultimo_trattamento_quando is null
    or ultimo_trattamento_quando in ('settimana', 'mese', 'stagione', 'oltre_anno', 'non_so')
  ),
  add column if not exists problemi_noti text[] not null default '{}',
  add column if not exists pendenza text check (
    pendenza is null or pendenza in ('piana', 'leggera', 'marcata', 'non_so')
  ),
  add column if not exists ristagno_acqua text check (
    ristagno_acqua is null or ristagno_acqua in ('mai', 'dopo_pioggia', 'spesso', 'non_so')
  ),
  add column if not exists ombra_zone_pct text check (
    ombra_zone_pct is null or ombra_zone_pct in ('0_25', '25_50', '50_75', '75_100', 'non_so')
  ),
  add column if not exists ph_terreno text check (
    ph_terreno is null or ph_terreno in ('acido', 'neutro', 'alcalino', 'non_so')
  ),
  add column if not exists ph_valore numeric(3, 1) check (
    ph_valore is null or (ph_valore >= 4.0 and ph_valore <= 9.0)
  ),
  add column if not exists analisi_terreno_fatta boolean not null default false,
  add column if not exists note_terreno text;

notify pgrst, 'reload schema';
