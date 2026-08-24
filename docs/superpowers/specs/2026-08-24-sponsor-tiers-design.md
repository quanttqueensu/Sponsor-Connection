# Sponsor Tiers — Design

Date: 2026-08-24
Status: Revised after review. Two decisions still open (§10).

Revision note: an earlier draft of this document proposed gating eight
capabilities at once, deferred the resume book to a final phase, and applied
the migration as a single atomic flip. Review found that design would strip
capability from firms that had paid for it, make the $10,000 tier
indistinguishable from the $5,000 tier, leak internal commercial notes to
students, and silently revert its own backfill. This revision is substantially
smaller and is sequenced to fail safe.

## 1. Problem

QUANTT sells four sponsorship packages. The hub models sponsorship as a single
boolean, `companies.is_sponsor`, which grants nothing at all. This specifies
replacing it with a tier that gates real capability, enforced in row level
security, without harming the students the platform exists to serve.

### The packages

| Tier | Price | Promised |
| --- | --- | --- |
| Principal | $10,000 | Priority platform access with customized candidate searches; early access to the resume book and letters of recommendation; dedicated recruiting coordination; exclusive Firm Day; conference title sponsorship with speaking and judging; premier brand visibility |
| Leader | $5,000 | Platform access with candidate search by program, year, and skills; resume book access; dedicated Firm Day; opportunity to host a workshop or speaker session; prominent brand visibility |
| Partner | $2,000 | Resume book access; platform account with job posting privileges; participation in QUANTT industry events; conference recognition; brand visibility in select communications |
| Supporter | $500 | Basic platform access; access to the opt-in member resume book; logo placement on the QUANTT website |

Logo placement on the public website belongs to the separate `quantt-website`
project. Note that the *in-hub* half of "brand visibility across digital
channels" is also unbuilt: `companies.logo_url` exists in the schema and in
`lib/types.ts:57` and is rendered nowhere in the application.

### Promise classes

**Class A — enforceable against what exists.** Job posting privileges, the
applicant pipeline, messaging, priority of applicant visibility.

**Class B — enforceable, not built.** Resume book, candidate search, letters of
recommendation.

**Class C — off-platform.** Firm Days, conference speaking, workshops,
recruiting coordination, brand visibility.

## 2. Verified findings

All citations verified against the working tree on 2026-08-24. Note that
`supabase/migrations/0001_init.sql` has been edited after later migrations were
written (`0002_grant_rls_helpers.sql` re-grants what `0001:713-718` already
grants), so line numbers in this file are not immutable history.

### 2.1 Sponsorship gates nothing today

`is_sponsor` occurs 16 times across 10 files. No RLS policy, index, view, or
constraint references it — the schema contains no views at all. Its only
effects are a badge (`components/PostCard.tsx:15`,
`app/(member)/feed/[id]/page.tsx:66`) and a feed filter that no form control
can reach (`app/(member)/feed/page.tsx:46-47`).

Every company user today can post jobs, read applicants, move stages, and
message applicants. **This work introduces the first per-company capability
boundary the platform has ever had.** Every gate is therefore a *removal* from
someone, which drives the rollout design in §7.

### 2.2 The platform cannot say no

- RLS denial is silent: a filtered-out `UPDATE` returns `error: null` with zero
  rows. `closePost` (`lib/actions/posts.ts:67`) and `updateApplicationStage`
  (`lib/actions/applications.ts:109`) report success when the database refuses.
  (`setDefaultPackage` and `deletePackage` are already owner-scoped, so they are
  silent only for a bogus id, not for a denial.)
- `app/` contains no `error.tsx`, `loading.tsx`, or `not-found.tsx` at any
  level. Every thrown server action becomes a generic crash page.
- Middleware redirects give no reason (`middleware.ts:41-119`).
- The UI has no `disabled` state, lock affordance, or upsell copy anywhere.

### 2.3 Gating INSERT alone is bypassable

