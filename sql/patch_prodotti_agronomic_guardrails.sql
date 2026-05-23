-- Agronomic Guardrails: prodotti brand-agnostic + output strutturato calendario
-- Esegui in Supabase SQL Editor dopo patch_interventi_prodotto.sql

-- -----------------------------------------------------------------------------
-- 1. Catalogo Prodotti (tabella esistente "Prodotti")
-- -----------------------------------------------------------------------------
alter table public."Prodotti"
  add column if not exists macro_categoria text,
  add column if not exists principio_attivo text,
  add column if not exists dosaggio_standard_mq numeric,
  add column if not exists periodo_ideale text,
  add column if not exists salt_index smallint;

comment on column public."Prodotti".macro_categoria is
  'N, P, K, Biostimolante, Correttivo, Fungicida, Insetticida, Diserbante, Semente, Bagnante, Altro';
comment on column public."Prodotti".salt_index is
  'Indice salinità relativo 0-100 (concimi salati / correttivi)';

-- Backfill macro_categoria da categoria/composizione (euristica)
update public."Prodotti" p set
  macro_categoria = case
    when upper(coalesce(p.categoria, '')) like '%SEMENT%' then 'Semente'
    when upper(coalesce(p.categoria, '')) like '%BAGNANT%' then 'Bagnante'
    when upper(coalesce(p.categoria, '')) like '%FUNGICID%' then 'Fungicida'
    when upper(coalesce(p.categoria, '')) like '%INSETTICID%' then 'Insetticida'
    when upper(coalesce(p.categoria, '')) like '%DISERBANT%' then 'Diserbante'
    when upper(coalesce(p.categoria, '')) like '%BIOSTIM%' or upper(coalesce(p.categoria, '')) like '%BIOATTIV%' then 'Biostimolante'
    when upper(coalesce(p.composizione, '') || ' ' || coalesce(p.nome, '')) ~* 'potass|autumn k|\bk2o\b|0-0-[1-9]' then 'K'
    when upper(coalesce(p.composizione, '') || ' ' || coalesce(p.nome, '')) ~* 'fosfor|phosph|\bp2o5\b' then 'P'
    when upper(coalesce(p.composizione, '') || ' ' || coalesce(p.nome, '')) ~* 'azoto|urea|ammon|nitrat' then 'N'
    when upper(coalesce(p.categoria, '')) like '%CONCIME%' then 'N'
    when upper(coalesce(p.categoria, '')) like '%AMMEND%' or upper(coalesce(p.nome, '')) ~* 'leonardit|humus|micorriz' then 'Correttivo'
    else 'Altro'
  end
where p.macro_categoria is null;

-- dose_fogliare / dose_radicale possono essere text nel catalogo: cast sicuro a numeric
update public."Prodotti" set
  dosaggio_standard_mq = coalesce(
    dosaggio_standard_mq,
    case
      when nullif(trim(coalesce(dose_fogliare::text, '')), '') ~ '^[0-9]+([.,][0-9]+)?$'
        then replace(trim(dose_fogliare::text), ',', '.')::numeric
    end,
    case
      when nullif(trim(coalesce(dose_radicale::text, '')), '') ~ '^[0-9]+([.,][0-9]+)?$'
        then replace(trim(dose_radicale::text), ',', '.')::numeric
    end
  ),
  periodo_ideale = coalesce(periodo_ideale, periodo_uso::text)
where dosaggio_standard_mq is null or periodo_ideale is null;

update public."Prodotti" set salt_index = case
  when macro_categoria in ('K', 'N') and upper(coalesce(composizione, '') || nome) ~* 'cloruro|solfato|nitrato' then 45
  when macro_categoria = 'Correttivo' then 25
  when macro_categoria in ('Biostimolante', 'Bagnante') then 5
  else 10
end
where salt_index is null;

create index if not exists prodotti_macro_categoria_idx on public."Prodotti" (macro_categoria);

-- -----------------------------------------------------------------------------
-- 2. Output strutturato su prato_interventi
-- -----------------------------------------------------------------------------
alter table public.prato_interventi
  add column if not exists razionale_scientifico text,
  add column if not exists messaggio_ux text,
  add column if not exists macro_categoria text,
  add column if not exists dosaggio_calcolato text;

comment on column public.prato_interventi.macro_categoria is
  'Macro categoria prodotto applicata (guardrail anti-sovrapposizione)';

notify pgrst, 'reload schema';
