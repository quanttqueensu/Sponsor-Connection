-- Make resume_book, candidate_search, and dm_initiate_any real.
-- Idempotent. Safe to paste statement-by-statement.
--
-- Resume-book delay is a column on the tier (same shape as applicant
-- embargo) so execs set it without inventing a new capability key.
-- Listing goes through security-definer RPCs so we do not open profiles
-- SELECT to every company user.

-- ---------------------------------------------------------------------------
-- Tier column + seed
-- ---------------------------------------------------------------------------

alter table public.sponsor_tiers
  add column if not exists resume_book_embargo_hours int not null default 0
    check (resume_book_embargo_hours between 0 and 8760);

-- Principal: immediate. Other packages that include the book wait 7 days.
update public.sponsor_tiers
   set resume_book_embargo_hours = 0
 where key = 'principal' and resume_book_embargo_hours = 0;

update public.sponsor_tiers
   set resume_book_embargo_hours = 168
 where key in ('supporter', 'partner', 'leader')
   and resume_book_embargo_hours = 0;

update public.sponsor_capabilities
   set description = 'Browse opted-in members and their default hiring-package resume.',
       is_enforced = true
 where key = 'resume_book';

update public.sponsor_capabilities
   set description = 'Search opted-in members by name, program, year, and interests.',
       is_enforced = true
 where key = 'candidate_search';

update public.sponsor_capabilities
   set description = 'Start a conversation with any member who opted into the resume book, not only applicants.',
       is_enforced = true
 where key = 'dm_initiate_any';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.my_assigned_tier_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.sponsor_tier_id
  from public.company_users cu
  join public.companies c on c.id = cu.company_id
  where cu.profile_id = auth.uid()
$$;

-- True if the assigned package OR the grandfathered package grants `cap`.
-- New products (resume book, search, DM-any) live on assigned packages and
-- are absent from the grandfathered row, so OR is what lets a Partner firm
-- use them during the grace window without handing them to rank-0 firms.
create or replace function public.my_live_capability(cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.my_capability(cap)
    or exists (
      select 1
      from public.sponsor_tier_capabilities tc
      where tc.tier_id = public.my_assigned_tier_id()
        and tc.capability = cap
    )
$$;

create or replace function public.my_resume_book_embargo_hours()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select t.resume_book_embargo_hours
      from public.sponsor_tiers t
      where t.id = public.my_assigned_tier_id()
        and exists (
          select 1
          from public.sponsor_tier_capabilities tc
          where tc.tier_id = t.id and tc.capability = 'resume_book'
        )
    ),
    (
      select t.resume_book_embargo_hours
      from public.sponsor_tiers t
      where t.id = public.my_effective_tier_id()
    ),
    0
  )
$$;

