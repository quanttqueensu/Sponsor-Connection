-- Quantt Sponsor Hub v1
-- Apply with: supabase db push  (or paste into the SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null check (role in ('member', 'company_user')),
  is_admin boolean not null default false,
  program text,
  grad_year integer,
  bio text,
  interests text,
  linkedin_url text,
  github_url text,
  website_url text,
  photo_path text,
  created_at timestamptz not null default now(),
  constraint admin_is_member check (not is_admin or role = 'member')
);

create table public.profile_sections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  body text not null,
  sort_order integer not null default 0
);

create table public.hiring_packages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  linkedin_url text not null,
  resume_path text not null,
  cover_letter text,
  cover_letter_path text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index hiring_packages_one_default
  on public.hiring_packages (member_id)
  where is_default;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_sponsor boolean not null default false,
  logo_url text,
  website text,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table public.company_users (
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (company_id, profile_id),
  unique (profile_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null default '',
  role text not null check (role in ('member', 'company_user')),
  is_admin boolean not null default false,
  company_id uuid references public.companies (id) on delete cascade,
  invited_by uuid references public.profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint company_invite_has_company check (
    (role = 'company_user' and company_id is not null)
    or (role = 'member' and company_id is null)
  )
);

create unique index invites_pending_email
  on public.invites (lower(email))
  where accepted_at is null;

create table public.company_join_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website text,
  contact_name text not null,
  contact_email text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  admin_note text,
  company_id uuid references public.companies (id),
  created_at timestamptz not null default now()
);

create unique index join_requests_pending_email
  on public.company_join_requests (lower(contact_email))
  where status = 'pending';

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete restrict,
  company_id uuid references public.companies (id) on delete cascade,
  kind text not null check (kind in ('job', 'event', 'announcement', 'connection', 'job_link')),
  title text not null,
  body text not null default '',
  location text,
  starts_at timestamptz,
  published boolean not null default true,
  status text not null default 'open' check (status in ('open', 'closed')),
  role_type text check (role_type in ('full_time', 'internship', 'coop')),
  term_season text check (term_season in ('fall', 'winter', 'summer')),
  term_year integer,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint in_app_job_fields check (
    kind <> 'job'
    or external_url is not null
    or (role_type is not null and term_season is not null and term_year is not null)
  ),
  constraint job_link_has_url check (kind <> 'job_link' or external_url is not null)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('in_app', 'off_platform')),
  post_id uuid references public.posts (id) on delete cascade,
  company_id uuid references public.companies (id),
  company_name text,
  package_id uuid references public.hiring_packages (id) on delete set null,
  package_name text,
  linkedin_url text,
  resume_path text,
  cover_letter text,
  cover_letter_path text,
  stage text not null default 'submitted'
    check (stage in ('submitted', 'reviewing', 'interviewing', 'offer', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint in_app_needs_post check (kind <> 'in_app' or post_id is not null),
  constraint off_platform_needs_name check (kind <> 'off_platform' or company_name is not null)
);

create unique index applications_one_per_job
  on public.applications (member_id, post_id)
  where post_id is not null;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  member_last_read_at timestamptz,
  company_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (member_id, company_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'member' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.company_users where profile_id = auth.uid() limit 1
$$;

create or replace function public.is_in_app_job(p public.posts)
returns boolean
language sql
immutable
as $$
  select p.kind = 'job' and p.external_url is null and p.status = 'open' and p.published
$$;

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
  )
$$;

-- Keep a single default package per member when toggling
create or replace function public.hiring_packages_default_guard()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.hiring_packages
      set is_default = false
      where member_id = new.member_id
        and id is distinct from new.id
        and is_default;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger hiring_packages_before_write
  before insert or update on public.hiring_packages
  for each row execute function public.hiring_packages_default_guard();

-- Members cannot self-promote, change email, or change role.
create or replace function public.profiles_protect_privileged()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.id then
    new.role := old.role;
    new.is_admin := old.is_admin;
    new.email := old.email;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileged
  before update on public.profiles
  for each row execute function public.profiles_protect_privileged();

-- Conversation participants are immutable (read receipts only).
create or replace function public.conversations_protect_keys()
returns trigger
language plpgsql
as $$
begin
  new.member_id := old.member_id;
  new.company_id := old.company_id;
  return new;
end;
$$;

create trigger conversations_protect_keys
  before update on public.conversations
  for each row execute function public.conversations_protect_keys();

-- Company users cannot self-claim sponsor / rewrite slug / flip status.
create or replace function public.companies_protect_admin_fields()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() then
    new.is_sponsor := old.is_sponsor;
    new.status := old.status;
    new.slug := old.slug;
  end if;
  return new;
end;
$$;

create trigger companies_protect_admin_fields
  before update on public.companies
  for each row execute function public.companies_protect_admin_fields();

-- Invite accept
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invites;
begin
  select * into inv
  from public.invites
  where lower(email) = lower(new.email)
    and accepted_at is null
  order by created_at desc
  limit 1;

  if inv.id is null then
    raise exception 'Invite required';
  end if;

  insert into public.profiles (id, email, full_name, role, is_admin)
  values (
    new.id,
    new.email,
    coalesce(nullif(inv.full_name, ''), split_part(new.email, '@', 1)),
    inv.role,
    coalesce(inv.is_admin, false)
  );

  if inv.role = 'company_user' and inv.company_id is not null then
    insert into public.company_users (company_id, profile_id)
    values (inv.company_id, new.id);
  end if;

  update public.invites set accepted_at = now() where id = inv.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Applications: only in-app jobs
create or replace function public.applications_guard()
returns trigger
language plpgsql
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
        and split_part(new.resume_path, '/', 1) <> 'snapshots'
      ) then
      raise exception 'Invalid resume path';
    end if;
    if new.cover_letter_path is not null
      and split_part(new.cover_letter_path, '/', 1) <> new.member_id::text
      and split_part(new.cover_letter_path, '/', 1) <> 'snapshots' then
      raise exception 'Invalid cover letter path';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_before_write
  before insert or update on public.applications
  for each row execute function public.applications_guard();

