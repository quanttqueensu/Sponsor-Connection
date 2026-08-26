-- Capability-gated company policies. Replaces the open company insert/update
-- policies from 0001. Announcements and external listings stay ungated.
--
-- A second permissive UPDATE policy would OR with the ladder and make it
-- decorative, so closing a post after a downgrade is a security-definer RPC.

create or replace function public.my_open_in_app_jobs()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.posts
  where company_id = public.my_company_id()
    and kind = 'job'
    and external_url is null
    and status = 'open'
$$;

create or replace function public.close_own_post(p_post uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.posts p
     set status = 'closed', updated_at = now()
   where p.id = p_post
     and (p.company_id = public.my_company_id() or public.is_admin())
  returning p.id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.my_open_in_app_jobs() from public, anon;
revoke execute on function public.close_own_post(uuid) from public, anon;
grant execute on function public.my_open_in_app_jobs() to authenticated;
grant execute on function public.close_own_post(uuid) to authenticated;

drop policy if exists posts_company_insert on public.posts;
create policy posts_company_insert on public.posts
  for insert to authenticated with check (
    company_id = public.my_company_id()
    and author_id = auth.uid()
    and (
      kind = 'announcement'
      or kind = 'job_link'
      or (kind = 'job' and external_url is not null)
      or (kind = 'event' and public.my_capability('post_event'))
      or (
        kind = 'job'
        and external_url is null
        and public.my_capability('post_in_app_job')
        and (
          public.my_capability_value('post_in_app_job') is null
          or public.my_open_in_app_jobs() < public.my_capability_value('post_in_app_job')
        )
      )
    )
  );

drop policy if exists posts_company_update on public.posts;
create policy posts_company_update on public.posts
  for update to authenticated
  using (company_id = public.my_company_id())
  with check (
    company_id = public.my_company_id()
    and author_id = auth.uid()
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

drop policy if exists applications_company_in_app on public.applications;
create policy applications_company_in_app on public.applications
  for select to authenticated using (
    kind = 'in_app'
    and public.my_capability('read_applicants')
    and post_id in (select id from public.posts where company_id = public.my_company_id())
    and created_at <= now() - (public.my_embargo_hours() * interval '1 hour')
  );

drop policy if exists applications_company_stage on public.applications;
create policy applications_company_stage on public.applications
  for update to authenticated
  using (
    kind = 'in_app'
    and public.my_capability('read_applicants')
    and post_id in (select id from public.posts where company_id = public.my_company_id())
  )
  with check (
    kind = 'in_app'
    and public.my_capability('read_applicants')
    and post_id in (select id from public.posts where company_id = public.my_company_id())
  );

drop policy if exists conversations_company_insert on public.conversations;
create policy conversations_company_insert on public.conversations
  for insert to authenticated with check (
    company_id = public.my_company_id()
    and public.my_capability('dm_initiate_applicant')
    and public.member_applied_to_company(member_id, company_id)
  );

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
    if p.company_id is not null and not public.company_has_capability(p.company_id, 'read_applicants') then
      raise exception 'This firm is not accepting hub applications';
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

notify pgrst, 'reload schema';