`posts_company_update` (`0001_init.sql:548`) has no `kind` check in either
clause, while `posts_company_insert` (`:541`) does. A company can insert a
permitted `announcement` and update it to `kind='connection'`. There is no
trigger on `posts` to stop it. The update policy also omits `author_id` from
its `WITH CHECK`, so a company user can reassign authorship of its own posts.

### 2.4 The gate predicate is not `kind`

`in_app_job_fields` (`:128`) permits `kind='job'` *with* an `external_url`. A
ladder written on `kind` alone is bypassed by inserting `kind='job'` with a URL
and then nulling the URL — the kind never changes.

The correct predicate already exists: `public.is_in_app_job(posts)`
(`0001_init.sql:232`) is `kind='job' and external_url is null and status='open'
and published`, is `immutable`, and is already granted to `authenticated`. Its
TypeScript twin is `isInAppJob()` in `lib/types.ts`, used by `PostCard.tsx:7`.
Reuse both rather than writing a fourth copy of the predicate.

### 2.5 The protect trigger reverts under every non-user session

`companies_protect_admin_fields()` (`0001_init.sql:315`) reverts when
`not public.is_admin()`, and `is_admin()` (`:202`) resolves through
`auth.uid()`. Under the service-role client, the Supabase SQL editor, `psql`,
and **any migration**, `auth.uid()` is NULL, so `is_admin()` is false and the
trigger reverts.

Two consequences:

1. **A backfill `UPDATE` in the migration would be silently reverted** the
   moment `sponsor_tier` joins the revert list. §8 orders around this
   explicitly; see the warning there.
2. The admin tier editor must use the user-scoped client
   (`lib/supabase/server.ts`). Written with `createAdminClient()` it returns
   `200 OK` and changes nothing. `admin.ts:193` and `:269` already use the
   admin client for company writes, so this is a live trap.

The trigger must also `raise exception` rather than revert for the tier
columns. §2.2's whole thesis is that this platform fails silently; propagating
that pattern into a revenue-bearing field is not acceptable.

### 2.6 New tables need their own GRANT

`0001_init.sql:702` grants on all tables as a one-time snapshot; there is no
`ALTER DEFAULT PRIVILEGES`. Any new table needs its own `GRANT`. Adding
*columns* to `companies` needs none — column privileges inherit.

### 2.7 Authentication stays on Supabase

Migrating to Clerk was evaluated and rejected. `auth.uid()` casts the JWT `sub`
to `uuid`; Clerk subjects are not UUIDs. All 51 policies would need rewriting —
23 reference `auth.uid()` directly (6 of those in storage, parsing the UUID out
of the object path), and 37 reach it through the five security-definer helpers.

More importantly `handle_new_user()` (`0001_init.sql:351`) raises
`'Invite required'` inside the signup transaction, making the platform
invite-only at the database level. Clerk does not synchronize users into
`auth.users`, so this becomes an async webhook and a Clerk user could exist
with no profile. (Precision: this control binds the *anon and authenticated*
paths. A leaked service-role key could insert an invite row first, so it is a
sequencing control, not a service-role-proof one.)

What Clerk offers here is thin: tenancy rules live in RLS as domain logic and
would be modelled twice, the login page is deliberately branded, and Supabase
does TOTP natively.

The one real pain is invite email. `createUserWithoutEmail`
(`lib/actions/admin.ts:67`) exists because Supabase's built-in SMTP allows
about two messages an hour, so invites rate-limit and an admin relays a
plaintext password by hand from `ManualInviteBanner`. **This is a configuration
problem, and it is now a blocker for tiers** — see §7.

## 3. Principles

Three decisions constrain everything below.

**The mission outranks the revenue.** QUANTT exists so students get quant jobs.
Every gate reduces the firms putting jobs in front of students. A firm willing
to post an internship link for free is pure student value at zero cost to the
club. Therefore **rank 0 keeps announcements, external job links, and the
ability to reply to a member's message.** The first paid gate sits where QUANTT
actually incurs cost and the firm gets real value: in-app applications.

**Gate one thing, well.** Every additional gate multiplies the downgrade blast
radius and the operational burden, for no additional revenue — sponsorships are
annual, pre-negotiated, and there is no payment path in this codebase, so a
lock cannot convert a recruiter into a purchase. This design enforces **one**
boundary and adds a second only after evidence.