-- Opted in, past this firm's resume-book delay. Does not require a package.
create or replace function public.my_opted_in_member(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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

create or replace function public.my_contactable_opt_in(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.my_company_id() is not null
    and public.my_live_capability('dm_initiate_any')
    and public.my_opted_in_member(p_member)
$$;

-- ---------------------------------------------------------------------------
-- Listing RPCs
-- ---------------------------------------------------------------------------

create or replace function public.resume_book_list(
  p_program text default null,
  p_grad_year int default null
)
returns table (
  id uuid,
  full_name text,
  program text,
  grad_year int,
  bio text,
  interests text,
  linkedin_url text,
  github_url text,
  website_url text,
  photo_path text,
  package_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id,
    pr.full_name,
    pr.program,
    pr.grad_year,
    pr.bio,
    pr.interests,
    pr.linkedin_url,
    pr.github_url,
    pr.website_url,
    pr.photo_path,
    hp.name
  from public.profiles pr
  join public.hiring_packages hp
    on hp.member_id = pr.id and hp.is_default
  where public.my_live_capability('resume_book')
    and public.my_opted_in_member(pr.id)
    and (p_program is null or pr.program ilike '%' || p_program || '%')
    and (p_grad_year is null or pr.grad_year = p_grad_year)
  order by pr.full_name
$$;

create or replace function public.candidate_search_list(
  p_q text default null,
  p_program text default null,
  p_grad_year int default null
)
returns table (
  id uuid,
  full_name text,
  program text,
  grad_year int,
  bio text,
  interests text,
  linkedin_url text,
  github_url text,
  website_url text,
  photo_path text,
  package_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id,
    pr.full_name,
    pr.program,
    pr.grad_year,
    pr.bio,
    pr.interests,
    pr.linkedin_url,
    pr.github_url,
    pr.website_url,
    pr.photo_path,
    hp.name
  from public.profiles pr
  join public.hiring_packages hp
    on hp.member_id = pr.id and hp.is_default
  where public.my_live_capability('candidate_search')
    and public.my_opted_in_member(pr.id)
    and (p_program is null or pr.program ilike '%' || p_program || '%')
    and (p_grad_year is null or pr.grad_year = p_grad_year)
    and (
      p_q is null
      or pr.full_name ilike '%' || p_q || '%'
      or coalesce(pr.program, '') ilike '%' || p_q || '%'
      or coalesce(pr.interests, '') ilike '%' || p_q || '%'
      or coalesce(pr.bio, '') ilike '%' || p_q || '%'
    )
  order by pr.full_name
$$;

-- Default-package resume path for a member the caller may see in the book
-- or in search. Empty if they lack both capabilities or the member is hidden.
create or replace function public.talent_resume_path(p_member uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select hp.resume_path
  from public.hiring_packages hp
  where hp.member_id = p_member
    and hp.is_default
    and public.my_opted_in_member(p_member)
    and (
      public.my_live_capability('resume_book')
      or public.my_live_capability('candidate_search')
    )
  limit 1
$$;

create or replace function public.talent_photo_path(p_member uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pr.photo_path
  from public.profiles pr
  where pr.id = p_member
    and public.my_opted_in_member(p_member)
    and (
      public.my_live_capability('resume_book')
      or public.my_live_capability('candidate_search')
    )
$$;

-- ---------------------------------------------------------------------------
-- Company-initiated DMs: applicants past embargo OR opted-in (if granted)
-- ---------------------------------------------------------------------------

drop policy if exists conversations_company_insert on public.conversations;
create policy conversations_company_insert on public.conversations
  for insert to authenticated with check (
    company_id = public.my_company_id()
    and (
      (
        public.my_capability('dm_initiate_applicant')
        and public.my_visible_applicant(member_id)
      )
      or public.my_contactable_opt_in(member_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Local RLS harness
-- ---------------------------------------------------------------------------

create or replace function public.test_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table
    public.messages,
    public.conversations,
    public.applications,
    public.post_comments,
    public.posts,
    public.company_join_requests,
    public.invites,
    public.hiring_packages,
    public.profile_sections,
    public.company_users,
    public.sponsor_tier_events
    restart identity cascade;

  -- profiles.id references auth.users ON DELETE CASCADE, so this clears both.
  delete from auth.users;

  truncate table public.companies restart identity cascade;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.my_assigned_tier_id() from public, anon;
revoke execute on function public.my_live_capability(text) from public, anon;
revoke execute on function public.my_resume_book_embargo_hours() from public, anon;
revoke execute on function public.my_opted_in_member(uuid) from public, anon;
revoke execute on function public.my_contactable_opt_in(uuid) from public, anon;
revoke execute on function public.resume_book_list(text, int) from public, anon;
revoke execute on function public.candidate_search_list(text, text, int) from public, anon;
revoke execute on function public.talent_resume_path(uuid) from public, anon;
revoke execute on function public.talent_photo_path(uuid) from public, anon;
revoke execute on function public.test_reset() from public, anon, authenticated;

grant execute on function public.my_assigned_tier_id() to authenticated;
grant execute on function public.my_live_capability(text) to authenticated;
grant execute on function public.my_resume_book_embargo_hours() to authenticated;
grant execute on function public.my_opted_in_member(uuid) to authenticated;
grant execute on function public.my_contactable_opt_in(uuid) to authenticated;
grant execute on function public.resume_book_list(text, int) to authenticated;
grant execute on function public.candidate_search_list(text, text, int) to authenticated;
grant execute on function public.talent_resume_path(uuid) to authenticated;
grant execute on function public.talent_photo_path(uuid) to authenticated;
grant execute on function public.test_reset() to service_role;

notify pgrst, 'reload schema';
