-- Two storage-path guards that belong at the database layer.
-- Idempotent: safe to re-run, and safe to paste statement-by-statement into
-- the Supabase SQL editor (see 0001_init.sql line 2).

-- ---------------------------------------------------------------------------
-- 1. In-app application snapshots must be THIS application's own prefix.
--
-- applications_guard() in 0001 accepted any path whose first segment was
-- `snapshots`, so a member could insert (via PostgREST) resume_path =
-- snapshots/{someone_else's_application_id}/resume.pdf. The company download
-- route now refuses that, but the row still exists and applyToJob's
-- service-role copy is not the only writer. Bind the second segment to NEW.id
-- so a snapshot path cannot name another application.
--
-- Member-owned `{member_id}/...` live package paths remain accepted on INSERT
-- so a row can still be written; the app copies into snapshots/{id}/ before
-- insert, and applications_snapshot_immutable() then freezes the path.
--
-- `set search_path = public` matches 0004/0005: this function only touches
-- NEW/OLD, so it stays security invoker, but a mutable search_path could
-- rebind split_part/now.
create or replace function public.applications_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p public.posts;
begin
  if tg_op = 'INSERT' and new.kind = 'in_app' then
    select * into p from public.posts where id = new.post_id;
    if p.id is null or p.kind <> 'job' or p.external_url is not null or p.status <> 'open' or not p.published then
      raise exception 'Apply is only allowed on open in-app jobs';
    end if;
    new.company_id := p.company_id;
    if new.resume_path is null
      or (
        split_part(new.resume_path, '/', 1) <> new.member_id::text
        and not (
          split_part(new.resume_path, '/', 1) = 'snapshots'
          and split_part(new.resume_path, '/', 2) = new.id::text
        )
      ) then
      raise exception 'Invalid resume path';
    end if;
    if new.cover_letter_path is not null
      and split_part(new.cover_letter_path, '/', 1) <> new.member_id::text
      and not (
        split_part(new.cover_letter_path, '/', 1) = 'snapshots'
        and split_part(new.cover_letter_path, '/', 2) = new.id::text
      ) then
      raise exception 'Invalid cover letter path';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.applications_guard() from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Only members may write the photos bucket.
--
-- photos_member_read lets every member SELECT any object in the bucket, and
-- the original write policies only required the first path segment to be
-- auth.uid(). A company_user could therefore upload an arbitrary payload
-- under their own prefix that every member could then download. Company
-- users have no photo UI; members update photos through uploadPhoto.
drop policy if exists photos_own_write on storage.objects;
create policy photos_own_write on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_member()
  );

drop policy if exists photos_own_update on storage.objects;
create policy photos_own_update on storage.objects
  for update using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_member()
  );

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ROLLBACK (copy-paste as a whole)
--
-- Restore applications_guard() from 0001_init.sql (the version that accepts
-- any `snapshots/` prefix), then:
--
--   revoke execute on function public.applications_guard() from public, anon;
--
--   drop policy if exists photos_own_write on storage.objects;
--   create policy photos_own_write on storage.objects
--     for insert with check (
--       bucket_id = 'photos'
--       and (storage.foldername(name))[1] = auth.uid()::text
--     );
--   drop policy if exists photos_own_update on storage.objects;
--   create policy photos_own_update on storage.objects
--     for update using (
--       bucket_id = 'photos'
--       and (storage.foldername(name))[1] = auth.uid()::text
--     );
--   notify pgrst, 'reload schema';
-- ---------------------------------------------------------------------------
