-- =============================================================================
-- AgriPocket — tabella profili utente + Auth email/password (Supabase)
-- Esegui in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Le password NON vanno in questa tabella: restano in auth.users (Supabase Auth).
-- usersagropocket = profilo esteso (nome, preferenze, ecc.) legato a auth.users.id
-- =============================================================================

-- Estensione UUID (di solito già attiva su Supabase)
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tabella profili
-- -----------------------------------------------------------------------------
create table if not exists public.usersagropocket (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  phone text,
  locale text not null default 'it',
  role text not null default 'user' check (role in ('user', 'admin', 'pro')),
  avatar_url text,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usersagropocket_email_unique unique (email)
);

comment on table public.usersagropocket is
  'Profilo AgriPocket; id = auth.users.id. Password gestita solo da Supabase Auth.';

create index if not exists usersagropocket_email_idx on public.usersagropocket (email);
create index if not exists usersagropocket_created_at_idx on public.usersagropocket (created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at automatico
-- -----------------------------------------------------------------------------
create or replace function public.set_usersagropocket_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_usersagropocket_updated_at on public.usersagropocket;
create trigger trg_usersagropocket_updated_at
  before update on public.usersagropocket
  for each row
  execute function public.set_usersagropocket_updated_at();

-- -----------------------------------------------------------------------------
-- Alla registrazione Auth: crea riga profilo
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user_agropocket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usersagropocket (
    id,
    email,
    display_name,
    email_verified_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, 'utente'), '@', 1)
    ),
    case when new.email_confirmed_at is not null then new.email_confirmed_at else null end
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.usersagropocket.display_name, excluded.display_name),
    email_verified_at = coalesce(excluded.email_verified_at, public.usersagropocket.email_verified_at);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_agropocket on auth.users;
create trigger on_auth_user_created_agropocket
  after insert on auth.users
  for each row
  execute function public.handle_new_user_agropocket();

-- Sincronizza email verificata se l'utente conferma dopo
create or replace function public.handle_user_email_confirmed_agropocket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.usersagropocket
    set
      email = coalesce(new.email, email),
      email_verified_at = new.email_confirmed_at,
      updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed_agropocket on auth.users;
create trigger on_auth_user_email_confirmed_agropocket
  after update of email_confirmed_at, email on auth.users
  for each row
  execute function public.handle_user_email_confirmed_agropocket();

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS)
-- -----------------------------------------------------------------------------
alter table public.usersagropocket enable row level security;

drop policy if exists "usersagropocket_select_own" on public.usersagropocket;
create policy "usersagropocket_select_own"
  on public.usersagropocket
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "usersagropocket_update_own" on public.usersagropocket;
create policy "usersagropocket_update_own"
  on public.usersagropocket
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Nessuna INSERT/DELETE diretta dal client: solo trigger su auth.users
-- (service_role del crawler/admin può bypassare RLS se serve)

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, update on public.usersagropocket to authenticated;

-- =============================================================================
-- DOPO aver eseguito questo script, in Dashboard Supabase:
--
-- Authentication → Providers → Email
--   ✓ Enable Email provider
--   ✓ Confirm email → consigliato ON in produzione; OFF solo per test rapidi
--
-- Authentication → URL Configuration
--   Site URL / Redirect URLs = schema della tua app (es. agripocket://login)
--
-- Settings → API
--   Copia la chiave "anon" "public" nell'app client (mai la service_role nel mobile)
-- =============================================================================

-- Chiamata dall'app web prima di salvare prato_profilo (utenti senza riga profilo)
create or replace function public.ensure_my_agropocket_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  select id, email, email_confirmed_at, raw_user_meta_data into u from auth.users where id = auth.uid();
  if not found then
    raise exception 'Utente auth non trovato';
  end if;
  insert into public.usersagropocket (id, email, display_name, email_verified_at)
  values (
    u.id,
    coalesce(u.email, ''),
    coalesce(u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, 'utente'), '@', 1)),
    u.email_confirmed_at
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.usersagropocket.display_name, excluded.display_name),
    email_verified_at = coalesce(excluded.email_verified_at, public.usersagropocket.email_verified_at),
    updated_at = now();
end;
$$;

grant execute on function public.ensure_my_agropocket_profile() to authenticated;