-- Snapshot columns immutable
create or replace function public.applications_snapshot_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.package_name is distinct from old.package_name
      or new.linkedin_url is distinct from old.linkedin_url
      or new.resume_path is distinct from old.resume_path
      or new.cover_letter is distinct from old.cover_letter
      or new.cover_letter_path is distinct from old.cover_letter_path
      or new.post_id is distinct from old.post_id
      or new.member_id is distinct from old.member_id
      or new.kind is distinct from old.kind
      or new.company_id is distinct from old.company_id
      or new.package_id is distinct from old.package_id
    then
      raise exception 'Application snapshot cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_snapshot_guard
  before update on public.applications
  for each row execute function public.applications_snapshot_immutable();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profile_sections enable row level security;
alter table public.hiring_packages enable row level security;
alter table public.companies enable row level security;
alter table public.company_users enable row level security;
alter table public.invites enable row level security;
alter table public.company_join_requests enable row level security;
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.applications enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- profiles
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy profiles_members_directory on public.profiles
  for select using (public.is_member() and role = 'member');

create policy profiles_company_applicants on public.profiles
  for select using (
    public.my_company_id() is not null
    and public.member_applied_to_company(id, public.my_company_id())
  );

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- profile_sections
create policy sections_member_read on public.profile_sections
  for select using (public.is_member());

create policy sections_own_write on public.profile_sections
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

create policy sections_admin on public.profile_sections
  for all using (public.is_admin()) with check (public.is_admin());

-- hiring_packages
create policy packages_own on public.hiring_packages
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

create policy packages_admin on public.hiring_packages
  for all using (public.is_admin()) with check (public.is_admin());

-- companies
create policy companies_member_read on public.companies
  for select using (public.is_member() and status = 'active');

create policy companies_own_read on public.companies
  for select using (id = public.my_company_id() or public.is_admin());

create policy companies_own_update on public.companies
  for update using (id = public.my_company_id()) with check (id = public.my_company_id());

create policy companies_admin_write on public.companies
  for all using (public.is_admin()) with check (public.is_admin());

-- company_users
create policy company_users_own on public.company_users
  for select using (profile_id = auth.uid() or company_id = public.my_company_id() or public.is_admin());

create policy company_users_admin on public.company_users
  for all using (public.is_admin()) with check (public.is_admin());

-- invites (admin only)
create policy invites_admin on public.invites
  for all using (public.is_admin()) with check (public.is_admin());

-- join requests
create policy join_requests_insert_anon on public.company_join_requests
  for insert to anon with check (status = 'pending');

create policy join_requests_admin on public.company_join_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- posts
create policy posts_member_feed on public.posts
  for select using (published and public.is_member());

create policy posts_company_own on public.posts
  for select using (
    company_id is not null
    and company_id = public.my_company_id()
  );

create policy posts_admin_read on public.posts
  for select using (public.is_admin());

