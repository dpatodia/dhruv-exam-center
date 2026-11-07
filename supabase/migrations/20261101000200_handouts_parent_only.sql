-- Only the parent can add handouts (Dhruv uploads answer sheets only)
drop policy if exists "handouts insert" on public.handouts;
create policy "handouts insert" on public.handouts for insert to authenticated with check (uploaded_by = auth.uid() and public.is_parent());
drop policy if exists "handouts insert" on storage.objects;
create policy "handouts insert" on storage.objects for insert to authenticated with check (bucket_id = 'handouts' and public.is_parent());
