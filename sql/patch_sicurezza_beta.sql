-- Sicurezza beta: job async, manual_override, disclaimer legale
-- Esegui in Supabase SQL Editor

alter table public.prato_profilo
  add column if not exists disclaimer_accettato_at timestamptz;

alter table public.prato_interventi
  add column if not exists manual_override boolean not null default false;

create table if not exists public.prato_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usersagropocket (id) on delete cascade,
  tipo text not null check (tipo in ('genera_piano', 'analizza_foto')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  payload jsonb default '{}',
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prato_jobs_user_status_idx
  on public.prato_jobs (user_id, status, created_at desc);

alter table public.prato_jobs enable row level security;

drop policy if exists "prato_jobs_select_own" on public.prato_jobs;
create policy "prato_jobs_select_own"
  on public.prato_jobs for select to authenticated
  using (auth.uid() = user_id);

grant select on public.prato_jobs to authenticated;

notify pgrst, 'reload schema';
