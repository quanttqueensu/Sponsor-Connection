-- Close remaining RLS / trigger / WITH CHECK gaps found in the invariants
-- audit. Idempotent. Does not weaken existing policies.
--
-- 0014 is reserved by the file-upload worktree (storage MIME/size). This
-- file is 0015 so the two can merge without colliding.

-- ---------------------------------------------------------------------------
-- 1. In-app apply: snapshot path only, no live package path, no traversal.
--
-- applyToJob already copies into snapshots/{application_id}/ before insert.
-- 0006 still accepted {member_id}/... which is member-writable after submit.
-- The company download route refuses those rows; bind the trigger to the
-- same prefix so PostgREST cannot create them.
-- package_id, when present, must belong to the applying member.
-- ---------------------------------------------------------------------------

create or replace function public.applications_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p public.posts;
  snap_re text;
begin
  if tg_op = 'INSERT' and new.kind = 'in_app' then
    select * into p from public.posts where id = new.post_id;
    if p.id is null or p.kind <> 'job' or p.external_url is not null or p.status <> 'open' or not p.published then
      raise exception 'Apply is only allowed on open in-app jobs';
    end if;
    if p.company_id is not null and not public.company_has_capability(p.company_id, 'read_applicants') then
      raise exception 'This firm is not accepting hub applications';
    end if;
    new.company_id := p.company_id;
    snap_re := '^snapshots/' || new.id::text || '/[A-Za-z0-9._-]+$';
    if new.resume_path is null or new.resume_path !~ snap_re then
      raise exception 'Invalid resume path';
    end if;
    if new.cover_letter_path is not null and new.cover_letter_path !~ snap_re then
      raise exception 'Invalid cover letter path';
    end if;
    if new.package_id is not null
      and not exists (
        select 1
        from public.hiring_packages hp
        where hp.id = new.package_id
          and hp.member_id = new.member_id
      ) then
      raise exception 'Invalid package';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.applications_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. member_applied_to_company is SECURITY DEFINER and was a public RPC:
--    any logged-in user could probe whether a member applied to any firm.
--    Keep the helper for RLS; only answer for self, own firm, or admin.
--    auth.uid() IS NULL is the service-role / SQL-editor path.
-- ---------------------------------------------------------------------------

create or replace function public.member_applied_to_company(p_member uuid, p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.applications a
    join public.posts p on p.id = a.post_id
    where a.member_id = p_member
      and a.kind = 'in_app'
      and p.company_id = p_company
      and (
        auth.uid() is null
        or auth.uid() = p_member
        or public.my_company_id() is not distinct from p_company
        or public.is_admin()
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. my_opted_in_member leaked consent to any authenticated caller (including
--    none-tier firms and members calling it as an RPC). Listing RPCs already
--    gate on capability; require a product that uses opt-in here too.
-- ---------------------------------------------------------------------------

create or replace function public.my_opted_in_member(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.my_company_id() is not null
    and (
      public.my_live_capability('resume_book')
      or public.my_live_capability('candidate_search')
      or public.my_live_capability('dm_initiate_any')
    )
    and exists (
      select 1
      from public.profiles pr
      where pr.id = p_member
        and pr.role = 'member'
        and pr.resume_book_opt_in
        and pr.resume_book_opt_in_at is not null
        and pr.resume_book_opt_in_at
          <= now() - (public.my_resume_book_embargo_hours() * interval '1 hour')
    )
$$;

-- ---------------------------------------------------------------------------
-- 4. Join-request inserts: pending only, no admin fields, no pre-attached firm.
--    0013 allowed status = pending with reviewed_by / company_id attacker-set.
-- ---------------------------------------------------------------------------

drop policy if exists join_requests_insert_anon on public.company_join_requests;
create policy join_requests_insert_anon on public.company_join_requests
  for insert to anon
  with check (
    status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and admin_note is null
    and company_id is null
  );

drop policy if exists join_requests_insert_authenticated on public.company_join_requests;
create policy join_requests_insert_authenticated on public.company_join_requests
  for insert to authenticated
  with check (
    status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and admin_note is null
    and company_id is null
  );

-- Do not call is_admin() here. 0013 exists because FOR ALL admin policies
-- without TO authenticated made anon INSERT evaluate is_admin() and fail.
-- Admin writes stay on join_requests_admin.

-- ---------------------------------------------------------------------------
-- 5. Member directory: profile_sections of company_users are not a directory.
-- ---------------------------------------------------------------------------

drop policy if exists sections_member_read on public.profile_sections;
create policy sections_member_read on public.profile_sections
  for select to authenticated
  using (
    public.is_member()
    and exists (
      select 1
      from public.profiles p
      where p.id = member_id
        and p.role = 'member'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Storage writes: explicit WITH CHECK (Postgres already copies USING when
--    omitted; pin it so a later WITH CHECK (true) cannot land), members only,
--    own prefix. Snapshots stay non-writable because foldername[1] = uid.
-- ---------------------------------------------------------------------------

drop policy if exists resumes_own_write on storage.objects;
create policy resumes_own_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_member()
  );

drop policy if exists resumes_own_update on storage.objects;
create policy resumes_own_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_member()
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_member()
  );

drop policy if exists photos_own_write on storage.objects;
create policy photos_own_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_member()
  );

drop policy if exists photos_own_update on storage.objects;
create policy photos_own_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_member()
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_member()
  );

-- ---------------------------------------------------------------------------
-- 7. Trigger functions are not RPCs. test_reset stays service-role only
--    (re-asserted; 0011 already did this).
-- ---------------------------------------------------------------------------

revoke execute on function public.applications_snapshot_immutable() from public, anon, authenticated;
revoke execute on function public.hiring_packages_path_guard() from public, anon, authenticated;
revoke execute on function public.hiring_packages_default_guard() from public, anon, authenticated;
revoke execute on function public.profiles_protect_privileged() from public, anon, authenticated;
revoke execute on function public.profiles_stamp_opt_in() from public, anon, authenticated;
revoke execute on function public.conversations_protect_keys() from public, anon, authenticated;
revoke execute on function public.companies_protect_admin_fields() from public, anon, authenticated;
revoke execute on function public.posts_in_app_quota_guard() from public, anon, authenticated;
revoke execute on function public.sponsor_tiers_guard() from public, anon, authenticated;

revoke execute on function public.test_reset() from public, anon, authenticated;
grant execute on function public.test_reset() to service_role;

-- RLS helpers from 0002 must remain executable by authenticated (policy
-- expressions run as the caller). Re-assert so a later revoke cannot
-- bounce logins the way the 0002 incident did.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.my_company_id() to authenticated;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.member_applied_to_company(uuid, uuid) to authenticated;
grant execute on function public.is_in_app_job(public.posts) to authenticated;

notify pgrst, 'reload schema';
