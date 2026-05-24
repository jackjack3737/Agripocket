-- Solum — Product Mining: catalogo etichette commerciali + collegamento interventi template
-- Esegui in Supabase SQL Editor DOPO patch_calendario_base.sql
--
-- Pipeline: PDF/immagine → OCR/Gemini → prodotti_mercato → match calendario_base_intervento

-- -----------------------------------------------------------------------------
-- 1. prodotti_mercato — prodotto estratto da etichetta (miner)
-- -----------------------------------------------------------------------------
create table if not exists public.prodotti_mercato (
  id uuid primary key default gen_random_uuid(),
  prodotto text not null,
  produttore text,
  categoria_agronomica text not null,
  composizione_molecolare_dichiarata text[] not null default '{}',
  target_fisiologico text[] not null default '{}',
  is_bio boolean not null default false,
  -- Allineamento calendario Solum (macro categoria intervento)
  macro_categoria text,
  categoria_intervento text,
  -- Metadati estrazione
  source_type text not null default 'unknown'
    check (source_type in ('pdf', 'image', 'text', 'manual', 'unknown')),
  source_file text,
  source_hash text,
  raw_text_excerpt text,
  extracted_json jsonb,
  gemini_model text,
  confidence_score numeric(4, 3) check (confidence_score is null or confidence_score between 0 and 1),
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'warning', 'rejected')),
  validation_notes text[] not null default '{}',
  -- Collegamento opzionale catalogo legacy "Prodotti"
  prodotto_catalogo_id bigint,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prodotti_mercato_categoria_check check (
    categoria_agronomica in (
      'Biostimolante',
      'Concime NPK',
      'Correttivo',
      'Fungicida',
      'Diserbante',
      'Insetticida',
      'Bagnante',
      'Semente',
      'Altro'
    )
  ),
  constraint prodotti_mercato_macro_check check (
    macro_categoria is null
    or macro_categoria in (
      'N', 'P', 'K', 'Biostimolante', 'Correttivo',
      'Fungicida', 'Insetticida', 'Diserbante', 'Semente', 'Bagnante', 'Altro'
    )
  ),
  constraint prodotti_mercato_categoria_intervento_check check (
    categoria_intervento is null
    or categoria_intervento in (
      'concime', 'trattamento', 'diserbo', 'arieggiatura',
      'biostimolante', 'umettante', 'rinnovo', 'pulizia', 'altro'
    )
  )
);

comment on table public.prodotti_mercato is
  'Catalogo prodotti commerciali da etichette (Product Mining). Separato da "Prodotti" legacy BOTTOS.';
comment on column public.prodotti_mercato.composizione_molecolare_dichiarata is
  'Composizione dichiarata in etichetta (es. 5% Acidi Fulvici)';
comment on column public.prodotti_mercato.target_fisiologico is
  'Target fisiologici dichiarati o inferiti (stress termico, radicazione, …)';
comment on column public.prodotti_mercato.source_hash is
  'SHA-256 file sorgente — deduplica ingest';
comment on column public.prodotti_mercato.validation_status is
  'pending | valid | warning | rejected dopo pipeline Validation';

create unique index if not exists prodotti_mercato_source_hash_uidx
  on public.prodotti_mercato (source_hash)
  where source_hash is not null;

create index if not exists prodotti_mercato_categoria_idx
  on public.prodotti_mercato (categoria_agronomica, attivo);

create index if not exists prodotti_mercato_macro_idx
  on public.prodotti_mercato (macro_categoria);

create index if not exists prodotti_mercato_validation_idx
  on public.prodotti_mercato (validation_status);

-- -----------------------------------------------------------------------------
-- 2. prodotti_mercato_intervento — N:N con template calendario_base_intervento
-- -----------------------------------------------------------------------------
create table if not exists public.prodotti_mercato_intervento (
  prodotto_mercato_id uuid not null references public.prodotti_mercato (id) on delete cascade,
  calendario_base_intervento_id bigint not null
    references public.calendario_base_intervento (id) on delete cascade,
  match_score numeric(5, 3) not null default 0
    check (match_score between 0 and 1),
  match_reason text,
  match_auto boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (prodotto_mercato_id, calendario_base_intervento_id)
);

comment on table public.prodotti_mercato_intervento is
  'Collegamento prodotto commerciale ↔ intervento template Solum (match molecolare/fisiologico).';

create index if not exists prodotti_mercato_intervento_intervento_idx
  on public.prodotti_mercato_intervento (calendario_base_intervento_id);

-- -----------------------------------------------------------------------------
-- 3. prodotti_mercato_ingest_batch — tracciamento batch mining
-- -----------------------------------------------------------------------------
create table if not exists public.prodotti_mercato_ingest_batch (
  id uuid primary key default gen_random_uuid(),
  label text,
  files_total int not null default 0,
  files_ok int not null default 0,
  files_rejected int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text
);

comment on table public.prodotti_mercato_ingest_batch is
  'Log batch Product Mining (cartella PDF/immagini processata in una run).';

alter table public.prodotti_mercato
  add column if not exists ingest_batch_id uuid references public.prodotti_mercato_ingest_batch (id);

-- -----------------------------------------------------------------------------
-- 4. FK opzionale verso catalogo legacy (se esiste tabella "Prodotti")
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'Prodotti'
  ) then
    alter table public.prodotti_mercato
      drop constraint if exists prodotti_mercato_catalogo_fk;
    alter table public.prodotti_mercato
      add constraint prodotti_mercato_catalogo_fk
      foreign key (prodotto_catalogo_id) references public."Prodotti" (id)
      on delete set null;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. updated_at trigger
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_usersagropocket_updated_at'
  ) then
    drop trigger if exists trg_prodotti_mercato_updated_at on public.prodotti_mercato;
    create trigger trg_prodotti_mercato_updated_at
      before update on public.prodotti_mercato
      for each row
      execute function public.set_usersagropocket_updated_at();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. RLS — lettura authenticated; scrittura service_role (miner script)
-- -----------------------------------------------------------------------------
alter table public.prodotti_mercato enable row level security;
alter table public.prodotti_mercato_intervento enable row level security;
alter table public.prodotti_mercato_ingest_batch enable row level security;

drop policy if exists "prodotti_mercato_select_auth" on public.prodotti_mercato;
create policy "prodotti_mercato_select_auth"
  on public.prodotti_mercato for select to authenticated
  using (attivo = true and validation_status in ('valid', 'warning'));

drop policy if exists "prodotti_mercato_intervento_select_auth" on public.prodotti_mercato_intervento;
create policy "prodotti_mercato_intervento_select_auth"
  on public.prodotti_mercato_intervento for select to authenticated
  using (true);

grant select on public.prodotti_mercato to authenticated;
grant select on public.prodotti_mercato_intervento to authenticated;

notify pgrst, 'reload schema';
