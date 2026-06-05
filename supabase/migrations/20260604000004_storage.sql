-- Storage for sighting photos.
-- A public bucket (life-list photos are world-readable, matching the public
-- Letterboxd-style model). Writes are restricted to the uploading user's own
-- folder: object paths are "<user_id>/<filename>", and RLS checks that the first
-- path segment equals the caller's uid.

-- 50 MB per file so users can upload full-quality photos. (Supabase also
-- enforces a project-wide global limit; raise that in Settings → Storage if you
-- ever set this higher.)
insert into storage.buckets (id, name, public, file_size_limit)
values ('sightings', 'sightings', true, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- storage.objects already has RLS enabled by Supabase; just add policies.
create policy "Sighting photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'sightings');

create policy "Users upload sighting photos to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sightings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Users update their own sighting photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'sightings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Users delete their own sighting photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sightings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
