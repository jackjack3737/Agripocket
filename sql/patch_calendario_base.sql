-- Solum — Calendario base «anno normale» + climatologia macro-zone Italia
-- Esegui in Supabase SQL Editor PRIMA di: node server/scripts/seed_calendario_base.mjs
--
-- Macro-zone (runtime: assegnazione da coordinate GPS, non da comune):
--   nord_pianura | centro_tirrenico | sud_isole_arido | alpino_appenninico

-- -----------------------------------------------------------------------------
-- 1. clima_mese_normale — riferimento climatico mensile (anno tipo)
-- -----------------------------------------------------------------------------
create table if not exists public.clima_mese_normale (
  id bigserial primary key,
  zona_climatica text not null,
  mese smallint not null check (mese between 1 and 12),
  t_media_c numeric(4, 1) not null,
  t_min_media_c numeric(4, 1),
  gdd_mese numeric(6, 1) not null default 0,
  et0_mm_giorno numeric(4, 2) not null default 2.5,
  pioggia_mm numeric(6, 1) not null default 50,
  kc_prato numeric(4, 2) not null default 0.65,
  note text,
  created_at timestamptz not null default now(),
  constraint clima_mese_normale_zona_check check (
    zona_climatica in (
      'nord_pianura',
      'centro_tirrenico',
      'sud_isole_arido',
      'alpino_appenninico'
    )
  ),
  constraint clima_mese_normale_uniq unique (zona_climatica, mese)
);

comment on table public.clima_mese_normale is
  'Climatologia mensile di riferimento per macro-zone Italia (anno normale). Usata per delta meteo vs Open-Meteo live.';
comment on column public.clima_mese_normale.gdd_mese is
  'GDD mensile cumulato (base 10 °C) — valore tipico anno normale';
comment on column public.clima_mese_normale.kc_prato is
  'Coefficiente colturale prato tappeto erboso — allineato a motore irrigazione / RAG';

create index if not exists clima_mese_normale_zona_idx
  on public.clima_mese_normale (zona_climatica);

-- -----------------------------------------------------------------------------
-- 2. calendario_base_intervento — template manutenzione deterministica Solum
-- -----------------------------------------------------------------------------
create table if not exists public.calendario_base_intervento (
  id bigserial primary key,
  zona_climatica text not null,
  uso text not null default '*',
  livello_impegno text not null default '*',
  mese smallint not null check (mese between 1 and 12),
  giorno_mese smallint not null check (giorno_mese between 1 and 28),
  categoria text not null,
  priorita text not null default 'media',
  titolo text not null,
  fabbisogno_fisiologico text not null,
  esigenze_molecolari text[] not null default '{}',
  macro_categoria text,
  finestra_shift_giorni smallint not null default 7
    check (finestra_shift_giorni between 0 and 21),
  ordine smallint not null default 100,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendario_base_zona_check check (
    zona_climatica in (
      'nord_pianura',
      'centro_tirrenico',
      'sud_isole_arido',
      'alpino_appenninico'
    )
  ),
  constraint calendario_base_priorita_check check (
    priorita in ('alta', 'media', 'bassa')
  ),
  constraint calendario_base_livello_check check (
    livello_impegno in ('*', 'base', 'pro', 'greenkeeper')
  ),
  constraint calendario_base_categoria_check check (
    categoria in (
      'concime',
      'trattamento',
      'diserbo',
      'arieggiatura',
      'biostimolante',
      'umettante',
      'rinnovo',
      'pulizia',
      'altro'
    )
  )
);

comment on table public.calendario_base_intervento is
  'Piano manutenzione anno tipo (Solum): date relative mese/giorno, molecole senza brand. Istanziazione runtime + adattamento meteo.';
comment on column public.calendario_base_intervento.uso is
  'Filtro profilo (es. giardino, sportivo) oppure * = tutti';
comment on column public.calendario_base_intervento.livello_impegno is
  'base | pro | greenkeeper | * = tutti';
comment on column public.calendario_base_intervento.esigenze_molecolari is
  'Necessità biochimiche (N-P-K, umici, principi attivi generici) — mai nomi commerciali';
comment on column public.calendario_base_intervento.finestra_shift_giorni is
  'Massimo spostamento data_prevista consentito dal motore meteo (± giorni)';

create index if not exists calendario_base_zona_mese_idx
  on public.calendario_base_intervento (zona_climatica, mese, giorno_mese);
create index if not exists calendario_base_attivo_idx
  on public.calendario_base_intervento (zona_climatica, attivo)
  where attivo = true;

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger (riusa funzione progetto se presente)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_usersagropocket_updated_at'
  ) then
    drop trigger if exists trg_calendario_base_intervento_updated_at on public.calendario_base_intervento;
    create trigger trg_calendario_base_intervento_updated_at
      before update on public.calendario_base_intervento
      for each row
      execute function public.set_usersagropocket_updated_at();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. RLS — lettura per utenti autenticati; scrittura solo service_role (seed/admin)
-- -----------------------------------------------------------------------------
alter table public.clima_mese_normale enable row level security;
alter table public.calendario_base_intervento enable row level security;

drop policy if exists "clima_mese_normale_select_auth" on public.clima_mese_normale;
create policy "clima_mese_normale_select_auth"
  on public.clima_mese_normale for select to authenticated
  using (true);

drop policy if exists "calendario_base_intervento_select_auth" on public.calendario_base_intervento;
create policy "calendario_base_intervento_select_auth"
  on public.calendario_base_intervento for select to authenticated
  using (attivo = true);

grant select on public.clima_mese_normale to authenticated;
grant select on public.calendario_base_intervento to authenticated;

notify pgrst, 'reload schema';
