-- Bucket foto PRIVATO (GDPR) — esegui in Supabase SQL Editor
-- Dopo: le foto non sono più accessibili con URL pubblico permanente.

update storage.buckets
set public = false
where id = 'prato-foto';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prato-foto',
  'prato-foto',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set public = false;

drop policy if exists "prato_foto_select" on storage.objects;
create policy "prato_foto_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'prato-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "prato_foto_insert_own" on storage.objects;
create policy "prato_foto_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'prato-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "prato_foto_update_own" on storage.objects;
create policy "prato_foto_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'prato-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "prato_foto_delete_own" on storage.objects;
create policy "prato_foto_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'prato-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