**Fail safe, not diligent.** QUANTT is run by volunteers with annual turnover.
Any design step that reads "an admin will remember to…" will not happen. Where
the design needs a periodic action, it must be date-driven and default to the
permissive outcome.

## 4. Capability ladder

**This table is the seeded default, not a fixed structure.** Per §5, tiers and
their capability grants are admin-editable data. What follows is what the
migration seeds so the platform starts in a sane, deck-faithful state; QUANTT
can change any of it without a developer. The rows marked "not built" are
capabilities that do not exist yet and therefore cannot be granted to anything.

Rank in parentheses. Enforced rows are the only ones RLS implements.

| Capability | none (0) | Supporter (1) | Partner (2) | Leader (3) | Principal (4) | Status |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Account, dashboard, edit own profile | ✓ | ✓ | ✓ | ✓ | ✓ | unchanged |
| Post `announcement` | ✓ | ✓ | ✓ | ✓ | ✓ | ungated (mission) |
| Post external listing | ✓ | ✓ | ✓ | ✓ | ✓ | ungated (mission) |
| Reply in a member-initiated thread | ✓ | ✓ | ✓ | ✓ | ✓ | ungated (no mute firms) |
| See and close own posts | ✓ | ✓ | ✓ | ✓ | ✓ | ungated (§8, status-only path) |
| **In-app `job` accepting applications** | — | 1 open | ✓ | ✓ | ✓ | **the enforced gate** |
| Read applicants, move stages | — | ✓ | ✓ | ✓ | ✓ | follows the post |
| Applicant visibility delay | — | 72h | 72h | 24h | none | **the Principal gate** |
| Initiate a thread with own applicant | — | ✓ | ✓ | ✓ | ✓ | unchanged from today |
| Initiate with a non-applicant | — | — | — | ✓ | ✓ | needs search (Phase 3) |
| Resume book | — | ✓ | ✓ | ✓ | ✓ early | Phase 2 |
| Candidate search | — | — | — | ✓ | ✓ | Phase 3 |
| Post `event` | — | — | — | ✓ | ✓ | Phase 3 |
| Firm Day, conference, workshops | — | — | recorded | recorded | recorded | admin table |

### Changes from the first draft, and why

**Supporter gets one open in-app job, not zero.** A cap converts to an upgrade;
a wall reads as "you get nothing." It also keeps $500 buying an actual
recruitment platform, which matters because Supporter's headline deliverable —
the resume book — was previously deferred past the tier gate.

**Applicant visibility delay is how Principal becomes real.** The first draft
admitted Principal had no capability beyond Leader, which is unsellable, and
Phase 1 would have made that equality *visible* on screen. "Priority
recruitment platform access" is written in the deck as a platform feature and
the first draft never classified it. A rank-keyed delay on
`applications.created_at` — a column that already exists — delivers both
"priority access" and "early access" literally. In campus recruiting, first
contact with a strong candidate is the product.

**Direct messaging is not gated on existence.** Stages are named `reviewing`,
`interviewing`, `offer`, and the Message button sits beside the stage dropdown
in `app/(company)/company/posts/[id]/page.tsx`. Gating initiation would let a
firm mark a candidate "offer" and be unable to say so — a product defect sold
as a tier. The Leader line is *scope*: messaging a member who never applied,
which requires candidate search anyway. `conversations_company_insert` already
requires `member_applied_to_company()`, so no firm can cold-message students
today and nothing is being taken away.

**Reply is never gated.** `messages_company` (`0001_init.sql:628`) has no rank
predicate, so a gated firm could read a member's message and be unable to
answer. The member would read silence as rejection. Rank 0 is the default and,
after any year-end lapse, the majority state.

**`event` posting moves to Leader.** "Opportunity to host a workshop or speaker
session" is a Leader promise; Partner's promise is *participation*. The first
draft put a Leader entitlement in the $2,000 tier.

**Applicant reads follow the post, not the tier.** Locking a firm out of
applicants it already received is the highest-outrage, lowest-revenue action
available. If a firm could post the job, it can see who applied.

