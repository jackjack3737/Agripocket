-- Storico patologie rilevate da analisi foto (God Mode / diagnostica predittiva)
-- Esegui in Supabase SQL Editor

create table if not exists public.prato_storico_patologie (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usersagropocket (id) on delete cascade,
  patologia_rilevata text not null,
  mese_rilevamento int not null check (mese_rilevamento between 1 and 12),
  anno int not null check (anno >= 2020 and anno <= 2100),
  risolto boolean not null default false,
  created_at timestamptz not null default now(),
  constraint prato_storico_patologie_uniq
    unique (user_id, patologia_rilevata, mese_rilevamento, anno)
);

create index if not exists prato_storico_patologie_user_idx
  on public.prato_storico_patologie (user_id, anno desc, mese_rilevamento desc);

alter table public.prato_storico_patologie enable row level security;

drop policy if exists "prato_storico_patologie_select_own" on public.prato_storico_patologie;
create policy "prato_storico_patologie_select_own"
  on public.prato_storico_patologie for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "prato_storico_patologie_insert_own" on public.prato_storico_patologie;
create policy "prato_storico_patologie_insert_own"
  on public.prato_storico_patologie for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "prato_storico_patologie_update_own" on public.prato_storico_patologie;
create policy "prato_storico_patologie_update_own"
  on public.prato_storico_patologie for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "prato_storico_patologie_delete_own" on public.prato_storico_patologie;
create policy "prato_storico_patologie_delete_own"
  on public.prato_storico_patologie for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.prato_storico_patologie to authenticated;

notify pgrst, 'reload schema';
