# Phase 1 — Sponsor Tiers (Admin-Customizable) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `companies.is_sponsor` with admin-editable sponsor tiers whose capability grants are enforced in row level security, rolled out so that no firm loses anything on day one.

**Architecture:** Tiers, and the capabilities each tier grants, are rows in three tables that admins edit through the admin UI — so QUANTT can rename tiers, change prices, and move a deliverable between tiers without a deploy. The *set* of capabilities is a migration-seeded reference table, because a capability only means something if code enforces it. RLS policies call `my_capability('post_in_app_job')` rather than comparing hardcoded ranks. Every company is grandfathered into a grace tier for 60 days, and the UI gates on the real tier while the database still permits everything, so the whole rollout is observable before it bites.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Supabase (Auth/Postgres/Storage), TypeScript, Vitest + local Supabase (from the Phase 0 plan).

**Spec:** `docs/superpowers/specs/2026-08-24-sponsor-tiers-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-24-phase-0-foundations.md` — Tasks 1 (test harness) and 3 (`denyRedirect`) are hard prerequisites. Task 8 (SMTP) is required before expiry warnings, which are in Task 10 here.

## Global Constraints

- Node 20 for all npm/next commands: `~/.nvm/versions/node/v20.20.2`.
- Branding: navy `#0a1628`, primary `#2452a1`, Inter + Merriweather, dark hub.
- Migration numbering continues from Phase 0: this plan uses `0005`–`0007`.
- **`is_admin()` resolves through `auth.uid()`, so it is false under the service role, the SQL editor, psql, and migrations.** Any trigger keyed on it reverts those writes. Every admin mutation in this plan uses the user-scoped client (`lib/supabase/server.ts`), never `createAdminClient()`.
- Capability keys in code must match `sponsor_capabilities.key` exactly. Task 3 adds a test that fails if they drift.
- Never edit `0001_init.sql`.
- RLS is authoritative. `lib/tiers.ts` is a read-through cache for rendering, never a substitute for a policy.
- Do not commit or push unless the executing human asks.

---

### Task 1: Tier tables, capability reference, and seed

**Files:**
- Create: `supabase/migrations/0005_sponsor_tier_tables.sql`
- Test: `tests/rls/tier-tables.test.ts`

**Interfaces:**
- Consumes: `tests/helpers/db.ts` (Phase 0 Task 1).
- Produces: tables `sponsor_capabilities`, `sponsor_tiers`, `sponsor_tier_capabilities`, `sponsor_tier_events`. Capability keys: `post_in_app_job`, `post_event`, `read_applicants`, `dm_initiate_applicant`, `dm_initiate_any`, `resume_book`, `candidate_search`, `applicant_embargo_hours`. Later tasks reference these exact strings.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_sponsor_tier_tables.sql`:

```sql
-- Sponsor tiers as data. Admins own tier definitions and the capability
-- matrix; the set of capabilities is fixed by migration because a capability
-- only means something if a policy enforces it.

create table public.sponsor_capabilities (
  key         text primary key,
  label       text not null,
  description text not null,
  kind        text not null check (kind in ('boolean', 'quota', 'hours')),
  sort_order  int  not null default 0
);

create table public.sponsor_tiers (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  rank        int  not null,
  price_cents int,
  blurb       text not null default '',
  is_active   boolean not null default true,
  is_system   boolean not null default false,  -- 'none' cannot be deleted
  created_at  timestamptz not null default now()
);

create table public.sponsor_tier_capabilities (
  tier_id    uuid not null references public.sponsor_tiers (id) on delete cascade,
  capability text not null references public.sponsor_capabilities (key),
  value      int,
  primary key (tier_id, capability)
);