## 5. Data model

Tiers are **data, not code**. QUANTT's packages change between academic years —
prices move, tiers get added, a deliverable shifts from Partner down to
Supporter — and none of that should require a developer. Admins own tier
definitions and the capability matrix through the admin UI.

### What is and is not customizable

**Customizable by admins:** tier names, display order (rank), price, the blurb
shown to sponsors, whether a tier is active, and — the important one — **which
capabilities each tier grants, and at what quota**.

**Not customizable:** the set of capabilities that exist. A capability is a
code-enforced gate; one that no code enforces is a promise nothing keeps.
`sponsor_capabilities` is a reference table seeded by migration, and
`sponsor_tier_capabilities.capability` is a foreign key into it, so the admin UI
can only offer capabilities that are really enforced. Adding a new capability is
a migration plus the policy that enforces it.

This boundary is the whole safety property. Without it an exec could create a
"Resume book access" capability, tick it for Supporter, and sell something no
code implements.

```sql
create table public.sponsor_capabilities (
  key         text primary key,          -- 'post_in_app_job', 'applicant_embargo_hours', …
  label       text not null,             -- shown in the admin matrix
  description text not null,             -- what it actually does, for the exec
  kind        text not null check (kind in ('boolean', 'quota', 'hours')),
  sort_order  int  not null default 0
);

create table public.sponsor_tiers (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,       -- stable slug; 'none' is reserved
  name       text not null,              -- 'Principal'
  rank       int  not null,              -- ordering; unique among active tiers
  price_cents int,                       -- null for 'none'
  blurb      text not null default '',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sponsor_tier_capabilities (
  tier_id     uuid not null references public.sponsor_tiers (id) on delete cascade,
  capability  text not null references public.sponsor_capabilities (key),
  value       int,                       -- null = unlimited/on; 1 = one open job; 72 = hours
  primary key (tier_id, capability)
);

-- on companies
sponsor_tier_id   uuid references public.sponsor_tiers (id) on delete restrict
grace_tier_id     uuid references public.sponsor_tiers (id) on delete restrict
tier_grace_until  date          -- grandfather window; see §7
```

`on delete restrict` means a tier in use cannot be deleted — deactivate it
instead. The `'none'` tier is seeded, reserved, and not deletable, because it is
the fallback for every company without a sponsorship.

### Capability resolution

```sql
-- The tier actually in force: the assigned tier, or the grace tier while the
-- grandfather window is open and outranks it.
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

-- null means "granted, no limit"; use is_distinct-from-null at the call site.
create or replace function public.my_capability_value(cap text) returns int
language sql stable security definer set search_path = public as $$
  select tc.value from public.sponsor_tier_capabilities tc
  where tc.tier_id = public.my_effective_tier_id() and tc.capability = cap
$$;
```

Policies then read `(select public.my_capability('post_in_app_job'))` rather
than a hardcoded rank comparison, so an admin moving a capability between tiers
changes enforcement immediately with no deploy.

Cost is one extra index probe over the rank-based design — `company_users` by
profile, `companies` by PK, `sponsor_tiers` by PK, `sponsor_tier_capabilities`
by its composite PK. Wrapped as `(select …)` these fold into a single InitPlan
per statement.

### Guardrails on the admin UI

Because these tables now drive enforcement, editing them is editing security
policy. The admin surface must:

- Offer only capabilities present in `sponsor_capabilities`, as checkboxes and
  number inputs — never free text.
- Warn (not block) when the matrix is non-monotonic, i.e. a lower-ranked tier
  grants something a higher-ranked one does not. Non-monotonic ladders are
  occasionally intentional and usually a mistake.
- Refuse to remove a capability from a tier without showing how many companies
  currently hold that tier and what they will lose.
- Write every change to `sponsor_tier_events` (§ audit), because the *rules*
  changing is more consequential than an assignment changing and is exactly the
  institutional memory that does not survive graduation.
- Never be reachable by the service-role client — see §2.5. Trigger-protected
  writes silently no-op under `createAdminClient()`.

