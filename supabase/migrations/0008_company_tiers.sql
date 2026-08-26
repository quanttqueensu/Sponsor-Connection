-- Attach a tier to every company, grandfather today's access for 60 days,
-- then drop companies.is_sponsor.
-- Idempotent. Rewrite companies_protect_admin_fields BEFORE dropping is_sponsor:
-- plpgsql resolves NEW/OLD fields at execution time, so leaving is_sponsor in
-- the trigger bricks every later UPDATE on companies.

alter table public.companies
  add column if not exists sponsor_tier_id uuid references public.sponsor_tiers (id) on delete restrict,
  add column if not exists grace_tier_id uuid references public.sponsor_tiers (id) on delete restrict,
  add column if not exists tier_grace_until date;

create or replace function public.companies_protect_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Migrations, the service role, and the SQL editor have no auth.uid().
  -- Without this escape the backfill below would be reverted to NULL.
  if auth.uid() is null then
    return new;
  end if;
  if not public.is_admin() then
    new.status := old.status;
    new.slug := old.slug;
    new.sponsor_tier_id := old.sponsor_tier_id;
    new.grace_tier_id := old.grace_tier_id;
    new.tier_grace_until := old.tier_grace_until;
  end if;
  return new;
end;
$$;

do $$
declare
  none_id uuid;
  partner_id uuid;
  grace_id uuid;
begin
  select id into none_id from public.sponsor_tiers where key = 'none';
  select id into partner_id from public.sponsor_tiers where key = 'partner';
  select id into grace_id from public.sponsor_tiers where key = 'grandfathered';

  if none_id is null or partner_id is null or grace_id is null then
    raise exception '0008: expected none/partner/grandfathered tiers from 0007';
  end if;

  -- Assigned badge: today's is_sponsor flag. Effective access during grace
  -- is the grandfathered tier, which matches what every firm can do today.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'is_sponsor'
  ) then
    update public.companies
    set
      sponsor_tier_id = case when is_sponsor then partner_id else none_id end,
      grace_tier_id = grace_id,
      tier_grace_until = current_date + 60
    where sponsor_tier_id is null;
  else
    update public.companies
    set
      sponsor_tier_id = coalesce(sponsor_tier_id, none_id),
      grace_tier_id = coalesce(grace_tier_id, grace_id),
      tier_grace_until = coalesce(tier_grace_until, current_date + 60)
    where sponsor_tier_id is null;
  end if;
end;
$$;

alter table public.companies
  alter column sponsor_tier_id set not null;

create index if not exists companies_sponsor_tier_idx on public.companies (sponsor_tier_id);

alter table public.companies drop column if exists is_sponsor;

create or replace function public.company_effective_tier_id(cid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.tier_grace_until is not null
      and c.tier_grace_until >= current_date
      and c.grace_tier_id is not null
    then c.grace_tier_id
    else c.sponsor_tier_id
  end
  from public.companies c
  where c.id = cid
$$;

create or replace function public.my_effective_tier_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.company_effective_tier_id(public.my_company_id())
$$;

create or replace function public.my_capability(cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sponsor_tier_capabilities tc
    where tc.tier_id = public.my_effective_tier_id()
      and tc.capability = cap
  )
$$;

create or replace function public.my_capability_value(cap text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select tc.value
  from public.sponsor_tier_capabilities tc
  where tc.tier_id = public.my_effective_tier_id()
    and tc.capability = cap
$$;

create or replace function public.my_embargo_hours()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.applicant_embargo_hours, 0)
  from public.sponsor_tiers t
  where t.id = public.my_effective_tier_id()
$$;

create or replace function public.company_has_capability(cid uuid, cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sponsor_tier_capabilities tc
    where tc.tier_id = public.company_effective_tier_id(cid)
      and tc.capability = cap
  )
$$;

revoke execute on function public.company_effective_tier_id(uuid) from public, anon;
revoke execute on function public.my_effective_tier_id() from public, anon;
revoke execute on function public.my_capability(text) from public, anon;
revoke execute on function public.my_capability_value(text) from public, anon;
revoke execute on function public.my_embargo_hours() from public, anon;
revoke execute on function public.company_has_capability(uuid, text) from public, anon;

grant execute on function public.company_effective_tier_id(uuid) to authenticated;
grant execute on function public.my_effective_tier_id() to authenticated;
grant execute on function public.my_capability(text) to authenticated;
grant execute on function public.my_capability_value(text) to authenticated;
grant execute on function public.my_embargo_hours() to authenticated;
grant execute on function public.company_has_capability(uuid, text) to authenticated;

notify pgrst, 'reload schema';