create policy posts_company_insert on public.posts
  for insert with check (
    company_id = public.my_company_id()
    and author_id = auth.uid()
    and kind in ('job', 'job_link', 'event', 'announcement')
  );

create policy posts_company_update on public.posts
  for update using (company_id = public.my_company_id())
  with check (company_id = public.my_company_id());

create policy posts_admin_write on public.posts
  for all using (public.is_admin()) with check (public.is_admin());

-- comments
create policy comments_member_read on public.post_comments
  for select using (public.is_member());

create policy comments_member_insert on public.post_comments
  for insert with check (public.is_member() and author_id = auth.uid());

create policy comments_own_delete on public.post_comments
  for delete using (author_id = auth.uid() or public.is_admin());

-- applications
create policy applications_own on public.applications
  for select using (member_id = auth.uid() or public.is_admin());

create policy applications_company_in_app on public.applications
  for select using (
    kind = 'in_app'
    and post_id in (select id from public.posts where company_id = public.my_company_id())
  );

create policy applications_member_insert on public.applications
  for insert with check (member_id = auth.uid() and public.is_member());

create policy applications_member_off_platform_update on public.applications
  for update using (member_id = auth.uid() and kind = 'off_platform')
  with check (member_id = auth.uid() and kind = 'off_platform');

create policy applications_company_stage on public.applications
  for update using (
    kind = 'in_app'
    and post_id in (select id from public.posts where company_id = public.my_company_id())
  )
  with check (
    kind = 'in_app'
    and post_id in (select id from public.posts where company_id = public.my_company_id())
  );

create policy applications_admin_write on public.applications
  for all using (public.is_admin()) with check (public.is_admin());

-- conversations
create policy conversations_member on public.conversations
  for select using (member_id = auth.uid() or public.is_admin());

create policy conversations_company on public.conversations
  for select using (company_id = public.my_company_id());

create policy conversations_member_insert on public.conversations
  for insert with check (member_id = auth.uid() and public.is_member());

create policy conversations_company_insert on public.conversations
  for insert with check (
    company_id = public.my_company_id()
    and public.member_applied_to_company(member_id, company_id)
  );

create policy conversations_member_update on public.conversations
  for update using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy conversations_company_update on public.conversations
  for update using (company_id = public.my_company_id())
  with check (company_id = public.my_company_id());

-- messages: participants only (admins do not read bodies)
create policy messages_member on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.member_id = auth.uid()
    )
  );

create policy messages_company on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.company_id = public.my_company_id()
    )
  );

create policy messages_insert_member on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.member_id = auth.uid()
    )
  );

create policy messages_insert_company on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.company_id = public.my_company_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false), ('photos', 'photos', false)
on conflict (id) do nothing;

create policy resumes_own_read on storage.objects
  for select using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy resumes_own_write on storage.objects
  for insert with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy resumes_own_update on storage.objects
  for update using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy photos_own_write on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy photos_own_update on storage.objects
  for update using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy photos_member_read on storage.objects
  for select using (bucket_id = 'photos' and public.is_member());

create policy photos_own_read on storage.objects
  for select using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant insert on public.company_join_requests to anon;

-- Helpers used in RLS must stay executable by logged-in users (policy checks
-- run as `authenticated`). Keep them off anon/public so they are not anonymous RPCs.
revoke execute on function public.member_applied_to_company(uuid, uuid) from public, anon;
revoke execute on function public.current_profile() from public, anon;
revoke execute on function public.is_in_app_job(public.posts) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_member() from public, anon;
revoke execute on function public.my_company_id() from public, anon;
grant execute on function public.member_applied_to_company(uuid, uuid) to authenticated;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.is_in_app_job(public.posts) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.my_company_id() to authenticated;

create index if not exists company_users_profile_id_idx on public.company_users (profile_id);
create index if not exists messages_conversation_id_idx on public.messages (conversation_id, created_at);
create index if not exists posts_company_id_idx on public.posts (company_id);
create index if not exists posts_published_created_idx on public.posts (created_at desc) where published;
create index if not exists applications_post_id_idx on public.applications (post_id);
create index if not exists applications_member_id_idx on public.applications (member_id);
create index if not exists applications_company_id_idx on public.applications (company_id);
create index if not exists conversations_company_id_idx on public.conversations (company_id);
create index if not exists post_comments_post_id_idx on public.post_comments (post_id);
create index if not exists profile_sections_member_id_idx on public.profile_sections (member_id);
create index if not exists hiring_packages_member_id_idx on public.hiring_packages (member_id);
