-- Esegui UNA VOLTA se il salvataggio prato_profilo fallisce (FK / profilo utente mancante)
-- Supabase → SQL Editor → Run

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

  select id, email, email_confirmed_at, raw_user_meta_data
  into u
  from auth.users
  where id = auth.uid();

  if not found then
    raise exception 'Utente auth non trovato';
  end if;

  insert into public.usersagropocket (
    id,
    email,
    display_name,
    email_verified_at
  )
  values (
    u.id,
    coalesce(u.email, ''),
    coalesce(
      u.raw_user_meta_data ->> 'display_name',
      u.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(u.email, 'utente'), '@', 1)
    ),
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

-- Utenti già registrati prima del trigger: crea righe mancanti
insert into public.usersagropocket (id, email, display_name, email_verified_at)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    u.raw_user_meta_data ->> 'display_name',
    u.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(u.email, 'utente'), '@', 1)
  ),
  u.email_confirmed_at
from auth.users u
where not exists (select 1 from public.usersagropocket p where p.id = u.id)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