-- Append-only audit. The rules changing matters more than an assignment
-- changing, and this is the only institutional memory that survives turnover.
create table public.sponsor_tier_events (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in
               ('tier_created','tier_updated','tier_deactivated',
                'capability_granted','capability_revoked','company_assigned')),
  tier_id    uuid references public.sponsor_tiers (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  detail     jsonb not null default '{}'::jsonb,
  actor_id   uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index sponsor_tier_events_company_idx on public.sponsor_tier_events (company_id, created_at desc);

-- Capabilities that actually exist. Adding a row here without a policy that
-- reads it is a lie; adding a policy without a row here makes it unassignable.
insert into public.sponsor_capabilities (key, label, description, kind, sort_order) values
  ('post_in_app_job', 'Post in-app jobs',
   'Publish jobs that accept applications inside the hub, with resume snapshots and a stage pipeline. Blank means unlimited; a number caps concurrent open postings.',
   'quota', 10),
  ('read_applicants', 'Applicant pipeline',
   'See who applied to their postings, open resumes, and move candidates through stages.',
   'boolean', 20),
  ('applicant_embargo_hours', 'Applicant visibility delay',
   'Hours a new application is hidden from this tier. 0 or blank means immediate. Higher tiers see candidates first.',
   'hours', 30),
  ('dm_initiate_applicant', 'Message applicants',
   'Start a conversation with a member who applied to one of their postings.',
   'boolean', 40),
  ('dm_initiate_any', 'Message any member',
   'Start a conversation with any opted-in member, not only applicants. Requires candidate search.',
   'boolean', 50),
  ('post_event', 'Post events',
   'Publish event postings to the member feed.',
   'boolean', 60),
  ('resume_book', 'Resume book',
   'Browse the opt-in member resume book. Not built yet — Phase 2.',
   'boolean', 70),
  ('candidate_search', 'Candidate search',
   'Search members by program, year, and skills. Not built yet — Phase 3.',
   'boolean', 80);

-- Seeded defaults matching the current sales deck. Admins may change all of
-- this in the UI; these values only decide where the platform starts.
insert into public.sponsor_tiers (key, name, rank, price_cents, blurb, is_system) values
  ('none',      'Not sponsoring',   0, null,     'Can post announcements and external listings, and reply to members.', true),
  ('supporter', 'Supporter',        1,   50000, 'Basic platform access and the opt-in resume book.', false),
  ('partner',   'Partner',          2,  200000, 'Job posting privileges, the applicant pipeline, and the resume book.', false),
  ('leader',    'Leader',           3,  500000, 'Everything in Partner, plus candidate search, events, and faster applicant access.', false),
  ('principal', 'Principal',        4, 1000000, 'Priority access to every applicant the moment they apply, plus everything in Leader.', false);

insert into public.sponsor_tier_capabilities (tier_id, capability, value)
select t.id, c.capability, c.value
from public.sponsor_tiers t
join (values
  -- supporter: one open in-app job, longest embargo
  ('supporter', 'post_in_app_job',         1),
  ('supporter', 'read_applicants',      null),
  ('supporter', 'applicant_embargo_hours', 72),
  ('supporter', 'dm_initiate_applicant',null),
  ('supporter', 'resume_book',           null),
  -- partner: unlimited jobs
  ('partner',   'post_in_app_job',      null),
  ('partner',   'read_applicants',      null),
  ('partner',   'applicant_embargo_hours', 72),
  ('partner',   'dm_initiate_applicant',null),
  ('partner',   'resume_book',          null),
  -- leader: events, search, shorter embargo
  ('leader',    'post_in_app_job',      null),
  ('leader',    'read_applicants',      null),
  ('leader',    'applicant_embargo_hours', 24),
  ('leader',    'dm_initiate_applicant',null),
  ('leader',    'dm_initiate_any',      null),
  ('leader',    'post_event',           null),
  ('leader',    'resume_book',          null),
  ('leader',    'candidate_search',     null),
  -- principal: no embargo at all
  ('principal', 'post_in_app_job',      null),
  ('principal', 'read_applicants',      null),
  ('principal', 'applicant_embargo_hours', 0),
  ('principal', 'dm_initiate_applicant',null),
  ('principal', 'dm_initiate_any',      null),
  ('principal', 'post_event',           null),
  ('principal', 'resume_book',          null),
  ('principal', 'candidate_search',     null)
) as c(tier_key, capability, value) on c.tier_key = t.key;

alter table public.sponsor_capabilities        enable row level security;
alter table public.sponsor_tiers               enable row level security;
alter table public.sponsor_tier_capabilities   enable row level security;
alter table public.sponsor_tier_events         enable row level security;

-- Tier definitions are public to signed-in users: companies need to see what
-- they could upgrade to, members see the badge. Commercial detail is not here.
create policy sponsor_capabilities_read on public.sponsor_capabilities
  for select to authenticated using (true);
create policy sponsor_tiers_read on public.sponsor_tiers
  for select to authenticated using (true);
create policy sponsor_tier_capabilities_read on public.sponsor_tier_capabilities
  for select to authenticated using (true);

create policy sponsor_tiers_admin on public.sponsor_tiers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sponsor_tier_capabilities_admin on public.sponsor_tier_capabilities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sponsor_tier_events_admin on public.sponsor_tier_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- sponsor_capabilities has no write policy: it changes by migration only.

-- REQUIRED: 0001_init.sql:702 granted on ALL TABLES as a one-time snapshot and
-- there is no ALTER DEFAULT PRIVILEGES, so new tables get nothing without this.
grant select, insert, update, delete on public.sponsor_tiers             to authenticated;
grant select, insert, update, delete on public.sponsor_tier_capabilities to authenticated;
grant select, insert, update, delete on public.sponsor_tier_events       to authenticated;
grant select                          on public.sponsor_capabilities      to authenticated;

-- Protect the reserved fallback tier.
create or replace function public.sponsor_tiers_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'The % tier is required and cannot be deleted', old.name;
  end if;
  if tg_op = 'UPDATE' and old.is_system and (new.key <> old.key or not new.is_active) then
    raise exception 'The % tier cannot be renamed or deactivated', old.name;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger sponsor_tiers_guard
  before update or delete on public.sponsor_tiers
  for each row execute function public.sponsor_tiers_guard();

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Write the failing test**

Create `tests/rls/tier-tables.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, resetDb, seedMember } from "../helpers/db";

describe("sponsor tier tables", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("seeds five tiers with the none tier at rank 0", async () => {
    const { data } = await asService()
      .from("sponsor_tiers")
      .select("key, rank, is_system")
      .order("rank");

    expect(data!.map((t) => t.key)).toEqual([
      "none", "supporter", "partner", "leader", "principal",
    ]);
    expect(data![0].is_system).toBe(true);
  });

  it("gives principal a zero-hour embargo and supporter seventy-two", async () => {
    const svc = asService();
    const { data } = await svc
      .from("sponsor_tier_capabilities")
      .select("value, sponsor_tiers!inner(key)")
      .eq("capability", "applicant_embargo_hours");

    const byTier = Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data!.map((r: any) => [r.sponsor_tiers.key, r.value]),
    );
    expect(byTier.principal).toBe(0);
    expect(byTier.supporter).toBe(72);
  });

  it("refuses to delete the system tier", async () => {
    const { error } = await asService()
      .from("sponsor_tiers")
      .delete()
      .eq("key", "none");

    expect(error?.message).toMatch(/cannot be deleted/i);
  });

  it("refuses a capability key that is not in the reference table", async () => {
    const { data: tier } = await asService()
      .from("sponsor_tiers").select("id").eq("key", "partner").single();

    const { error } = await asService()
      .from("sponsor_tier_capabilities")
      .insert({ tier_id: tier!.id, capability: "invent_something", value: null });

    expect(error?.code).toBe("23503"); // FK violation
  });

  it("a non-admin member cannot edit tiers but can read them", async () => {
    await seedMember("member@test.dev");
    const member = await asUser("member@test.dev");

    const { data: readable } = await member.from("sponsor_tiers").select("key");
    expect(readable!.length).toBeGreaterThan(0);

    const { data: written } = await member
      .from("sponsor_tiers")
      .update({ name: "Hacked" })
      .eq("key", "partner")
      .select("id");
    expect(written ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test -- tier-tables
```

Expected: FAIL — relation `sponsor_tiers` does not exist.

- [ ] **Step 4: Apply and re-run**

```bash
supabase db reset
~/.nvm/versions/node/v20.20.2/bin/npm test -- tier-tables
```

Expected: all five PASS. If the "not in the reference table" test returns `42501` instead of `23503`, the `GRANT` block was omitted — that is exactly the trap in spec §2.6.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_sponsor_tier_tables.sql tests/rls/tier-tables.test.ts
git commit -m "feat: add admin-editable sponsor tier and capability tables"
```

---

### Task 2: Attach tiers to companies, grandfather everyone, drop is_sponsor

**Files:**
- Create: `supabase/migrations/0006_company_tiers.sql`
- Modify: `supabase/seed.sql`
- Test: `tests/rls/company-tier.test.ts`

**Interfaces:**
- Consumes: `sponsor_tiers` from Task 1.
- Produces: `companies.sponsor_tier_id`, `companies.grace_tier_id`, `companies.tier_grace_until`. Functions `my_effective_tier_id() → uuid`, `my_capability(text) → boolean`, `my_capability_value(text) → int`. Task 3 onward call these exact names.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_company_tiers.sql`. **The order of these statements is load-bearing** — see the warning in step 3 of the block.

```sql
-- 1. Columns.
alter table public.companies
  add column sponsor_tier_id  uuid references public.sponsor_tiers (id) on delete restrict,
  add column grace_tier_id    uuid references public.sponsor_tiers (id) on delete restrict,
  add column tier_grace_until date;

-- 2. Rewrite the protect trigger BEFORE any data write.
--
--    is_admin() resolves through auth.uid(), which is NULL under migrations,
--    psql, the SQL editor, and the service-role client. Without the escape
--    below, step 3's backfill would be silently reverted and every company
--    would land on the fallback tier. Drop the is_sponsor line too: the column
--    disappears in step 5 and plpgsql resolves record fields at execution
--    time, so leaving it is a latent 42703 on the next UPDATE.
create or replace function public.companies_protect_admin_fields()
returns trigger language plpgsql as $$
begin
  -- auth.uid() is null => not a user session (migration/service role): allow.
  if auth.uid() is not null and not public.is_admin() then
    if new.sponsor_tier_id  is distinct from old.sponsor_tier_id
    or new.grace_tier_id    is distinct from old.grace_tier_id
    or new.tier_grace_until is distinct from old.tier_grace_until
    or new.status           is distinct from old.status
    or new.slug             is distinct from old.slug then
      raise exception 'Only QUANTT admins can change sponsorship, status, or slug';
    end if;
  end if;
  return new;
end;
$$;

-- 3. Grandfather. Nobody loses anything today: every existing company gets a
--    60-day grace at 'partner', which is what they can do right now.
update public.companies c
set sponsor_tier_id = (select id from public.sponsor_tiers where key = case when c.is_sponsor then 'partner' else 'none' end),
    grace_tier_id   = (select id from public.sponsor_tiers where key = 'partner'),
    tier_grace_until = current_date + 60;

alter table public.companies
  alter column sponsor_tier_id set not null;

-- 4. Refuse to proceed if anyone would be stranded. Converts the assignment
--    list from a hand-wave into something the database checks.
do $$
declare stranded int;
begin
  select count(*) into stranded
  from public.companies c
  join public.sponsor_tiers t on t.id = c.sponsor_tier_id
  where c.status = 'active'
    and t.rank = 0
    and c.tier_grace_until is null
    and exists (select 1 from public.company_users cu where cu.company_id = c.id);
  if stranded > 0 then
    raise exception
      'Refusing to apply: % active companies with users would have no capability and no grace', stranded;
  end if;
end $$;

-- 5. Drop the boolean.
alter table public.companies drop column is_sponsor;

-- 6. Resolution helpers.
create or replace function public.my_effective_tier_id() returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when c.tier_grace_until is not null
     and c.tier_grace_until >= current_date
     and coalesce(g.rank, -1) > coalesce(t.rank, -1)
    then c.grace_tier_id else c.sponsor_tier_id
  end
  from public.company_users cu
  join public.companies c on c.id = cu.company_id
  left join public.sponsor_tiers t on t.id = c.sponsor_tier_id
  left join public.sponsor_tiers g on g.id = c.grace_tier_id
  where cu.profile_id = auth.uid() and c.status = 'active'
$$;

create or replace function public.my_capability(cap text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sponsor_tier_capabilities tc
    where tc.tier_id = public.my_effective_tier_id() and tc.capability = cap
  )
$$;

create or replace function public.my_capability_value(cap text) returns int
language sql stable security definer set search_path = public as $$
  select tc.value from public.sponsor_tier_capabilities tc
  where tc.tier_id = public.my_effective_tier_id() and tc.capability = cap
$$;

revoke execute on function public.my_effective_tier_id()   from public, anon;
revoke execute on function public.my_capability(text)      from public, anon;
revoke execute on function public.my_capability_value(text) from public, anon;
grant  execute on function public.my_effective_tier_id()   to authenticated;
grant  execute on function public.my_capability(text)      to authenticated;
grant  execute on function public.my_capability_value(text) to authenticated;

create index companies_sponsor_tier_idx on public.companies (sponsor_tier_id);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Update the seed**

`supabase/seed.sql:1` inserts `is_sponsor` and will break the next `supabase db reset`. Replace the column with a tier lookup:

```sql
insert into public.companies (name, slug, sponsor_tier_id, website, description, status)
select v.name, v.slug, t.id, v.website, v.description, v.status
from (values
  ('Northgate Capital', 'northgate-capital', 'principal', 'https://example.com', 'Systematic macro.', 'active'),
  ('Kestrel Trading',   'kestrel-trading',   'leader',    'https://example.com', 'Market making.',    'active'),
  ('Vantage Partners',  'vantage-partners',  'partner',   'https://example.com', 'Multi-strategy.',   'active'),
  ('Halden Research',   'halden-research',   'supporter', 'https://example.com', 'Equity research.',  'active'),
  ('Viewpoint Capital', 'viewpoint-capital', 'none',      'https://example.com', 'Long/short.',       'inactive')
) as v(name, slug, tier_key, website, description, status)
join public.sponsor_tiers t on t.key = v.tier_key;
```

- [ ] **Step 3: Write the failing test**

Create `tests/rls/company-tier.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, resetDb, seedCompany, seedCompanyUser } from "../helpers/db";