Everything commercial lives in a separate admin-only table, because
`companies_member_read` (`0001_init.sql:498`) and `companies_own_read` (`:501`)
both return **all columns**, and `app/(member)/feed/page.tsx:23` selects
`companies(*)`. A `tier_note` column on `companies` would ship internal notes
like "renewal at risk, chasing invoice" to every student's browser in the feed
payload, and to the firm it describes.

```sql
create table public.company_sponsorships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  tier text not null check (tier in (...)),
  started_on date not null,
  expires_on date not null,          -- not nullable: see §6
  amount_paid numeric(10,2),
  invoice_ref text,
  note text,                          -- Class C commitments, internal
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
-- admin-only RLS, plus its own GRANT per §2.6
```

This is append-only and doubles as the audit trail. Tier changes on a
$10,000 field currently overwrite in place with no history, no actor, and no
reason — for an organization with annual turnover, this table is more valuable
than the tier column itself, because it is the only institutional memory that
survives graduation. `companies.sponsor_tier` is the denormalized current value
that RLS reads.

### Rank helpers

```sql
create or replace function public.sponsor_rank(t text) returns int
language sql immutable as $$
  select case t when 'principal' then 4 when 'leader' then 3
                when 'partner' then 2 when 'supporter' then 1 else 0 end
$$;

create or replace function public.my_sponsor_rank() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select greatest(
      public.sponsor_rank(c.sponsor_tier),
      case when c.tier_grace_until >= current_date then 2 else 0 end
    )
    from public.company_users cu
    join public.companies c on c.id = cu.company_id
    where cu.profile_id = auth.uid() and c.status = 'active'
  ), 0)
$$;
```

`immutable` and `stable` are both correct as marked. `coalesce` covers the
empty-subquery case and `sponsor_tier` is `not null`, so there is no NULL hole.

Two behaviour changes worth stating: `my_company_id()` has no `status='active'`
filter, so **inactive companies can post today and will not be able to after
this change**; and `current_date` is evaluated in the database timezone (UTC),
so an expiry lands up to twenty hours early for a Vancouver firm.

Policy calls are wrapped as `(select public.my_sponsor_rank())`, which folds
into an InitPlan. This matters only for the SELECT policies — `WITH CHECK` on
INSERT is evaluated once per row and every write in this app is single-row.
Where a rank check joins an existing subquery, put the rank check **first** so
short-circuit evaluation skips the subquery for rank-0 companies.

## 6. Lifecycle

University sponsorships are annual and lapse simultaneously. If expiry ever
works as designed, every sponsor drops to rank 0 on the same day in September —
during exec turnover, when nobody is watching. The first draft's only defence
was "leave `tier_expires_on` null," which means the feature never works and
firms that stopped paying in 2025 keep Partner capability in 2028.

Therefore:

- `expires_on` is **not nullable** on `company_sponsorships`. A sponsorship
  without an end date is not a sponsorship.
- It defaults to the end of the academic year (31 August), so the common case
  needs no thought.
- Expiry is a **downgrade to rank 1**, not to rank 0. A lapsed sponsor keeps
  announcements, external links, and one open in-app job. Renewal conversations
  happen with a firm that can still see the platform.
- A dated grace period runs past expiry, and expiry warnings go out at 30, 7,
  and 1 days. **This requires outbound email**, which is why custom SMTP is
  sequenced before tiers rather than after (§7).
- Company creation must **require** a tier choice. `InviteForm.tsx:100` and
  `app/(admin)/admin/requests/page.tsx:38` are the two checkboxes that set
  sponsorship at creation time today; the first draft listed them as cosmetic
  reads and dropped `is_sponsor` without replacing them. With `default 'none'`
  every firm approved through the `/join` funnel would get a dead account and
  the exec approving it would not know.

## 7. Phasing

**Phase 0 — Prerequisites (about a week).**

Custom SMTP first. Every safety mechanism in this design — expiry warnings,
downgrade notices, tier-change confirmations — needs outbound mail, and
`lib/notify.ts` is a no-op stub. This also deletes `createUserWithoutEmail`,
`stashManualInvite`, `readManualInvite`, and `ManualInviteBanner`, which
currently put a plaintext password on an admin's screen to relay by hand.

