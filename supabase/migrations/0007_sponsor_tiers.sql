-- Admin-editable sponsor tiers and the capability matrix.
-- Idempotent: safe to re-run, and safe to paste statement-by-statement into
-- the Supabase SQL editor (see 0001_init.sql line 2).
--
-- Capability KEYS are seeded here and enforced in 0009. Admins grant or revoke
-- those keys on a tier, reprice, rename, and create extra named tiers — they
-- cannot invent a new key that no policy reads.

create table if not exists public.sponsor_capabilities (
  key         text primary key,
  label       text not null,
  description text not null,
  kind        text not null check (kind in ('boolean', 'quota')),
  is_enforced boolean not null default true,
  sort_order  int not null default 0
);

create table if not exists public.sponsor_tiers (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  rank        int not null,
  price_cents int,
  blurb       text not null default '',
  applicant_embargo_hours int not null default 0
    check (applicant_embargo_hours between 0 and 8760),
  is_active   boolean not null default true,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create unique index if not exists sponsor_tiers_rank_active
  on public.sponsor_tiers (rank) where is_active;

create table if not exists public.sponsor_tier_capabilities (
  tier_id    uuid not null references public.sponsor_tiers (id) on delete cascade,
  capability text not null references public.sponsor_capabilities (key),
  value      int,
  primary key (tier_id, capability)
);

create table if not exists public.sponsor_tier_events (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in (
               'tier_created','tier_updated','tier_deactivated','tier_reactivated',
               'capability_granted','capability_revoked','company_assigned')),
  tier_id    uuid references public.sponsor_tiers (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  detail     jsonb not null default '{}'::jsonb,
  actor_id   uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists sponsor_tier_events_created_idx
  on public.sponsor_tier_events (created_at desc);

insert into public.sponsor_capabilities (key, label, description, kind, is_enforced, sort_order)
values
  ('post_in_app_job', 'Post in-app jobs',
   'Jobs that take applications inside the hub. Blank limit means unlimited; a number caps concurrent open postings.',
   'quota', true, 10),
  ('read_applicants', 'Applicant pipeline',
   'See who applied, open resumes, and move candidates through stages.',
   'boolean', true, 20),
  ('dm_initiate_applicant', 'Message applicants',
   'Start a conversation with a member who applied to one of their postings.',
   'boolean', true, 30),
  ('post_event', 'Post events',
   'Publish event postings to the member feed.',
   'boolean', true, 40),
  ('resume_book', 'Resume book',
   'Browse the opt-in member resume book. Not built yet — ticking this records the commercial commitment only.',
   'boolean', false, 50),
  ('candidate_search', 'Candidate search',
   'Search members by program, year, and skills. Not built yet — commitment only.',
   'boolean', false, 60),
  ('dm_initiate_any', 'Message any member',
   'Start a conversation with any opted-in member, not only applicants. Not built yet — commitment only.',
   'boolean', false, 70)
on conflict (key) do nothing;

insert into public.sponsor_tiers (key, name, rank, price_cents, blurb, applicant_embargo_hours, is_active, is_system)
values
  ('none', 'Not sponsoring', 0, null,
   'Announcements, external listings, and replies to members.', 0, true, true),
  ('supporter', 'Supporter', 10, 50000,
   'Basic platform access and the opt-in resume book.', 72, true, false),
  ('partner', 'Partner', 20, 200000,
   'Job posting privileges, the applicant pipeline, and the resume book.', 72, true, false),
  ('leader', 'Leader', 30, 500000,
   'Everything in Partner, plus candidate search, events, and faster applicant access.', 24, true, false),
  ('principal', 'Principal', 40, 1000000,
   'Priority access to every applicant the moment they apply, plus everything in Leader.', 0, true, false),
  ('grandfathered', 'Grandfathered (legacy access)', 999, null,
   'Holds the access every firm had before tiers. Hidden from new assignments.', 0, false, true)
on conflict (key) do nothing;

insert into public.sponsor_tier_capabilities (tier_id, capability, value)
select t.id, c.capability, c.value
from public.sponsor_tiers t
join (values
  ('supporter',     'post_in_app_job',         1),
  ('supporter',     'read_applicants',      null),
  ('supporter',     'dm_initiate_applicant',null),
  ('supporter',     'resume_book',           null),
  ('partner',       'post_in_app_job',      null),
  ('partner',       'read_applicants',      null),
  ('partner',       'dm_initiate_applicant',null),
  ('partner',       'resume_book',           null),
  ('leader',        'post_in_app_job',      null),
  ('leader',        'read_applicants',      null),
  ('leader',        'dm_initiate_applicant',null),
  ('leader',        'post_event',           null),
  ('leader',        'resume_book',           null),
  ('leader',        'candidate_search',     null),
  ('leader',        'dm_initiate_any',      null),
  ('principal',     'post_in_app_job',      null),
  ('principal',     'read_applicants',      null),
  ('principal',     'dm_initiate_applicant',null),
  ('principal',     'post_event',           null),
  ('principal',     'resume_book',           null),
  ('principal',     'candidate_search',     null),
  ('principal',     'dm_initiate_any',      null),
  ('grandfathered', 'post_in_app_job',      null),
  ('grandfathered', 'read_applicants',      null),
  ('grandfathered', 'dm_initiate_applicant',null),
  ('grandfathered', 'post_event',           null)
) as c(tier_key, capability, value) on c.tier_key = t.key
on conflict (tier_id, capability) do nothing;

alter table public.sponsor_capabilities enable row level security;
alter table public.sponsor_tiers enable row level security;
alter table public.sponsor_tier_capabilities enable row level security;
alter table public.sponsor_tier_events enable row level security;

drop policy if exists sponsor_capabilities_read on public.sponsor_capabilities;
create policy sponsor_capabilities_read on public.sponsor_capabilities
  for select to authenticated using (true);

drop policy if exists sponsor_tiers_read on public.sponsor_tiers;
create policy sponsor_tiers_read on public.sponsor_tiers
  for select to authenticated using (true);

drop policy if exists sponsor_tier_capabilities_read on public.sponsor_tier_capabilities;
create policy sponsor_tier_capabilities_read on public.sponsor_tier_capabilities
  for select to authenticated using (true);

drop policy if exists sponsor_tiers_admin_write on public.sponsor_tiers;
create policy sponsor_tiers_admin_write on public.sponsor_tiers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists sponsor_tier_capabilities_admin_write on public.sponsor_tier_capabilities;
create policy sponsor_tier_capabilities_admin_write on public.sponsor_tier_capabilities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists sponsor_tier_events_admin_read on public.sponsor_tier_events;
create policy sponsor_tier_events_admin_read on public.sponsor_tier_events
  for select to authenticated using (public.is_admin());

drop policy if exists sponsor_tier_events_admin_insert on public.sponsor_tier_events;
create policy sponsor_tier_events_admin_insert on public.sponsor_tier_events
  for insert to authenticated with check (public.is_admin());

grant select, insert, update, delete on public.sponsor_tiers to authenticated;
grant select, insert, update, delete on public.sponsor_tier_capabilities to authenticated;
grant select, insert on public.sponsor_tier_events to authenticated;
grant select on public.sponsor_capabilities to authenticated;

create or replace function public.sponsor_tiers_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'The % tier is required and cannot be deleted', old.name;
  end if;
  if tg_op = 'UPDATE' and old.is_system
    and (new.key is distinct from old.key or new.is_active is distinct from old.is_active) then
    raise exception 'The % tier cannot change its key or active flag', old.name;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

drop trigger if exists sponsor_tiers_guard on public.sponsor_tiers;
create trigger sponsor_tiers_guard
  before update or delete on public.sponsor_tiers
  for each row execute function public.sponsor_tiers_guard();

revoke execute on function public.sponsor_tiers_guard() from public, anon;

notify pgrst, 'reload schema';
