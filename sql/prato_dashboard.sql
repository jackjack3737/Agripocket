-- Dashboard: ultima analisi + calendario interventi
-- Esegui in Supabase SQL Editor dopo prato_profilo.sql / usersagropocket.sql

create or replace function public.set_usersagropocket_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.prato_analisi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usersagropocket (id) on delete cascade,
  report_markdown text not null,
  vision_json jsonb,
  chunks_used integer default 0,
  created_at timestamptz not null default now()
);

create index if not exists prato_analisi_user_created_idx
  on public.prato_analisi (user_id, created_at desc);

create table if not exists public.prato_interventi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usersagropocket (id) on delete cascade,
  analisi_id uuid references public.prato_analisi (id) on delete set null,
  titolo text not null,
  descrizione text,
  priorita text not null default 'media'
    check (priorita in ('alta', 'media', 'bassa')),
  categoria text default 'altro'
    check (categoria in ('taglio', 'irrigazione', 'concime', 'trattamento', 'pulizia', 'altro')),
  stato text not null default 'pianificato'
    check (stato in ('pianificato', 'completato')),
  data_prevista date,
  data_completamento date,
  ordine integer not null default 0,
  fonte text not null default 'ia_foto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prato_interventi_user_stato_idx
  on public.prato_interventi (user_id, stato, data_prevista);

create trigger trg_prato_interventi_updated_at
  before update on public.prato_interventi
  for each row
  execute function public.set_usersagropocket_updated_at();

alter table public.prato_analisi enable row level security;
alter table public.prato_interventi enable row level security;

drop policy if exists "prato_analisi_select_own" on public.prato_analisi;
create policy "prato_analisi_select_own"
  on public.prato_analisi for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "prato_analisi_insert_own" on public.prato_analisi;
create policy "prato_analisi_insert_own"
  on public.prato_analisi for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "prato_interventi_select_own" on public.prato_interventi;
create policy "prato_interventi_select_own"
  on public.prato_interventi for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "prato_interventi_insert_own" on public.prato_interventi;
create policy "prato_interventi_insert_own"
  on public.prato_interventi for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "prato_interventi_update_own" on public.prato_interventi;
create policy "prato_interventi_update_own"
  on public.prato_interventi for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "prato_interventi_delete_own" on public.prato_interventi;
create policy "prato_interventi_delete_own"
  on public.prato_interventi for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert on public.prato_analisi to authenticated;
grant select, insert, update, delete on public.prato_interventi to authenticated;

notify pgrst, 'reload schema';