async function tierId(key: string): Promise<string> {
  const { data } = await asService().from("sponsor_tiers").select("id").eq("key", key).single();
  return data!.id;
}

async function setTier(companyId: string, key: string, graceUntil: string | null = null) {
  await asService()
    .from("companies")
    .update({ sponsor_tier_id: await tierId(key), tier_grace_until: graceUntil })
    .eq("id", companyId);
}

describe("capability resolution", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("resolves a partner's capabilities", async () => {
    const acme = await seedCompany("Acme Capital");
    await setTier(acme, "partner");
    await seedCompanyUser("recruiter@acme.dev", acme);
    const recruiter = await asUser("recruiter@acme.dev");

    const { data: canPost } = await recruiter.rpc("my_capability", { cap: "post_in_app_job" });
    const { data: canSearch } = await recruiter.rpc("my_capability", { cap: "candidate_search" });
    expect(canPost).toBe(true);
    expect(canSearch).toBe(false);
  });

  it("caps a supporter at one open in-app job", async () => {
    const acme = await seedCompany("Acme Capital");
    await setTier(acme, "supporter");
    await seedCompanyUser("recruiter@acme.dev", acme);
    const recruiter = await asUser("recruiter@acme.dev");

    const { data } = await recruiter.rpc("my_capability_value", { cap: "post_in_app_job" });
    expect(data).toBe(1);
  });

  it("grace outranks the assigned tier while the window is open", async () => {
    const acme = await seedCompany("Acme Capital");
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await asService()
      .from("companies")
      .update({
        sponsor_tier_id: await tierId("none"),
        grace_tier_id: await tierId("partner"),
        tier_grace_until: future,
      })
      .eq("id", acme);
    await seedCompanyUser("recruiter@acme.dev", acme);
    const recruiter = await asUser("recruiter@acme.dev");

    const { data } = await recruiter.rpc("my_capability", { cap: "post_in_app_job" });
    expect(data).toBe(true);
  });

  it("grace stops applying once it expires", async () => {
    const acme = await seedCompany("Acme Capital");
    const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await asService()
      .from("companies")
      .update({
        sponsor_tier_id: await tierId("none"),
        grace_tier_id: await tierId("partner"),
        tier_grace_until: past,
      })
      .eq("id", acme);
    await seedCompanyUser("recruiter@acme.dev", acme);
    const recruiter = await asUser("recruiter@acme.dev");

    const { data } = await recruiter.rpc("my_capability", { cap: "post_in_app_job" });
    expect(data).toBe(false);
  });

  it("a company user cannot promote their own tier", async () => {
    const acme = await seedCompany("Acme Capital");
    await setTier(acme, "supporter");
    await seedCompanyUser("recruiter@acme.dev", acme);
    const recruiter = await asUser("recruiter@acme.dev");

    const { error } = await recruiter
      .from("companies")
      .update({ sponsor_tier_id: await tierId("principal") })
      .eq("id", acme);

    // The trigger raises rather than silently reverting.
    expect(error?.message).toMatch(/Only QUANTT admins/i);
  });

  it("a company user can still edit its own descriptive fields", async () => {
    const acme = await seedCompany("Acme Capital");
    await setTier(acme, "partner");
    await seedCompanyUser("recruiter@acme.dev", acme);
    const recruiter = await asUser("recruiter@acme.dev");

    const { error } = await recruiter
      .from("companies")
      .update({ description: "Updated blurb" })
      .eq("id", acme);

    expect(error).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify it fails, then apply**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test -- company-tier
```

Expected: FAIL — `sponsor_tier_id` does not exist.

```bash
supabase db reset
~/.nvm/versions/node/v20.20.2/bin/npm test -- company-tier
```

Expected: all seven PASS.

- [ ] **Step 5: Prove the ordering hazard is real**

This guards the most dangerous line in the migration. Temporarily move the step-2 trigger rewrite *above* the step-3 backfill in a scratch copy, re-run `supabase db reset`, and confirm the backfill silently produces `none` for every company. Then restore the correct order. Record what you saw in the commit message.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0006_company_tiers.sql supabase/seed.sql tests/rls/company-tier.test.ts
git commit -m "feat: attach tiers to companies, grandfather all existing firms"
```

---

### Task 3: Enforce capabilities in RLS

**Files:**
- Create: `supabase/migrations/0007_tier_policies.sql`
- Test: `tests/rls/tier-enforcement.test.ts`

**Interfaces:**
- Consumes: `my_capability`, `my_capability_value` from Task 2; `is_in_app_job` (`0001_init.sql:232`).
- Produces: enforcement. No new importable symbols.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0007_tier_policies.sql`:

```sql
-- Capability-gated posting. Note the predicate is is_in_app_job / external_url,
-- never kind alone: in_app_job_fields permits kind='job' WITH an external_url,
-- so a kind-only ladder is bypassed by inserting with a URL then nulling it.

create or replace function public.my_open_in_app_jobs() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.posts p
  join public.company_users cu on cu.company_id = p.company_id
  where cu.profile_id = auth.uid()
    and p.kind = 'job' and p.external_url is null
    and p.status = 'open' and p.published
$$;
revoke execute on function public.my_open_in_app_jobs() from public, anon;
grant  execute on function public.my_open_in_app_jobs() to authenticated;

drop policy if exists posts_company_insert on public.posts;
create policy posts_company_insert on public.posts
  for insert to authenticated with check (
    company_id = (select public.my_company_id())
    and author_id = auth.uid()
    and (
      -- ungated: announcements and external listings keep the feed useful
      kind = 'announcement'
      or kind = 'job_link'
      or (kind = 'job' and external_url is not null)
      -- gated: events
      or (kind = 'event' and (select public.my_capability('post_event')))
      -- gated: in-app jobs, with an optional concurrency cap
      or (
        kind = 'job' and external_url is null
        and (select public.my_capability('post_in_app_job'))
        and (
          (select public.my_capability_value('post_in_app_job')) is null
          or (select public.my_open_in_app_jobs())
             < (select public.my_capability_value('post_in_app_job'))
        )
      )
    )
  );

-- 0001's update policy had NO kind check and omitted author_id, so a company
-- could insert a legal announcement and update it to kind='connection', or
-- reassign authorship. Both sides now carry the same ladder.
drop policy if exists posts_company_update on public.posts;
create policy posts_company_update on public.posts
  for update to authenticated
  using (company_id = (select public.my_company_id()))
  with check (
    company_id = (select public.my_company_id())
    and author_id = auth.uid()
    and (
      kind = 'announcement'
      or kind = 'job_link'
      or (kind = 'job' and external_url is not null)
      or (kind = 'event' and (select public.my_capability('post_event')))
      or (kind = 'job' and external_url is null
          and (select public.my_capability('post_in_app_job')))
    )
  );

-- A firm below the gate must still be able to take its own live posts down.
-- Without this, a downgrade freezes their jobs on the member feed forever.
create or replace function public.posts_status_only_guard()
returns trigger language plpgsql as $$
begin
  if new.kind is distinct from old.kind
  or new.title is distinct from old.title
  or new.body is distinct from old.body
  or new.external_url is distinct from old.external_url
  or new.company_id is distinct from old.company_id then
    raise exception 'Only the status of this post may be changed at your tier';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create policy posts_company_close on public.posts
  for update to authenticated
  using (company_id = (select public.my_company_id()))
  with check (company_id = (select public.my_company_id()));

create trigger posts_status_only
  before update on public.posts
  for each row
  when (
    old.company_id is not null
    and not public.is_admin()
  )
  execute function public.posts_status_only_guard_if_needed();

-- The guard only bites when the row would fail the capability ladder; a fully
-- entitled firm edits freely.
create or replace function public.posts_status_only_guard_if_needed()
returns trigger language plpgsql as $$
begin
  if new.kind = 'job' and new.external_url is null
     and not public.my_capability('post_in_app_job') then
    return public.posts_status_only_guard();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Applicants: gated, and delayed by the tier's embargo.
drop policy if exists applications_company_in_app on public.applications;
create policy applications_company_in_app on public.applications
  for select to authenticated using (
    (select public.my_capability('read_applicants'))
    and kind = 'in_app'
    and created_at
        <= now() - (coalesce((select public.my_capability_value('applicant_embargo_hours')), 0)
                    * interval '1 hour')
    and post_id in (
      select id from public.posts where company_id = (select public.my_company_id())
    )
  );

drop policy if exists applications_company_stage on public.applications;
create policy applications_company_stage on public.applications
  for update to authenticated
  using (
    (select public.my_capability('read_applicants'))
    and kind = 'in_app'
    and post_id in (
      select id from public.posts where company_id = (select public.my_company_id())
    )
  )
  with check (
    (select public.my_capability('read_applicants'))
    and kind = 'in_app'
    and post_id in (
      select id from public.posts where company_id = (select public.my_company_id())
    )
  );

drop policy if exists conversations_company_insert on public.conversations;
create policy conversations_company_insert on public.conversations
  for insert to authenticated with check (
    company_id = (select public.my_company_id())
    and (select public.my_capability('dm_initiate_applicant'))
    and public.member_applied_to_company(member_id, company_id)
  );

-- messages_insert_company is deliberately NOT gated. A firm that can read a
-- member's message must be able to answer it; silence reads as rejection.

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Write the failing test**

Create `tests/rls/tier-enforcement.test.ts`. Reuse the `tierId`/`setTier` helpers from Task 3's test file by extracting them into `tests/helpers/tiers.ts` first, then:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, resetDb, seedCompany, seedCompanyUser, seedMember } from "../helpers/db";
import { setTier } from "../helpers/tiers";

async function attempt(email: string, companyId: string, authorId: string, overrides: object) {
  const client = await asUser(email);
  return client.from("posts").insert({
    author_id: authorId,
    company_id: companyId,
    kind: "job",
    title: "Quant Intern",
    role_type: "internship",
    term_season: "summer",
    term_year: 2027,
    ...overrides,
  });
}

describe("tier enforcement", () => {
  let acme: string;
  let authorId: string;

  beforeEach(async () => {
    await resetDb();
    acme = await seedCompany("Acme Capital");
    authorId = await seedCompanyUser("recruiter@acme.dev", acme);
  });

  it("a rank-0 firm cannot post an in-app job", async () => {
    await setTier(acme, "none");
    const { error } = await attempt("recruiter@acme.dev", acme, authorId, { external_url: null });
    expect(error?.code).toBe("42501");
  });

  it("a rank-0 firm CAN still post an announcement and an external listing", async () => {
    await setTier(acme, "none");
    const client = await asUser("recruiter@acme.dev");

    const ann = await client.from("posts").insert({
      author_id: authorId, company_id: acme, kind: "announcement", title: "Hello",
    });
    expect(ann.error).toBeNull();

    const ext = await attempt("recruiter@acme.dev", acme, authorId, {
      external_url: "https://acme.example/careers",
    });
    expect(ext.error).toBeNull();
  });

  it("closes the insert-then-update bypass", async () => {
    await setTier(acme, "none");
    const client = await asUser("recruiter@acme.dev");

    const { data: post } = await client
      .from("posts")
      .insert({
        author_id: authorId, company_id: acme, kind: "job",
        title: "External", external_url: "https://acme.example/careers",
      })
      .select("id").single();

    // Nulling the URL would turn this into an in-app job they cannot have.
    const { error } = await client
      .from("posts").update({ external_url: null }).eq("id", post!.id);

    expect(error).toBeTruthy();
  });

  it("a supporter can open one in-app job but not two", async () => {
    await setTier(acme, "supporter");
    const first = await attempt("recruiter@acme.dev", acme, authorId, { external_url: null });
    expect(first.error).toBeNull();

    const second = await attempt("recruiter@acme.dev", acme, authorId, { external_url: null });
    expect(second.error?.code).toBe("42501");
  });

  it("a downgraded firm can still close its own live post", async () => {
    await setTier(acme, "partner");
    const client = await asUser("recruiter@acme.dev");
    const { data: post } = await client
      .from("posts")
      .insert({
        author_id: authorId, company_id: acme, kind: "job", title: "Quant Intern",
        external_url: null, role_type: "internship", term_season: "summer", term_year: 2027,
      })
      .select("id").single();

    await setTier(acme, "none");
    const closer = await asUser("recruiter@acme.dev");
    const { error } = await closer
      .from("posts").update({ status: "closed" }).eq("id", post!.id);

    expect(error).toBeNull();
  });

  it("the embargo hides fresh applications from a partner but not a principal", async () => {
    await setTier(acme, "partner");
    const memberId = await seedMember("member@test.dev");
    const svc = asService();
    const { data: post } = await svc.from("posts").insert({
      author_id: authorId, company_id: acme, kind: "job", title: "Quant Intern",
      external_url: null, role_type: "internship", term_season: "summer", term_year: 2027,
    }).select("id").single();

    await svc.from("applications").insert({
      member_id: memberId, kind: "in_app", post_id: post!.id, company_id: acme,
      package_name: "Default", linkedin_url: "https://example.com",
      resume_path: `snapshots/x/resume.pdf`,
    });

    const partner = await asUser("recruiter@acme.dev");
    const hidden = await partner.from("applications").select("id");
    expect(hidden.data ?? []).toHaveLength(0);

    await setTier(acme, "principal");
    const principal = await asUser("recruiter@acme.dev");
    const visible = await principal.from("applications").select("id");
    expect(visible.data ?? []).toHaveLength(1);
  });

  it("a rank-0 firm can still reply to a member's message", async () => {
    await setTier(acme, "none");
    const memberId = await seedMember("member@test.dev");
    const member = await asUser("member@test.dev");
    const { data: convo } = await member
      .from("conversations").insert({ member_id: memberId, company_id: acme })
      .select("id").single();
    await member.from("messages").insert({
      conversation_id: convo!.id, sender_id: memberId, body: "Hi",
    });

    const recruiter = await asUser("recruiter@acme.dev");
    const { error } = await recruiter.from("messages").insert({
      conversation_id: convo!.id, sender_id: authorId, body: "Hello back",
    });

    expect(error).toBeNull();
  });
});
```

- [ ] **Step 3: Run, apply, re-run**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test -- tier-enforcement
supabase db reset
~/.nvm/versions/node/v20.20.2/bin/npm test -- tier-enforcement
```

Expected: FAIL before, all eight PASS after.

- [ ] **Step 4: Add the drift test**

Create `tests/rls/capability-drift.test.ts`, which fails if code constants and the reference table disagree:

```ts
import { describe, expect, it } from "vitest";
import { asService } from "../helpers/db";
import { CAPABILITIES } from "../../lib/tiers";

describe("capability keys", () => {
  it("code constants match the database reference table exactly", async () => {
    const { data } = await asService().from("sponsor_capabilities").select("key");
    expect(new Set(data!.map((r) => r.key))).toEqual(new Set(CAPABILITIES));
  });
});
```

This will fail until Task 4 creates `lib/tiers.ts`. That is expected — it is the next task.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_tier_policies.sql tests/rls/tier-enforcement.test.ts tests/helpers/tiers.ts
git commit -m "feat: enforce tier capabilities in RLS"
```

---

### Task 4: lib/tiers.ts — read-through, not a hardcoded mirror

Because tiers are now data, the client layer must read them rather than duplicate them. This is the fix for the drift risk the spec flags in §5.

**Files:**
- Create: `lib/tiers.ts`
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: tables from Tasks 1–2.
- Produces: `CAPABILITIES: readonly string[]`, `type Capability`, `type Tier`, `type TierWithCaps`, `loadTiers(): Promise<TierWithCaps[]>`, `loadMyTier(): Promise<TierWithCaps | null>`, `can(tier, cap): boolean`, `capValue(tier, cap): number | null`. Tasks 5–8 consume all of these.

- [ ] **Step 1: Write it**

```ts
import { createClient } from "@/lib/supabase/server";

/** Must match sponsor_capabilities.key exactly — tests/rls/capability-drift.test.ts enforces this. */
export const CAPABILITIES = [
  "post_in_app_job",
  "read_applicants",
  "applicant_embargo_hours",
  "dm_initiate_applicant",
  "dm_initiate_any",
  "post_event",
  "resume_book",
  "candidate_search",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type Tier = {
  id: string;
  key: string;
  name: string;
  rank: number;
  price_cents: number | null;
  blurb: string;
  is_active: boolean;
  is_system: boolean;
};

export type TierWithCaps = Tier & {
  capabilities: { capability: Capability; value: number | null }[];
};

export function can(tier: TierWithCaps | null, cap: Capability): boolean {
  return !!tier?.capabilities.some((c) => c.capability === cap);
}

export function capValue(tier: TierWithCaps | null, cap: Capability): number | null {
  return tier?.capabilities.find((c) => c.capability === cap)?.value ?? null;
}

/** All active tiers, ranked. Used by the admin matrix and upgrade prompts. */
export async function loadTiers(): Promise<TierWithCaps[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sponsor_tiers")
    .select("*, capabilities:sponsor_tier_capabilities(capability, value)")
    .order("rank");
  return (data ?? []) as TierWithCaps[];
}

/** The effective tier of the signed-in company user, honouring the grace window. */
export async function loadMyTier(): Promise<TierWithCaps | null> {
  const supabase = await createClient();
  const { data: tierId } = await supabase.rpc("my_effective_tier_id");
  if (!tierId) return null;
  const { data } = await supabase
    .from("sponsor_tiers")
    .select("*, capabilities:sponsor_tier_capabilities(capability, value)")
    .eq("id", tierId)
    .single();
  return (data as TierWithCaps) ?? null;
}

/** The cheapest active tier granting a capability — what an upsell should name. */
export function lowestTierWith(tiers: TierWithCaps[], cap: Capability): TierWithCaps | null {
  return tiers.filter((t) => t.is_active && can(t, cap)).sort((a, b) => a.rank - b.rank)[0] ?? null;
}
```

In `lib/types.ts`, remove `is_sponsor` from `Company` and add:

```ts
sponsor_tier_id: string;
grace_tier_id: string | null;
tier_grace_until: string | null;
```

- [ ] **Step 2: Verify the drift test now passes**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test -- capability-drift
```

Expected: PASS.

- [ ] **Step 3: Fix the is_sponsor read sites**

`tsc` catches the `.tsx` reads but **not** `app/(admin)/admin/companies/page.tsx:11` (a `.select("*")` cast) or `app/(member)/feed/page.tsx:41` (`is_sponsor` inside a select string). Both must be fixed by hand or the feed's company dropdown goes empty at runtime.

- `app/(member)/feed/page.tsx:41` — change `.select("id, name, is_sponsor")` to `.select("id, name, sponsor_tier_id, sponsor_tiers(key, name, rank)")`.
- `app/(member)/feed/page.tsx:47` — the `?sponsor=1` filter becomes `list.filter((p) => (p.companies?.sponsor_tiers?.rank ?? 0) > 0)`. Add a real "Sponsors only" checkbox to the filter form at `:58`, which never existed.
- `components/PostCard.tsx:15` and `app/(member)/feed/[id]/page.tsx:66` — render the tier name via `TierBadge` (Task 5).

- [ ] **Step 4: Verify and commit**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm run lint
~/.nvm/versions/node/v20.20.2/bin/npm run build
~/.nvm/versions/node/v20.20.2/bin/npm test
```

```bash
git add lib/tiers.ts lib/types.ts "app/(member)/feed" components/PostCard.tsx tests/
git commit -m "feat: read-through tier layer, remove is_sponsor from the app"
```

---

### Task 5: Locked-state components

**Files:**
- Create: `components/TierBadge.tsx`, `components/LockedCard.tsx`, `components/LockedAction.tsx`

**Interfaces:**
- Consumes: `lib/tiers.ts`.
- Produces: three components used by Tasks 6–8.

- [ ] **Step 1: Write them**

`components/TierBadge.tsx`:

```tsx
import type { Tier } from "@/lib/tiers";

export default function TierBadge({ tier }: { tier: Pick<Tier, "name" | "rank"> | null }) {
  if (!tier || tier.rank === 0) return null;
  return (
    <span className="rounded border border-blue-light/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blue-light">
      {tier.name}
    </span>
  );
}
```

`components/LockedCard.tsx` — the rule is **locked is visible, disabled, and explained**, never hidden:

```tsx
import type { Capability, TierWithCaps } from "@/lib/tiers";
import { can, lowestTierWith } from "@/lib/tiers";
import type { ReactNode } from "react";

export default function LockedCard({
  capability, tier, tiers, title, description, children,
}: {
  capability: Capability;
  tier: TierWithCaps | null;
  tiers: TierWithCaps[];
  title: string;
  description: string;
  children: ReactNode;
}) {
  if (can(tier, capability)) return <>{children}</>;

  const needed = lowestTierWith(tiers, capability);

  return (
    <section className="rounded border border-white/10 bg-white/[0.02] p-6">
      <h2 className="font-heading text-lg font-bold text-white/70">{title}</h2>
      <p className="mt-2 text-sm text-white/60">{description}</p>
      <p className="mt-4 text-xs uppercase tracking-wider text-blue-light">
        {needed ? `Included from ${needed.name}` : "Not currently available"}
      </p>
      <a
        href="mailto:sponsors@quantt.ca?subject=QUANTT%20sponsorship"
        className="mt-4 inline-block rounded border border-blue-light/40 px-4 py-2 text-xs uppercase tracking-wider text-blue-light"
      >
        Talk to QUANTT
      </a>
    </section>
  );
}
```

`components/LockedAction.tsx` — a disabled control with a **visible** caption, never a hover-only tooltip:

```tsx
import type { Capability, TierWithCaps } from "@/lib/tiers";
import { can, lowestTierWith } from "@/lib/tiers";
import type { ReactNode } from "react";

export default function LockedAction({
  capability, tier, tiers, children,
}: {
  capability: Capability;
  tier: TierWithCaps | null;
  tiers: TierWithCaps[];
  children: ReactNode;
}) {
  if (can(tier, capability)) return <>{children}</>;
  const needed = lowestTierWith(tiers, capability);
  return (
    <div>
      <button
        disabled
        aria-disabled="true"
        className="rounded bg-white/10 px-5 py-2.5 text-xs uppercase tracking-wider text-white/40"
      >
        {typeof children === "string" ? children : "Unavailable"}
      </button>
      {needed && (
        <p className="mt-2 text-xs text-white/50">Included from {needed.name}.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify and commit**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm run build
git add components/TierBadge.tsx components/LockedCard.tsx components/LockedAction.tsx
git commit -m "feat: tier badge and locked-state components"
```

---

### Task 6: Admin tier editor

The core of "customizable". Two screens: a tier list with create/edit, and a capability matrix.

**Files:**
- Create: `app/(admin)/admin/tiers/page.tsx`
- Create: `lib/actions/tiers.ts`
- Modify: `components/AdminNav.tsx`
- Test: `tests/rls/tier-admin.test.ts`

**Interfaces:**
- Consumes: `lib/tiers.ts`, `denyRedirect` (Phase 0 Task 3).
- Produces: server actions `createTier`, `updateTier`, `deactivateTier`, `setTierCapability`.

- [ ] **Step 1: Write the actions**

Create `lib/actions/tiers.ts`. **Every one uses the user-scoped client** — `createAdminClient()` would silently no-op against the `is_admin()` trigger.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { denyRedirect } from "./deny";
import { CAPABILITIES, type Capability } from "@/lib/tiers";

async function requireAdmin() {
  const profile = await requireProfile();
  if (!profile.is_admin) denyRedirect("/feed", "Admins only.");
  return profile;
}

export async function createTier(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const rank = Number(formData.get("rank"));
  const priceDollars = String(formData.get("price") ?? "").trim();

  if (!name) denyRedirect("/admin/tiers", "A tier needs a name.");
  if (!Number.isInteger(rank) || rank < 1) {
    denyRedirect("/admin/tiers", "Rank must be a whole number of 1 or more. Rank 0 is reserved.");
  }

  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { data, error } = await supabase
    .from("sponsor_tiers")
    .insert({
      key,
      name,
      rank,
      price_cents: priceDollars ? Math.round(Number(priceDollars) * 100) : null,
      blurb: String(formData.get("blurb") ?? "").trim(),
    })
    .select("id")
    .single();

  if (error?.code === "23505") denyRedirect("/admin/tiers", `A tier called ${name} already exists.`);
  if (error) throw new Error(error.message);

  await supabase.from("sponsor_tier_events").insert({
    kind: "tier_created", tier_id: data.id, actor_id: profile.id,
    detail: { name, rank },
  });

  revalidatePath("/admin/tiers");
}

export async function updateTier(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const id = String(formData.get("tier_id"));
  const priceDollars = String(formData.get("price") ?? "").trim();

  const patch = {
    name: String(formData.get("name") ?? "").trim(),
    rank: Number(formData.get("rank")),
    price_cents: priceDollars ? Math.round(Number(priceDollars) * 100) : null,
    blurb: String(formData.get("blurb") ?? "").trim(),
  };

  const { data, error } = await supabase
    .from("sponsor_tiers").update(patch).eq("id", id).select("id");

  if (error) denyRedirect("/admin/tiers", error.message);
  if (!data?.length) denyRedirect("/admin/tiers", "That tier could not be updated.");

  await supabase.from("sponsor_tier_events").insert({
    kind: "tier_updated", tier_id: id, actor_id: profile.id, detail: patch,
  });

  revalidatePath("/admin/tiers");
}

export async function deactivateTier(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const id = String(formData.get("tier_id"));

  const { count } = await supabase
    .from("companies").select("id", { count: "exact", head: true }).eq("sponsor_tier_id", id);

  if (count && count > 0) {
    denyRedirect("/admin/tiers",
      `${count} ${count === 1 ? "firm is" : "firms are"} on that tier. Move them first.`);
  }

  const { error } = await supabase
    .from("sponsor_tiers").update({ is_active: false }).eq("id", id);
  if (error) denyRedirect("/admin/tiers", error.message);

  await supabase.from("sponsor_tier_events").insert({
    kind: "tier_deactivated", tier_id: id, actor_id: profile.id,
  });

  revalidatePath("/admin/tiers");
}

export async function setTierCapability(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const tierId = String(formData.get("tier_id"));
  const capability = String(formData.get("capability")) as Capability;
  const granted = formData.get("granted") === "true";
  const raw = String(formData.get("value") ?? "").trim();

  if (!CAPABILITIES.includes(capability)) {
    denyRedirect("/admin/tiers", "That is not a capability this platform enforces.");
  }

  if (granted) {
    const { error } = await supabase
      .from("sponsor_tier_capabilities")
      .upsert({ tier_id: tierId, capability, value: raw === "" ? null : Number(raw) });
    if (error) denyRedirect("/admin/tiers", error.message);
  } else {
    const { error } = await supabase
      .from("sponsor_tier_capabilities")
      .delete().eq("tier_id", tierId).eq("capability", capability);
    if (error) denyRedirect("/admin/tiers", error.message);
  }

  await supabase.from("sponsor_tier_events").insert({
    kind: granted ? "capability_granted" : "capability_revoked",
    tier_id: tierId, actor_id: profile.id,
    detail: { capability, value: raw || null },
  });

  revalidatePath("/admin/tiers");
}
```

- [ ] **Step 2: Write the page**

Create `app/(admin)/admin/tiers/page.tsx`. It renders the tier list, a create form, and a capability matrix of tiers (columns) against capabilities (rows). Each cell is a small form posting `setTierCapability`, so no client-side state is needed.

Requirements the page must meet, from spec §5:

- Capability rows come from `sponsor_capabilities`, so the UI can only offer what the code enforces. Show each capability's `description` beside its `label` — the exec setting this needs to know what they are selling.
- `kind = 'quota'` and `'hours'` capabilities render a number input beside the checkbox; `'boolean'` renders the checkbox alone.
- Show a **non-blocking** warning above the matrix when the grants are non-monotonic — a lower-ranked tier granting something a higher-ranked one does not. Compute it in the page:

```tsx
const warnings: string[] = [];
for (const cap of capabilities) {
  const granting = tiers.filter((t) => t.is_active && can(t, cap.key as Capability));
  const highestWithout = tiers
    .filter((t) => t.is_active && t.rank > 0 && !can(t, cap.key as Capability))
    .sort((a, b) => b.rank - a.rank)[0];
  const lowestWith = granting.sort((a, b) => a.rank - b.rank)[0];
  if (highestWithout && lowestWith && highestWithout.rank > lowestWith.rank) {
    warnings.push(
      `${highestWithout.name} does not include "${cap.label}" but the lower ${lowestWith.name} does.`,
    );
  }
}
```

- Beside each granted cell, show how many firms currently hold that tier, so revoking is an informed act.
- Show the last ten `sponsor_tier_events` rows below the matrix as a plain audit list.

Add `{ href: "/admin/tiers", label: "Tiers" }` to `components/AdminNav.tsx`.

- [ ] **Step 3: Write the test**

Create `tests/rls/tier-admin.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, resetDb, seedMember } from "../helpers/db";

describe("admin tier editing", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("an admin can grant a capability and it takes effect in RLS immediately", async () => {
    await seedMember("admin@test.dev", { isAdmin: true });
    const admin = await asUser("admin@test.dev");
    const { data: tier } = await asService()
      .from("sponsor_tiers").select("id").eq("key", "supporter").single();

    const { error } = await admin.from("sponsor_tier_capabilities").insert({
      tier_id: tier!.id, capability: "candidate_search", value: null,
    });

    expect(error).toBeNull();
  });

  it("a non-admin member cannot grant capabilities", async () => {
    await seedMember("member@test.dev");
    const member = await asUser("member@test.dev");
    const { data: tier } = await asService()
      .from("sponsor_tiers").select("id").eq("key", "supporter").single();

    const { error } = await member.from("sponsor_tier_capabilities").insert({
      tier_id: tier!.id, capability: "candidate_search", value: null,
    });

    expect(error?.code).toBe("42501");
  });

  it("moving a capability to a lower tier changes enforcement with no deploy", async () => {
    const { seedCompany, seedCompanyUser } = await import("../helpers/db");
    const { setTier } = await import("../helpers/tiers");
    const acme = await seedCompany("Acme Capital");
    await setTier(acme, "supporter");
    const authorId = await seedCompanyUser("recruiter@acme.dev", acme);

    const before = await (await asUser("recruiter@acme.dev"))
      .rpc("my_capability", { cap: "post_event" });
    expect(before.data).toBe(false);

    const { data: tier } = await asService()
      .from("sponsor_tiers").select("id").eq("key", "supporter").single();
    await asService().from("sponsor_tier_capabilities")
      .insert({ tier_id: tier!.id, capability: "post_event", value: null });

    const after = await (await asUser("recruiter@acme.dev"))
      .rpc("my_capability", { cap: "post_event" });
    expect(after.data).toBe(true);

    const post = await (await asUser("recruiter@acme.dev")).from("posts").insert({
      author_id: authorId, company_id: acme, kind: "event", title: "Info session",
    });
    expect(post.error).toBeNull();
  });
});
```

- [ ] **Step 4: Verify and commit**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test -- tier-admin
~/.nvm/versions/node/v20.20.2/bin/npm run build
git add "app/(admin)/admin/tiers" lib/actions/tiers.ts components/AdminNav.tsx tests/rls/tier-admin.test.ts
git commit -m "feat: admin tier editor with capability matrix and audit trail"
```

---

### Task 7: Assign tiers to companies, and replace the invite checkboxes

Spec §6: company creation must **require** a tier choice. `InviteForm.tsx:100` and `admin/requests/page.tsx:38` are the two `is_sponsor` checkboxes that set sponsorship at creation time — with `is_sponsor` gone, a firm approved through `/join` would silently get the fallback tier.

**Files:**
- Modify: `app/(admin)/admin/companies/page.tsx`
- Modify: `lib/actions/admin.ts`
- Modify: `components/InviteForm.tsx`
- Modify: `app/(admin)/admin/requests/page.tsx`

**Interfaces:**
- Consumes: `lib/tiers.ts`, `lib/actions/tiers.ts`.
- Produces: server action `setCompanyTier`.

- [ ] **Step 1: Replace toggleSponsor**

In `lib/actions/admin.ts`, delete `toggleSponsor` and add `setCompanyTier`, again on the user-scoped client:

```ts
export async function setCompanyTier(formData: FormData) {
  const profile = await requireProfile();
  if (!profile.is_admin) denyRedirect("/feed", "Admins only.");
  const supabase = await createClient();

  const companyId = String(formData.get("company_id"));
  const tierId = String(formData.get("sponsor_tier_id"));

  const { data: before } = await supabase
    .from("companies").select("sponsor_tier_id, name").eq("id", companyId).single();

  const { data, error } = await supabase
    .from("companies").update({ sponsor_tier_id: tierId }).eq("id", companyId).select("id");

  if (error) denyRedirect("/admin/companies", error.message);
  if (!data?.length) denyRedirect("/admin/companies", "That firm could not be updated.");

  await supabase.from("sponsor_tier_events").insert({
    kind: "company_assigned", company_id: companyId, tier_id: tierId, actor_id: profile.id,
    detail: { from: before?.sponsor_tier_id ?? null, to: tierId },
  });

  revalidatePath("/admin/companies");
}
```

- [ ] **Step 2: Update the companies page**

In `app/(admin)/admin/companies/page.tsx`, replace the hidden-input toggle at `:42-46` with a tier `<select>` populated from `loadTiers()`, plus, for each firm, the count of open in-app jobs so a downgrade is an informed act:

```tsx
<form action={setCompanyTier} className="flex items-center gap-2">
  <input type="hidden" name="company_id" value={c.id} />
  <select name="sponsor_tier_id" defaultValue={c.sponsor_tier_id}
          className="rounded px-2 py-1 text-xs">
    {tiers.filter((t) => t.is_active).map((t) => (
      <option key={t.id} value={t.id}>{t.name}</option>
    ))}
  </select>
  <button type="submit" className="text-xs uppercase tracking-wider text-blue-light">
    Save
  </button>
</form>
```

Also replace the `{c.is_sponsor ? "sponsor" : "firm"}` label at `:37` with the tier name, and show `tier_grace_until` as "grandfathered until <date>" while it is in the future.

- [ ] **Step 3: Make the tier required at creation**

In `components/InviteForm.tsx`, replace the checkbox at `:99-102` with a required tier select inside the `kind === "company"` block:

```tsx
<Field label="Sponsorship tier">
  <select name="sponsor_tier_id" required className="w-full rounded px-3 py-2 text-sm">
    <option value="">Choose a tier</option>
    {tiers.filter((t) => t.is_active).map((t) => (
      <option key={t.id} value={t.id}>{t.name}</option>
    ))}
  </select>
  <p className="mt-1 text-xs text-white/60">
    Every firm needs a tier. Choose &ldquo;Not sponsoring&rdquo; if they have not
    signed yet — they can still post announcements and external listings.
  </p>
</Field>
```

Do the same at `app/(admin)/admin/requests/page.tsx:38`.

In `lib/actions/admin.ts`, both company-creating paths (`:193` in `invitePerson`, `:269` in `reviewJoinRequest`) must read `sponsor_tier_id` from the form instead of `is_sponsor`, and reject a missing value:

```ts
const tierId = String(formData.get("sponsor_tier_id") ?? "").trim();
if (!tierId) {
  denyRedirect("/admin/invite", "Choose a sponsorship tier for this firm.");
}
```

> These two inserts use `createAdminClient()`. That is fine — the protect
> trigger is `before update` only, so inserts are unaffected. Do not change
> them to the user client without re-checking `handle_new_user`.

**Known gap:** the sponsor checkbox is currently ignored entirely when an admin picks an *existing* company (the `is_sponsor` read sits inside `if (!companyId && newName)`). Preserve that behaviour deliberately — an existing firm's tier is changed on `/admin/companies`, not by inviting another contact. Hide the tier select when an existing company is selected.

- [ ] **Step 4: Verify and commit**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm run lint && ~/.nvm/versions/node/v20.20.2/bin/npm run build && ~/.nvm/versions/node/v20.20.2/bin/npm test
grep -rn "toggleSponsor\|is_sponsor" --include=*.ts --include=*.tsx . | grep -v node_modules
```

Expected: builds clean, and the grep returns nothing.

```bash
git add "app/(admin)" lib/actions/admin.ts components/InviteForm.tsx
git commit -m "feat: assign tiers to companies, require a tier at firm creation"
```

---

### Task 8: Company-facing sponsorship page and shadow mode

**Files:**
- Create: `app/(company)/company/sponsorship/page.tsx`
- Modify: `app/(company)/layout.tsx`
- Modify: `components/HubNav.tsx`
- Modify: `app/(company)/company/posts/new/page.tsx`
- Modify: `app/(company)/company/applicants/page.tsx`

**Interfaces:**
- Consumes: `loadMyTier`, `loadTiers`, `LockedCard`, `LockedAction`, `TierBadge`.
- Produces: nothing importable.

- [ ] **Step 1: Load the tier once, at the layout**

In `app/(company)/layout.tsx`, after the existing `company_users` lookup, call `loadMyTier()` and pass the result to `HubNav`. Render a banner when `tier_grace_until` is in the future:

```tsx
{graceUntil && (
  <div className="border-b border-blue-light/30 bg-blue-light/10 px-5 py-3 text-center text-xs text-white/80">
    Your access is grandfathered until {formatDate(graceUntil)}. From then, your{" "}
    {tier?.name} tier applies. <a href="/company/sponsorship" className="underline">See what changes</a>.
  </div>
)}
```

- [ ] **Step 2: Build the sponsorship page**

`app/(company)/company/sponsorship/page.tsx` lists, from data:

- the firm's current tier name, price, and blurb, with `TierBadge`;
- every capability the tier grants, using `sponsor_capabilities.label` and `description`;
- every capability it does **not** grant, with the name of the cheapest tier that does, via `lowestTierWith`;
- the grace window and what changes when it ends.

This is the page the spec says does more for renewals than every lock — a firm's only current source of truth about what it bought is what the UI happens not to grey out.

- [ ] **Step 3: Gate the company surfaces**

- `app/(company)/company/posts/new/page.tsx` is currently a static component with a hardcoded `kinds` array. Make it `async`, load the tier, and derive `kinds`: always include `announcement` and `job_link`; include `event` when `can(tier, "post_event")`; include `job` always (the in-app/external distinction is the URL field, which Phase 0 Task 4 made explicit). When the firm lacks `post_in_app_job`, render a `LockedCard` above the form explaining that jobs will link out.
- `app/(company)/company/applicants/page.tsx` — wrap the list in `LockedCard` for `read_applicants` rather than rendering an empty list, and when the tier has an embargo, show "New applications appear after N hours at your tier."
- `app/(company)/company/posts/[id]/page.tsx` — wrap the Message button in `LockedAction` for `dm_initiate_applicant`.

- [ ] **Step 4: Turn shadow mode on**

Shadow mode is the whole safety property: the UI gates on the real tier while RLS still permits everything, for the length of the grace window. Because `my_effective_tier_id()` returns the *grace* tier while grace is open, RLS is already permissive — and `loadMyTier()` returns that same permissive tier, which would defeat the shadow.

Add a second loader for display, which reports the *assigned* tier rather than the effective one:

```ts
/** The tier that WILL apply once grace ends. Used for shadow-mode display. */
export async function loadMyAssignedTier(): Promise<TierWithCaps | null> {
  const supabase = await createClient();
  const { data: cu } = await supabase
    .from("company_users")
    .select("companies(sponsor_tier_id)")
    .eq("profile_id", (await requireProfile()).id)
    .maybeSingle();
  // ...load that tier with capabilities
}
```

Every `LockedCard` and `LockedAction` on company surfaces takes the **assigned** tier, so firms see their future state, while RLS keeps permitting the present one. Enforcement then needs no code change — it happens when `tier_grace_until` passes.

- [ ] **Step 5: Verify and commit**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm run build && ~/.nvm/versions/node/v20.20.2/bin/npm test
```

Manually: sign in as a company user on the `supporter` tier with grace open. Confirm `/company/posts/new` shows the locked explanation, that submitting an in-app job still succeeds (grace), and that `/company/sponsorship` names Partner as the tier that unlocks it.

```bash
git add "app/(company)" components/HubNav.tsx lib/tiers.ts
git commit -m "feat: company sponsorship page and shadow-mode gating"
```

---

### Task 9: Downgrade safety and expiry warnings

**Files:**
- Create: `supabase/migrations/0008_downgrade_safety.sql`
- Modify: `app/(member)/feed/page.tsx`
- Create: `app/api/cron/tier-expiry/route.ts`

**Interfaces:**
- Consumes: `notify()` (Phase 0 Task 8 — **required**; without SMTP this task ships silently broken).
- Produces: nothing importable.

- [ ] **Step 1: Stop members applying into black holes**

Spec §8: a downgraded firm's in-app posts stay live and keep accepting applications it cannot read. Extend `applications_member_insert` so applying requires the post's company to still hold `read_applicants`:

```sql
create or replace function public.post_company_can_receive(p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    join public.companies c on c.id = p.company_id
    join public.sponsor_tier_capabilities tc
      on tc.tier_id = case
           when c.tier_grace_until is not null and c.tier_grace_until >= current_date
           then c.grace_tier_id else c.sponsor_tier_id end
    where p.id = p_post and tc.capability = 'read_applicants'
  )
$$;
revoke execute on function public.post_company_can_receive(uuid) from public, anon;
grant  execute on function public.post_company_can_receive(uuid) to authenticated;

drop policy if exists applications_member_insert on public.applications;
create policy applications_member_insert on public.applications
  for insert to authenticated with check (
    member_id = auth.uid() and public.is_member()
    and (kind = 'off_platform' or public.post_company_can_receive(post_id))
  );
```

- [ ] **Step 2: Take closed posts off the feed**

`app/(member)/feed/page.tsx:18-35` has no `status` filter, so closed jobs stay listed and keep getting clicked. Add `.neq("status", "closed")` to the query, and a "Show closed" toggle in the filter form for members who want history.

- [ ] **Step 3: Expiry warnings**

Create `app/api/cron/tier-expiry/route.ts`, a route that finds companies whose `tier_grace_until` is 30, 7, or 1 days out and emails their company users via `notify()`, plus a digest to admins. Guard it with a shared secret in the `Authorization` header, checked against `CRON_SECRET`. Schedule it daily.

- [ ] **Step 4: Verify and commit**

Add a test asserting a member cannot apply to a post whose company lost `read_applicants`, and that off-platform logging still works for such a post.

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test
git add supabase/migrations/0008_downgrade_safety.sql "app/(member)/feed/page.tsx" app/api/cron/tier-expiry tests/
git commit -m "feat: downgrade safety, close the apply black hole, expiry warnings"
```

---

## Self-review

**Spec coverage.** §4 ladder → Tasks 1 (seed) and 3 (enforcement). §5 data model and customization → Tasks 1, 2, 6. §5 guardrails → Task 6 step 2 (reference-table-only capabilities, monotonicity warning, affected-firm counts, audit, user-scoped client). §6 lifecycle → Tasks 7 (required tier at creation) and 9 (expiry warnings); the `company_sponsorships` commercial table is **deferred** — see the gap below. §7 shadow mode → Task 8 step 4. §8 migration ordering → Task 2 step 1, with the hazard proven in step 5. §8 status-only path → Task 3. §8 downgrade → Task 9. §9 type safety → Task 4 step 3.

**Gap, deliberate.** The spec's `company_sponsorships` table (amount paid, invoice reference, dates, Class C commitments) is not in this plan. It is bookkeeping with no enforcement role, and folding it in would grow an already large plan. `sponsor_tier_events` covers the audit requirement, which was the security-relevant half. Track the commercial record as a follow-up before the first renewal cycle.

**Gap, external.** Task 9 step 3 needs a scheduler and `CRON_SECRET`, and Phase 0 Task 8 (SMTP) must be complete or the warnings send nothing.

**Type consistency.** `my_capability(cap text)`, `my_capability_value(cap text)`, `my_effective_tier_id()` are defined in Task 2 and used with those signatures in Tasks 3, 6, 8, 9. `CAPABILITIES`, `Capability`, `TierWithCaps`, `can`, `capValue`, `lowestTierWith`, `loadTiers`, `loadMyTier` are defined in Task 4 and consumed in Tasks 5–8; `loadMyAssignedTier` is added in Task 8 step 4. Capability key strings are identical between the Task 1 seed, the Task 4 constant, and the Task 3 policies — Task 3 step 4 adds a test that fails if they drift.

**Risk to watch during execution.** Task 3's `posts_status_only` trigger is the most intricate piece here: it must let an entitled firm edit freely, let a downgraded firm change only `status`, and never fire for admins. If it proves awkward in practice, the simpler fallback is a dedicated `close_post` RPC (security definer, verifies company ownership, sets `status='closed'` only) and no second update policy at all.
