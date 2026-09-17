-- Close the UPDATE-side quota hole, stop applicant-profile and DM leaks
-- during embargo, and fail loud if a company user touches admin fields.
-- Idempotent. Safe to re-run / paste statement-by-statement.
--
-- INSERT quota stays in posts_company_insert (0009). A second permissive
-- UPDATE policy would OR with the kind/capability ladder and undo it, so
-- convert/reopen is a BEFORE UPDATE trigger, not another policy.
-- close_own_post is unchanged: closing is not an open in-app job.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Mirror of my_capability_value, keyed by company rather than the caller.
-- Used by the UPDATE quota trigger so a colleague's edit is counted against
-- the firm's cap, not the actor's (they share a company, but this stays
-- correct if an admin writes the row).
create or replace function public.company_capability_value(cid uuid, cap text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select tc.value
  from public.sponsor_tier_capabilities tc
  where tc.tier_id = public.company_effective_tier_id(cid)
    and tc.capability = cap
$$;

-- True when the caller is a company user who may see this member as an
-- applicant: they have the pipeline capability, the member applied in-app
-- to one of their posts, and at least one of those applications is past
-- the firm's embargo. Conversations reuse this so a DM cannot start
-- while the application row is still hidden.
create or replace function public.my_visible_applicant(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.my_company_id() is not null
    and public.my_capability('read_applicants')
    and public.member_applied_to_company(p_member, public.my_company_id())
    and exists (
      select 1
      from public.applications a
      join public.posts p on p.id = a.post_id
      where a.member_id = p_member
        and a.kind = 'in_app'
        and p.company_id = public.my_company_id()
        and a.created_at <= now() - (public.my_embargo_hours() * interval '1 hour')
    )
$$;

-- ---------------------------------------------------------------------------
-- 1. Quota on UPDATE + freeze author_id
-- ---------------------------------------------------------------------------

-- posts_company_update (0009) checks post_in_app_job but not the numeric
-- cap. A supporter at quota could convert an announcement / job_link /
-- external job into an extra in-app job, or reopen a closed one.
--
-- An "open in-app job" here is kind='job' AND external_url IS NULL AND
-- status='open' — same shape as my_open_in_app_jobs(), no published flag.
-- Quota runs only when NEW is that shape and OLD was not (convert or
-- reopen). The row being updated is excluded from the count so it does
-- not occupy a slot it did not already hold.
--
-- author_id is frozen for non-admins so a second company contact can
-- edit/close a colleague's post (WITH CHECK no longer requires
-- author_id = auth.uid()) without reassigning authorship. is_admin() is
-- false without auth.uid(); do not treat the service role as admin.
create or replace function public.posts_in_app_quota_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota int;
  v_open int;
  v_new_open boolean;
  v_old_open boolean;
begin
  if new.author_id is distinct from old.author_id and not public.is_admin() then
    raise exception 'Post author cannot be changed';
  end if;

  v_new_open := new.kind = 'job' and new.external_url is null and new.status = 'open';
  v_old_open := old.kind = 'job' and old.external_url is null and old.status = 'open';

  if v_new_open and not v_old_open then
    if new.company_id is null then
      return new;
    end if;
    if not public.company_has_capability(new.company_id, 'post_in_app_job') then
      raise exception 'This firm is not allowed to post in-app jobs';
    end if;
    v_quota := public.company_capability_value(new.company_id, 'post_in_app_job');
    if v_quota is not null then
      select count(*)::int into v_open
      from public.posts
      where company_id = new.company_id
        and id <> new.id
        and kind = 'job'
        and external_url is null
        and status = 'open';
      if v_open >= v_quota then
        raise exception 'This firm has reached its open in-app job limit';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists posts_in_app_quota_guard on public.posts;
create trigger posts_in_app_quota_guard
  before update on public.posts
  for each row execute function public.posts_in_app_quota_guard();

-- Keep the kind/capability ladder. Drop author_id = auth.uid() so any
-- contact at the firm can edit or close a colleague's post; authorship
-- is enforced by the trigger above, not this policy.
drop policy if exists posts_company_update on public.posts;
create policy posts_company_update on public.posts
  for update to authenticated
  using (company_id = public.my_company_id())
  with check (
    company_id = public.my_company_id()
    and (
      kind = 'announcement'
      or kind = 'job_link'
      or (kind = 'job' and external_url is not null)
      or (kind = 'event' and public.my_capability('post_event'))
      or (
        kind = 'job'
        and external_url is null
        and public.my_capability('post_in_app_job')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Applicant profiles: capability + embargo
-- ---------------------------------------------------------------------------

-- 0001 let any company user SELECT a member profile after an in-app apply,
-- including 'none' firms and during embargo. Gate on the pipeline
-- capability and the same created_at window as applications_company_in_app.
drop policy if exists profiles_company_applicants on public.profiles;
create policy profiles_company_applicants on public.profiles
  for select to authenticated using (public.my_visible_applicant(id));

-- ---------------------------------------------------------------------------
-- 3. Embargo on stage updates and company-initiated DMs
-- ---------------------------------------------------------------------------

-- USING that is weaker than SELECT lets a firm UPDATE/RETURNING a row
-- they cannot read. Mirror applications_company_in_app on both sides.
drop policy if exists applications_company_stage on public.applications;
create policy applications_company_stage on public.applications
  for update to authenticated
  using (
    kind = 'in_app'
    and public.my_capability('read_applicants')
    and post_id in (select id from public.posts where company_id = public.my_company_id())
    and created_at <= now() - (public.my_embargo_hours() * interval '1 hour')
  )
  with check (
    kind = 'in_app'
    and public.my_capability('read_applicants')
    and post_id in (select id from public.posts where company_id = public.my_company_id())
    and created_at <= now() - (public.my_embargo_hours() * interval '1 hour')
  );

-- member_applied_to_company is true during embargo; my_visible_applicant
-- is not. Keep dm_initiate_applicant so a pipeline-only firm still cannot
-- open a thread.
drop policy if exists conversations_company_insert on public.conversations;
create policy conversations_company_insert on public.conversations
  for insert to authenticated with check (
    company_id = public.my_company_id()
    and public.my_capability('dm_initiate_applicant')
    and public.my_visible_applicant(member_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Admin fields: fail instead of silent revert
-- ---------------------------------------------------------------------------

-- 0008 copied OLD over NEW, so a company user who PATCH'd sponsor_tier_id
-- got a 200 and an unchanged row. Raise instead. auth.uid() IS NULL is
-- the migrations / SQL editor / service-role escape — is_admin() is false
-- without a JWT subject, so do not treat that path as admin.
-- Name, description, website, and logo stay company-writable.
create or replace function public.companies_protect_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.is_admin()
    and (
      new.status is distinct from old.status
      or new.slug is distinct from old.slug
      or new.sponsor_tier_id is distinct from old.sponsor_tier_id
      or new.grace_tier_id is distinct from old.grace_tier_id
      or new.tier_grace_until is distinct from old.tier_grace_until
    ) then
    raise exception 'Only QUANTT admins can change that';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.company_capability_value(uuid, text) from public, anon;
revoke execute on function public.my_visible_applicant(uuid) from public, anon;
revoke execute on function public.posts_in_app_quota_guard() from public, anon;

grant execute on function public.company_capability_value(uuid, text) to authenticated;
grant execute on function public.my_visible_applicant(uuid) to authenticated;

notify pgrst, 'reload schema';
