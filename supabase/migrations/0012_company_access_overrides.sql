-- Per-firm access on top of the assigned package.
-- Idempotent. Admin grants or revokes hub capabilities for one sponsor
-- without moving them to a different named package.
--
-- The member feed stays members-only (posts_member_feed + is_member()).
-- Company contacts never gain that SELECT by package or override.
--
-- RLS reads company_has_capability, which now: override if present,
-- otherwise the union of assigned + grandfathered packages. Inactive
-- firms have no capabilities until an exec sets them active again.

create table if not exists public.company_capability_overrides (
  company_id uuid not null references public.companies (id) on delete cascade,
  capability text not null references public.sponsor_capabilities (key),
  granted    boolean not null,
  value      int,
  primary key (company_id, capability)
);

alter table public.company_capability_overrides enable row level security;

drop policy if exists company_capability_overrides_admin on public.company_capability_overrides;
create policy company_capability_overrides_admin on public.company_capability_overrides
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists company_capability_overrides_own_read on public.company_capability_overrides;
create policy company_capability_overrides_own_read on public.company_capability_overrides
  for select to authenticated using (company_id = public.my_company_id());

grant select, insert, update, delete on public.company_capability_overrides to authenticated;

-- True if the assigned package or the still-live grace package includes cap.
create or replace function public.company_package_has(cid uuid, cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sponsor_tier_capabilities tc
    where tc.capability = cap
      and tc.tier_id in (
        public.company_effective_tier_id(cid),
        (select c.sponsor_tier_id from public.companies c where c.id = cid)
      )
  )
$$;

create or replace function public.company_has_capability(cid uuid, cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.companies c
      where c.id = cid and c.status = 'active'
    )
    and coalesce(
      (
        select o.granted
        from public.company_capability_overrides o
        where o.company_id = cid and o.capability = cap
      ),
      public.company_package_has(cid, cap)
    )
$$;

-- Override value if present (null when revoked or unlimited).
-- Otherwise the assigned package's value when that package includes the cap,
-- else the still-live grace package.
create or replace function public.company_capability_value(cid uuid, cap text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when exists (
        select 1
        from public.company_capability_overrides o
        where o.company_id = cid and o.capability = cap
      ) then (
        select case when o.granted then o.value else null end
        from public.company_capability_overrides o
        where o.company_id = cid and o.capability = cap
      )
      when exists (
        select 1
        from public.sponsor_tier_capabilities tc
        where tc.tier_id = (select c.sponsor_tier_id from public.companies c where c.id = cid)
          and tc.capability = cap
      ) then (
        select tc.value
        from public.sponsor_tier_capabilities tc
        where tc.tier_id = (select c.sponsor_tier_id from public.companies c where c.id = cid)
          and tc.capability = cap
      )
      else (
        select tc.value
        from public.sponsor_tier_capabilities tc
        where tc.tier_id = public.company_effective_tier_id(cid)
          and tc.capability = cap
      )
    end
$$;

create or replace function public.my_capability(cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_has_capability(public.my_company_id(), cap)
$$;

create or replace function public.my_capability_value(cap text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select public.company_capability_value(public.my_company_id(), cap)
$$;

create or replace function public.my_live_capability(cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_has_capability(public.my_company_id(), cap)
$$;

revoke execute on function public.company_package_has(uuid, text) from public, anon;
revoke execute on function public.company_has_capability(uuid, text) from public, anon;
revoke execute on function public.company_capability_value(uuid, text) from public, anon;
grant execute on function public.company_package_has(uuid, text) to authenticated;
grant execute on function public.company_has_capability(uuid, text) to authenticated;
grant execute on function public.company_capability_value(uuid, text) to authenticated;

-- Audit kinds for per-firm access and active/inactive.
alter table public.sponsor_tier_events
  drop constraint if exists sponsor_tier_events_kind_check;
alter table public.sponsor_tier_events
  add constraint sponsor_tier_events_kind_check check (kind in (
    'tier_created','tier_updated','tier_deactivated','tier_reactivated',
    'capability_granted','capability_revoked','company_assigned',
    'company_access','company_status'
  ));

notify pgrst, 'reload schema';
