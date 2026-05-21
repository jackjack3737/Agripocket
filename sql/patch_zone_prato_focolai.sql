-- Solum / AgriPocket — FASE 1: multi-zona prato + focolai regionali
-- Esegui in Supabase SQL Editor dopo prato_profilo.sql e patch_prato_zone.sql

-- -----------------------------------------------------------------------------
-- 1. zone_prato — da 1 giardino a N zone per utente
-- id = id_zona (UUID usato come FK nelle analisi/interventi)
-- -----------------------------------------------------------------------------
create table if not exists public.zone_prato (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usersagropocket (id) on delete cascade,
  profilo_id uuid references public.prato_profilo (id) on delete set null,
  nome_zona text not null default 'Prato principale',
  metri_quadri integer check (metri_quadri is null or metri_quadri > 0),
  coordinate_gps jsonb check (
    coordinate_gps is null
    or (
      (coordinate_gps ? 'lat') and (coordinate_gps ? 'lon')
      and (coordinate_gps->>'lat')::double precision between -90 and 90
      and (coordinate_gps->>'lon')::double precision between -180 and 180
    )
  ),
  comune varchar(120),
  prato_zone jsonb,
  meteo_agronomico jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.zone_prato is
  'Zone del prato (multi-zona): mappa, mq, GPS e cache meteo agronomico per Gemini';
comment on column public.zone_prato.id is 'id_zona — chiave usata da prato_analisi e prato_interventi';
comment on column public.zone_prato.coordinate_gps is 'Opzionale: {"lat": number, "lon": number}';
comment on column public.zone_prato.meteo_agronomico is
  'Cache ET0, GDD, T suolo 10cm, previsioni — aggiornata da Open-Meteo';

create index if not exists zone_prato_user_id_idx on public.zone_prato (user_id);
create index if not exists zone_prato_user_default_idx on public.zone_prato (user_id, is_default);

create unique index if not exists zone_prato_one_default_per_user
  on public.zone_prato (user_id)
  where is_default = true;

drop trigger if exists trg_zone_prato_updated_at on public.zone_prato;
create trigger trg_zone_prato_updated_at
  before update on public.zone_prato
  for each row
  execute function public.set_usersagropocket_updated_at();

-- -----------------------------------------------------------------------------
-- 2. focolai_regionali — tracciamento anonimo epidemie (solo server in FASE 3)
-- -----------------------------------------------------------------------------
create table if not exists public.focolai_regionali (
  id uuid primary key default gen_random_uuid(),
  comune varchar(120) not null,
  patologia varchar(120) not null,
  data_rilevamento timestamptz not null default now()
);

comment on table public.focolai_regionali is
  'Segnalazioni anonime patologie per comune (nessun user_id)';

create index if not exists focolai_regionali_comune_idx
  on public.focolai_regionali (comune);
create index if not exists focolai_regionali_patologia_idx
  on public.focolai_regionali (patologia);
create index if not exists focolai_regionali_comune_patologia_data_idx
  on public.focolai_regionali (comune, patologia, data_rilevamento desc);

-- -----------------------------------------------------------------------------
-- 3. FK id_zona su analisi e interventi
-- -----------------------------------------------------------------------------
alter table public.prato_analisi
  add column if not exists zona_id uuid references public.zone_prato (id) on delete set null;

alter table public.prato_interventi
  add column if not exists zona_id uuid references public.zone_prato (id) on delete set null;

create index if not exists prato_analisi_zona_id_idx on public.prato_analisi (zona_id);
create index if not exists prato_interventi_zona_id_idx on public.prato_interventi (zona_id);

-- -----------------------------------------------------------------------------
-- 4. Migrazione: un profilo esistente → zona default «Prato principale»
-- -----------------------------------------------------------------------------
insert into public.zone_prato (
  user_id,
  profilo_id,
  nome_zona,
  metri_quadri,
  comune,
  prato_zone,
  is_default
)
select
  p.user_id,
  p.id,
  'Prato principale',
  p.superficie_mq,
  nullif(trim(p.localita), ''),
  p.prato_zone,
  true
from public.prato_profilo p
where not exists (
  select 1 from public.zone_prato z
  where z.user_id = p.user_id and z.is_default = true
);

update public.prato_analisi a
set zona_id = z.id
from public.zone_prato z
where a.zona_id is null
  and z.user_id = a.user_id
  and z.is_default = true;

update public.prato_interventi i
set zona_id = z.id
from public.zone_prato z
where i.zona_id is null
  and z.user_id = i.user_id
  and z.is_default = true;

-- -----------------------------------------------------------------------------
-- 5. RLS zone_prato
-- -----------------------------------------------------------------------------
alter table public.zone_prato enable row level security;

drop policy if exists "zone_prato_select_own" on public.zone_prato;
create policy "zone_prato_select_own"
  on public.zone_prato for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "zone_prato_insert_own" on public.zone_prato;
create policy "zone_prato_insert_own"
  on public.zone_prato for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "zone_prato_update_own" on public.zone_prato;
create policy "zone_prato_update_own"
  on public.zone_prato for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "zone_prato_delete_own" on public.zone_prato;
create policy "zone_prato_delete_own"
  on public.zone_prato for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.zone_prato to authenticated;

-- focolai: lettura aggregata per utenti autenticati; scrittura solo service_role (FASE 3)
alter table public.focolai_regionali enable row level security;

drop policy if exists "focolai_regionali_select_auth" on public.focolai_regionali;
create policy "focolai_regionali_select_auth"
  on public.focolai_regionali for select to authenticated
  using (true);

grant select on public.focolai_regionali to authenticated;

notify pgrst, 'reload schema';