Then the minimum needed to say no legibly:

- `app/error.tsx` and `app/not-found.tsx` — one each, not per route group.
- `denyRedirect()`, extending the `?error=` pattern at `lib/actions/auth.ts:30`.
- `.select()` on `closePost` and `updateApplicationStage`; treat zero rows as an
  error.
- The member resume-book opt-in toggle (§ Phase 2) ships **now**, ahead of the
  feature, so consent accumulates while the rest is built. An empty resume book
  is worse than none.

Three unrelated crashes, fixed because they are live breaches of what Partner
already pays for:

- `PostForm.tsx:51,59,67` label role type, term season, and term year as
  optional with blank defaults; `in_app_job_fields` (`0001_init.sql:128`)
  requires all three. A company fills the form in as labelled and gets a raw
  constraint name on a crash page, on the single most important action in the
  product.
- The off-platform log form (`feed/[id]:102-110`) renders unconditionally while
  the in-app branch checks `existingApp` (`:115`); `applications_one_per_job`
  (`:166`) makes the second click a unique violation.
- "Create a hiring package first" (`feed/[id]:118`) is grey text, not a link, at
  the primary conversion moment.

Explicitly **not** in Phase 0: `loading.tsx` everywhere, `EmptyState` across
nine pages, the `useFormStatus` refactor. Those are good hygiene, unrelated to
tiers, and were bundled into the first draft under a prerequisite argument they
do not deserve. They ship separately on their own merits.

**Phase 1 — Tiers, grandfathered and shadowed (about two weeks).**

1. Migration `0003` (§8), which enforces nothing: every existing company is
   grandfathered to rank 2 for 60 days via `tier_grace_until`.
2. `lib/tiers.ts`, `TierBadge`, `LockedCard`, `LockedAction`, the admin tier
   editor (user-scoped client — §2.5), and `/company/sponsorship` showing the
   firm what it bought, including Class C commitments.
3. **Shadow mode.** The UI gates on the real tier while RLS still permits
   everything, for the full grace window. Every firm sees exactly what it will
   lose, with an explanation and a contact route, and nothing breaks. Every gap
   in the tier assignment list arrives as an email you can fix for free.
4. Enforcement is then a one-line date change, against an assignment list
   corrected by six weeks of real feedback rather than one spreadsheet review.

`TierBadge` on the member feed waits for the migration — it reads tier data
that does not exist until `0003`.

**Phase 2 — Resume book (about a week).** Three of four tiers promise it and it
is Supporter's only hub deliverable, so deferring it means the $500 tier ships
as a worse account than a non-paying firm has. It is also mostly built already:
`hiring_packages_one_default` (`0001_init.sql:49`) already guarantees one
canonical resume per member, `profiles` has `program` and `grad_year`, and the
service-role signed-URL pattern in `ResumeLink` already lets company users read
resumes from the private bucket.

Scope: `profiles.resume_book_opt_in`, one security-definer RPC returning
opted-in members with a default package and returning empty below rank 1 (an
RPC, not a view, keeps the tier check in one place and sidesteps §2.6), a
`/company/resume-book` page with program and grad-year filters, and an embargo
predicate on the opt-in timestamp for Principal's "early access". Out of scope:
skills taxonomy, saved searches, bulk export, letters of recommendation.

**Phase 3 — Only if Phase 1 shows firms actually upgrade.** Candidate search
(needs a skills model and the platform's first company→non-applicant
disclosure, so consent design, not just a policy), `event` posting, non-applicant
messaging, a QUANTT event model for conference recognition, rendering
`logo_url`, and applicant export.

## 8. Migration

`supabase/migrations/0003_sponsor_tiers.sql`, in this order. **The order is
load-bearing.**

1. Add `sponsor_tier` and `tier_grace_until` to `companies`.
2. Create `company_sponsorships` with admin-only RLS **and its own GRANT**
   (§2.6).
