-- Classificazione legale prodotti (PFNPO / professionale) per app B2C
-- Esegui in Supabase SQL Editor

alter table public."Prodotti"
  add column if not exists categoria_legale text check (
    categoria_legale is null
    or categoria_legale in ('CONCIME', 'BIOSTIMOLANTE', 'PFNPO', 'PROFESSIONALE', 'ALTRO')
  );

comment on column public."Prodotti".categoria_legale is
  'Uso legale B2C: PFNPO=fitofarmaco domestico; PROFESSIONALE=escluso da suggerimenti automatici';

-- Backfill euristico (rivedi manualmente prodotti critici)
update public."Prodotti"
set categoria_legale = case
  when upper(categoria) in (
    'CONCIME GRANULARE', 'CONCIME LIQUIDO', 'CONCIME', 'SEMENTI', 'BAGNANTE',
    'BIOSTIMOLANTE', 'BIOATTIVATO', 'AMMENDANTE'
  ) then 'CONCIME'
  when upper(categoria) in (
    'FUNGICIDA BIO', 'DISERBANTE PFnPE', 'DISERBANTE PRE-EMERGENZA',
    'INSETTICIDA BIO', 'INSETTICIDA PFnPE'
  ) then 'PFNPO'
  when upper(categoria) in (
    'FUNGICIDA', 'INSETTICIDA', 'DISERBANTE SELETTIVO', 'DISERBANTE', 'INSETTICIDA'
  ) then 'PROFESSIONALE'
  else coalesce(categoria_legale, 'ALTRO')
end
where categoria_legale is null;

notify pgrst, 'reload schema';
