-- Profilo prato per utente AgriPocket (onboarding agronomo)
-- Esegui in Supabase SQL Editor dopo usersagropocket.sql
-- Se il salvataggio fallisce dopo la creazione: esegui anche patch_ensure_usersagropocket.sql

create table if not exists public.prato_profilo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usersagropocket (id) on delete cascade,
  uso text check (uso in ('giardino', 'ornamentale', 'sport', 'professionale')),
  tipo_seme text check (tipo_seme in ('cespitoso', 'tappeto', 'rustico', 'misto', 'non_so')),
  marca_seme text,
  esposizione text check (esposizione in ('sole_pieno', 'mezzombra', 'ombra')),
  tipo_terreno text check (tipo_terreno in ('sabbioso', 'medio', 'argilloso', 'non_so')),
  irrigazione text check (irrigazione in ('automatica', 'manuale', 'pioggia', 'non_so')),
  superficie_mq integer check (superficie_mq is null or superficie_mq > 0),
  localita text,
  note text,
  onboarding_completato boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prato_profilo_user_unique unique (user_id)
);

create index if not exists prato_profilo_user_id_idx on public.prato_profilo (user_id);

create trigger trg_prato_profilo_updated_at
  before update on public.prato_profilo
  for each row
  execute function public.set_usersagropocket_updated_at();

alter table public.prato_profilo enable row level security;

drop policy if exists "prato_profilo_select_own" on public.prato_profilo;
create policy "prato_profilo_select_own"
  on public.prato_profilo for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "prato_profilo_insert_own" on public.prato_profilo;
create policy "prato_profilo_insert_own"
  on public.prato_profilo for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "prato_profilo_update_own" on public.prato_profilo;
create policy "prato_profilo_update_own"
  on public.prato_profilo for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.prato_profilo to authenticated;

-- Ricarica lo schema API (PostgREST) dopo la creazione
notify pgrst, 'reload schema';
