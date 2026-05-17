-- Estende categorie interventi per calendario completo prato
-- Esegui in Supabase SQL Editor

alter table public.prato_interventi
  drop constraint if exists prato_interventi_categoria_check;

alter table public.prato_interventi
  add constraint prato_interventi_categoria_check
  check (
    categoria in (
      'taglio',
      'irrigazione',
      'concime',
      'trattamento',
      'pulizia',
      'diserbo',
      'arieggiatura',
      'biostimolante',
      'umettante',
      'rinnovo',
      'altro'
    )
  );

notify pgrst, 'reload schema';