3. **Rewrite `companies_protect_admin_fields()` before any data write.** Remove
   the `is_sponsor` line (the column is about to disappear, and plpgsql resolves
   record fields at execution time, so leaving it is a latent `42703`). Add
   `sponsor_tier` and `tier_grace_until`, and `raise exception` rather than
   revert. Add an escape for `auth.uid() is null` so migrations, the service
   role, and the SQL editor can write.

   > Without that escape, step 4 silently reverts every company to `'none'`.
   > The first draft avoided this only because it happened to order the trigger
   > rewrite after the backfill.

4. Grandfather: set every existing company's `tier_grace_until` to
   `current_date + 60`, and `sponsor_tier` from the assignment list where one
   exists. Nobody loses anything.
5. Assert: refuse to complete if any active company with at least one
   `company_users` row would end at rank 0 with no grace. A `raise exception`
   in a `do` block. This converts §10.1 from a hand-wave into something the
   database enforces.
6. Drop `is_sponsor`.
7. Create `sponsor_rank()` and `my_sponsor_rank()`; revoke from `public, anon`;
   grant to `authenticated`. Must precede the policies that call them —
   `create policy` resolves function references at DDL time.
8. Replace the post policies. Each needs `drop policy if exists` then `create
   policy`; there is no `create or replace policy`. Both `USING` and
   `WITH CHECK` carry the same ladder, expressed with **`is_in_app_job` /
   `external_url is null`, never `kind` alone** (§2.4), and `WITH CHECK`
   regains the `author_id` predicate the current update policy omits (§2.3).
9. Add a **status-only update path** so a firm below the gate can still close
   its own live posts. Without it, a downgraded firm's jobs are frozen on the
   member feed with no way to take them down — and §6's downgrade handling asks
   the firm to do exactly that. Enforce "only `status` changed" in a trigger
   comparing OLD and NEW.
10. Add the applicant embargo to `applications_company_in_app`, rank-keyed on
    `created_at`.
11. `notify pgrst, 'reload schema'`. Adding and dropping columns invalidates
    the PostgREST cache; until it reloads, `select("…, sponsor_tier")` returns
    `PGRST204`.

Also required outside the migration: `supabase/seed.sql:1` inserts
`is_sponsor` and will break the next `supabase db reset`.

### Downgrade

In-app posts stop accepting new applications automatically, and closed posts
leave the member feed (`app/(member)/feed/page.tsx:18-35` has no `status`
filter today, so closed jobs stay listed and keep getting clicked). The first
draft made this an admin prompt and justified it as avoiding surprise for a
late renewal — weighing a sponsor's inconvenience against a student's
application vanishing, and choosing the sponsor. For a club whose purpose is
student outcomes that is the wrong side of the trade, and it depended on admin
diligence that §3 establishes will not exist.

Applications already in flight are marked and the member is told, rather than
showing `submitted` forever against a firm that can no longer read it.

## 9. Type safety

`lib/types.ts:56` is hand-maintained, so `tsc` catches the `.tsx` read sites at
build time. It does **not** catch `app/(admin)/admin/companies/page.tsx:11`
(`.select("*")` cast to `Company[]`) or `app/(member)/feed/page.tsx:41`, where
`is_sponsor` is a string inside a select. That second one is a visible
regression: after the drop it returns `PGRST204`, `data` is null, and the feed's
company filter dropdown goes empty. The `?sponsor=1` filter at `:47` also needs
a redefinition that this document does not yet make.

## 10. Open decisions

**10.1 The tier assignment list.** Blocking for enforcement, not for the
migration — grandfathering (§7) means an incomplete list costs a wrong badge
rather than a broken account. Still required before the grace window closes,
reviewed against `companies.slug`, which is `slugify(name)` plus four random
characters (`admin.ts:271`) and therefore not hand-matchable from memory.

**10.2 Is the mission trade acceptable?** §3 answers this by keeping rank 0
useful, which costs some upgrade pressure. The alternative — gating
announcements and external links — would make the club turn away free job
listings to protect a $500 tier. This is a decision for whoever runs QUANTT,
and it should be recorded here in writing rather than left to sales.
