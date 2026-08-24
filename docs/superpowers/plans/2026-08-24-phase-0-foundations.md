# Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give QUANTT Hub the ability to fail legibly, fix three crashes on paid-for happy paths, and start accumulating resume-book consent — everything sponsor tiers depend on, with none of the tier logic.

**Architecture:** Add a local Supabase instance and a Vitest harness that can act as different users, because every later phase asserts RLS behaviour that cannot be verified by inspection. Then add a single error boundary, a `denyRedirect` helper that extends the existing `?error=` pattern, and surface the silent zero-row RLS denials. Fix the three crashes independently. Ship a member consent toggle early so the resume book has data when it arrives.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Supabase (Auth/Postgres/Storage), TypeScript, Vitest (new), Supabase CLI (local stack).

**Spec:** `docs/superpowers/specs/2026-08-24-sponsor-tiers-design.md`

## Global Constraints

- Node 20 for all npm/next commands: `~/.nvm/versions/node/v20.20.2`. Node 24 is present and must not be used.
- Branding: navy `#0a1628`, primary `#2452a1`, Inter + Merriweather, dark hub. New UI matches.
- Do not commit `.env*`, keys, or `AGENTS.md`.
- Do not commit or push unless the executing human asks.
- `lib/supabase/admin.ts` (service role) is server-only. Never import it into a client component.
- Server actions that a user can correct return via `denyRedirect`; only genuinely exceptional states throw.
- Existing migrations are applied by hand. New migrations are additive files under `supabase/migrations/`; never edit `0001_init.sql`.
- `is_admin()` resolves through `auth.uid()`. Under the service role, the SQL editor, psql, and migrations it returns **false**. Any trigger keyed on it reverts those writes.

---

### Task 1: Local Supabase + test harness

Nothing else in this plan or the tier plan can be verified without this. There is currently no test framework and no local database.

**Files:**
- Create: `supabase/config.toml` (generated)
- Create: `vitest.config.ts`
- Create: `tests/helpers/db.ts`
- Create: `tests/rls/baseline.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `asUser(email: string): Promise<SupabaseClient>`, `asAnon(): SupabaseClient`, `asService(): SupabaseClient`, `resetDb(): Promise<void>` from `tests/helpers/db.ts`. Every later RLS task uses these.

- [ ] **Step 1: Initialise the local Supabase stack**

```bash
cd /home/jack/Quantt/Sponsor-Connection
supabase init
supabase start
```

`supabase init` writes `supabase/config.toml`. `supabase start` prints an API URL, an anon key, and a service_role key. Record all three — the next step needs them.

Expected: a running local stack, migrations in `supabase/migrations/` applied automatically.

- [ ] **Step 2: Add test env and install Vitest**

Create `.env.test` (gitignored):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from step 1>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from step 1>
```

Append `.env.test` to `.gitignore`.

```bash
~/.nvm/versions/node/v20.20.2/bin/npm install -D vitest dotenv
```

- [ ] **Step 3: Write the harness**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["dotenv/config"],
    env: { DOTENV_CONFIG_PATH: ".env.test" },
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false,
  },
});
```

`fileParallelism: false` matters — these tests share one database and truncate between files.

Create `tests/helpers/db.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function asAnon(): SupabaseClient {
  return createClient(url, anonKey);
}

export function asService(): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const PASSWORD = "test-password-123";

/**
 * Create (or reuse) a confirmed auth user and return a client authenticated
 * as them. `handle_new_user` requires a matching unaccepted invite row, so
 * seedMember/seedCompanyUser insert one before creating the user.
 */
export async function asUser(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

export async function seedMember(
  email: string,
  opts: { isAdmin?: boolean; fullName?: string } = {},
): Promise<string> {
  const svc = asService();
  await svc.from("invites").insert({
    email,
    full_name: opts.fullName ?? email,
    role: "member",
    is_admin: opts.isAdmin ?? false,
  });
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

export async function seedCompany(
  name: string,
  opts: { isSponsor?: boolean } = {},
): Promise<string> {
  const svc = asService();
  const { data, error } = await svc
    .from("companies")
    .insert({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-") + "-" + Math.random().toString(36).slice(2, 6),
      is_sponsor: opts.isSponsor ?? false,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedCompany ${name}: ${error.message}`);
  return data.id;
}

export async function seedCompanyUser(
  email: string,
  companyId: string,
): Promise<string> {
  const svc = asService();
  await svc.from("invites").insert({
    email,
    full_name: email,
    role: "company_user",
    company_id: companyId,
  });
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

/** Truncate every application table. Order respects FKs via CASCADE. */
export async function resetDb(): Promise<void> {
  const svc = asService();
  const { error } = await svc.rpc("test_reset");
  if (error) throw new Error(`resetDb: ${error.message}`);
}
```

- [ ] **Step 4: Add the reset function as a local-only migration**

Create `supabase/migrations/0003_test_reset.sql`:

```sql
-- Test-only helper. Truncates application data and auth users.
-- Safe to apply in production: it is service-role only (revoked from
-- anon and authenticated), so no user session can reach it.
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
    public.hiring_packages,
    public.profile_sections,
    public.company_join_requests,
    public.invites,
    public.company_users,
    public.companies
  cascade;
  delete from auth.users;
end;
$$;

revoke execute on function public.test_reset() from public, anon, authenticated;
```

> Numbering note: this takes `0003`. The sponsor tiers migration in the Phase 1
> plan is therefore `0004`, not `0003` as the spec's §8 says. Update the spec
> reference when Phase 1 begins.

- [ ] **Step 5: Add scripts and write a baseline test**

In `package.json` `scripts`, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"db:reset": "supabase db reset"
```

Create `tests/rls/baseline.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, resetDb, seedCompany, seedCompanyUser, seedMember } from "../helpers/db";

describe("baseline RLS", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a company user cannot read the member directory", async () => {
    const companyId = await seedCompany("Acme Capital");
    await seedMember("member@test.dev");
    await seedCompanyUser("recruiter@acme.dev", companyId);

    const recruiter = await asUser("recruiter@acme.dev");
    const { data } = await recruiter.from("profiles").select("id").eq("role", "member");

    expect(data ?? []).toHaveLength(0);
  });

  it("signup without an invite is refused by handle_new_user", async () => {
    const { asService } = await import("../helpers/db");
    const { error } = await asService().auth.admin.createUser({
      email: "uninvited@test.dev",
      password: "test-password-123",
      email_confirm: true,
    });

    expect(error?.message).toMatch(/Invite required/i);
  });
});
```

- [ ] **Step 6: Run it**

```bash
supabase db reset
~/.nvm/versions/node/v20.20.2/bin/npm test
```

Expected: both tests PASS. If `seedMember` fails with "Invite required", the invite insert is racing the user creation — confirm `invites` is written before `auth.admin.createUser`.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts tests/ package.json package-lock.json .gitignore supabase/config.toml supabase/migrations/0003_test_reset.sql
git commit -m "test: add local supabase stack and RLS test harness"
```

---

### Task 2: Error boundary and not-found

**Files:**
- Create: `app/error.tsx`
- Create: `app/not-found.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Behavioural only: thrown server actions now render a branded page with a retry instead of the Next.js default.

- [ ] **Step 1: Write the error boundary**

Create `app/error.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-5 py-20">
      <p className="text-xs uppercase tracking-wider text-blue-light">Something broke</p>
      <h1 className="mt-2 font-heading text-2xl font-bold text-white">
        That didn&apos;t work
      </h1>
      <p className="mt-4 text-sm text-white/60">
        The action didn&apos;t complete. Your work may not have been saved. Try
        again, and if it keeps happening tell a QUANTT exec what you were doing.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-white/40">Reference: {error.digest}</p>
      )}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={reset}
          className="rounded bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white"
        >
          Try again
        </button>
        <Link href="/" className="text-xs uppercase tracking-wider text-blue-light">
          Go back
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write not-found**

Create `app/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-5 py-20">
      <p className="text-xs uppercase tracking-wider text-blue-light">404</p>
      <h1 className="mt-2 font-heading text-2xl font-bold text-white">Not found</h1>
      <p className="mt-4 text-sm text-white/60">
        That page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white"
      >
        Go back
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Verify both render**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm run build
```

Expected: build succeeds. Then `npm run dev` and visit `/does-not-exist` — expect the branded 404 on the dark background, not the white Next.js default.

- [ ] **Step 4: Commit**

```bash
git add app/error.tsx app/not-found.tsx
git commit -m "feat: add branded error boundary and 404 page"
```

---

### Task 3: denyRedirect and surfacing silent RLS denials

The spec's §2.2: a filtered-out `UPDATE` returns `error: null` with zero rows, so the user is told an action succeeded when the database refused it.

**Files:**
- Create: `lib/actions/deny.ts`
- Modify: `lib/actions/posts.ts` (`closePost`)
- Modify: `lib/actions/applications.ts` (`updateApplicationStage`)
- Test: `tests/rls/silent-denial.test.ts`

**Interfaces:**
- Consumes: `tests/helpers/db.ts` from Task 1.
- Produces: `denyRedirect(path: string, message: string): never` from `lib/actions/deny.ts`. Phase 1 uses this for every tier refusal.

- [ ] **Step 1: Write the failing test**

Create `tests/rls/silent-denial.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, resetDb, seedCompany, seedCompanyUser } from "../helpers/db";

describe("RLS denial is observable", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a company cannot close another firm's post, and the update returns zero rows", async () => {
    const acme = await seedCompany("Acme Capital");
    const rival = await seedCompany("Rival Partners");
    await seedCompanyUser("recruiter@acme.dev", acme);
    const rivalOwner = await seedCompanyUser("owner@rival.dev", rival);

    const { data: post } = await asService()
      .from("posts")
      .insert({
        author_id: rivalOwner,
        company_id: rival,
        kind: "announcement",
        title: "Rival announcement",
        status: "open",
      })
      .select("id")
      .single();

    const recruiter = await asUser("recruiter@acme.dev");
    const { data, error } = await recruiter
      .from("posts")
      .update({ status: "closed" })
      .eq("id", post!.id)
      .select("id");

    // This is the trap: RLS filters the row, so there is no error at all.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to confirm the behaviour**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test -- silent-denial
```

Expected: PASS. This test documents the hazard rather than a bug — it must keep passing, and it proves `.select()` is what makes denial detectable.

- [ ] **Step 3: Write denyRedirect**

Create `lib/actions/deny.ts`:

```ts
import { redirect } from "next/navigation";

/**
 * Refuse an action legibly. Extends the ?error= pattern already used by
 * lib/actions/auth.ts so the user sees a message instead of a crash page.
 * Never throws — redirect() unwinds via Next's control flow.
 */
export function denyRedirect(path: string, message: string): never {
  redirect(`${path}?denied=${encodeURIComponent(message)}`);
}
```

- [ ] **Step 4: Make closePost detect denial**

In `lib/actions/posts.ts`, replace the body of `closePost` so the update is scoped and checked. The current version updates by id alone and discards the result:

```ts
export async function closePost(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const id = String(formData.get("post_id"));

  const { data, error } = await supabase
    .from("posts")
    .update({ status: "closed" })
    .eq("id", id)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) {
    denyRedirect(
      profile.role === "company_user" ? "/company" : "/admin",
      "That post could not be closed. It may belong to another firm.",
    );
  }

  revalidatePath("/company");
  revalidatePath("/feed");
}
```

Add `import { denyRedirect } from "./deny";` at the top.

- [ ] **Step 5: Make updateApplicationStage detect denial**

In `lib/actions/applications.ts`, apply the same shape to `updateApplicationStage`, and validate the stage value rather than passing the raw form string to the database:

```ts
const STAGES = ["submitted", "reviewing", "interviewing", "offer", "closed"] as const;

export async function updateApplicationStage(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const id = String(formData.get("application_id"));
  const stage = String(formData.get("stage"));

  if (!STAGES.includes(stage as (typeof STAGES)[number])) {
    denyRedirect("/applications", "That is not a valid application stage.");
  }

  const { data, error } = await supabase
    .from("applications")
    .update({ stage })
    .eq("id", id)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) {
    denyRedirect(
      profile.role === "company_user" ? "/company/applicants" : "/applications",
      "That application could not be updated.",
    );
  }

  revalidatePath("/applications");
  revalidatePath("/company");
  revalidatePath("/admin/applications");
}
```

Note the last `revalidatePath` — the existing code revalidates `/admin`, but the admin applications list lives at `/admin/applications`.

- [ ] **Step 6: Render the denial message**

Create `components/Notice.tsx`:

```tsx
export default function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-6 rounded border border-blue-light/40 bg-blue-light/10 px-4 py-3 text-sm text-white/80">
      {message}
    </p>
  );
}
```

Render it on the three pages `denyRedirect` targets. In each page component, read the search param and pass it through. For `app/(company)/company/page.tsx`:

```tsx
export default async function CompanyHome({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  // ...existing body...
  return (
    <>
      <Notice message={sp.denied} />
      {/* existing JSX */}
    </>
  );
}
```

Apply the same to `app/(member)/applications/page.tsx` and `app/(company)/company/applicants/page.tsx`.

- [ ] **Step 7: Verify**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test
~/.nvm/versions/node/v20.20.2/bin/npm run lint
~/.nvm/versions/node/v20.20.2/bin/npm run build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/actions/deny.ts lib/actions/posts.ts lib/actions/applications.ts components/Notice.tsx app/ tests/
git commit -m "feat: surface RLS denials instead of reporting false success"
```

---

### Task 4: Fix the in-app job posting crash

Partner's headline promise is "job posting privileges." Posting an in-app job crashes when the form is filled in as labelled. `PostForm.tsx:51,59,67` mark role type, term season, and term year optional with blank defaults; `in_app_job_fields` (`0001_init.sql:128`) requires all three when `kind='job'` and `external_url` is null.

**Files:**
- Modify: `components/PostForm.tsx`
- Modify: `lib/actions/posts.ts` (`createPost`)
- Test: `tests/rls/post-constraints.test.ts`

**Interfaces:**
- Consumes: `denyRedirect` from Task 3.
- Produces: nothing importable.

- [ ] **Step 1: Write the failing test**

Create `tests/rls/post-constraints.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asService, resetDb, seedCompany, seedCompanyUser } from "../helpers/db";

describe("in_app_job_fields", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects an in-app job missing term fields", async () => {
    const acme = await seedCompany("Acme Capital");
    const author = await seedCompanyUser("recruiter@acme.dev", acme);

    const { error } = await asService().from("posts").insert({
      author_id: author,
      company_id: acme,
      kind: "job",
      title: "Quant Intern",
      external_url: null,
      role_type: null,
      term_season: null,
      term_year: null,
    });

    expect(error?.message).toMatch(/in_app_job_fields/);
  });

  it("accepts an in-app job with all three term fields", async () => {
    const acme = await seedCompany("Acme Capital");
    const author = await seedCompanyUser("recruiter@acme.dev", acme);

    const { error } = await asService().from("posts").insert({
      author_id: author,
      company_id: acme,
      kind: "job",
      title: "Quant Intern",
      external_url: null,
      role_type: "internship",
      term_season: "summer",
      term_year: 2027,
    });

    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm the constraint fires**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test -- post-constraints
```

Expected: both PASS. This pins the constraint the form must respect.

- [ ] **Step 3: Validate in createPost before the insert**

In `lib/actions/posts.ts`, inside `createPost`, after the kind and external-url handling and before the insert:

```ts
const isInApp = kind === "job" && !externalUrl;
if (isInApp && (!roleType || !termSeason || !termYear)) {
  denyRedirect(
    profile.role === "company_user" ? "/company/posts/new" : "/admin/posts",
    "In-app jobs need a role type, term season, and term year. Add an external listing URL instead if you want to link out.",
  );
}
```

Add `import { denyRedirect } from "./deny";`.

- [ ] **Step 4: Make the form kind-aware**

`components/PostForm.tsx` is currently a server component with a static `kinds` array. Convert it to a client component that shows only the fields the selected kind needs, and marks them `required`.

Add `"use client";` at the top and track the two inputs that decide the shape:

```tsx
"use client";

import { useState } from "react";

export default function PostForm({ kinds, companies }: PostFormProps) {
  const [kind, setKind] = useState(kinds[0] ?? "announcement");
  const [externalUrl, setExternalUrl] = useState("");
  const isInAppJob = kind === "job" && externalUrl.trim() === "";
  const isEvent = kind === "event";
```

Bind the kind select to `setKind` and the external URL input to `setExternalUrl`. Then wrap the three job fields so they render only for an in-app job and are required when they do:

```tsx
{isInAppJob && (
  <>
    <Field label="Role type">
      <select name="role_type" required className="w-full rounded px-3 py-2 text-sm">
        <option value="">Choose one</option>
        <option value="full_time">Full-time</option>
        <option value="internship">Internship</option>
        <option value="coop">Co-op</option>
      </select>
    </Field>
    <Field label="Term season">
      <select name="term_season" required className="w-full rounded px-3 py-2 text-sm">
        <option value="">Choose one</option>
        <option value="fall">Fall</option>
        <option value="winter">Winter</option>
        <option value="summer">Summer</option>
      </select>
    </Field>
    <Field label="Term year">
      <TextInput name="term_year" type="number" required placeholder="2027" />
    </Field>
  </>
)}
```

Show the `starts_at` field only when `isEvent`. Change the external URL field's label to make the consequence explicit:

```tsx
<Field label="External listing URL">
  <TextInput
    name="external_url"
    type="url"
    value={externalUrl}
    onChange={(e) => setExternalUrl(e.target.value)}
  />
  <p className="mt-1 text-xs text-white/60">
    Leave blank to accept applications in the hub. Add a URL to send members to
    your own careers page instead.
  </p>
</Field>
```

- [ ] **Step 5: Verify by hand**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm run dev
```

As a company user, open `/company/posts/new`, choose kind `job`, leave the URL blank. Expect the three term fields to appear and to block submission when empty. Fill them and submit — expect success, not a crash. Then add an external URL and expect the three fields to disappear.

- [ ] **Step 6: Commit**

```bash
git add components/PostForm.tsx lib/actions/posts.ts tests/rls/post-constraints.test.ts
git commit -m "fix: in-app job posting no longer crashes on the labelled happy path"
```

---

### Task 5: Fix the duplicate off-platform application crash

`applications_one_per_job` (`0001_init.sql:166`) is unique on `(member_id, post_id)`. The in-app branch checks `existingApp` (`feed/[id]:115`); the off-platform form (`:102-110`) renders unconditionally, so a second click is a unique violation.

**Files:**
- Modify: `app/(member)/feed/[id]/page.tsx`
- Modify: `lib/actions/applications.ts` (`logOffPlatform`)
- Test: `tests/rls/duplicate-application.test.ts`

**Interfaces:**
- Consumes: `denyRedirect` from Task 3.
- Produces: nothing importable.

- [ ] **Step 1: Write the failing test**

Create `tests/rls/duplicate-application.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asService, resetDb, seedCompany, seedCompanyUser, seedMember } from "../helpers/db";

describe("applications_one_per_job", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects a second application against the same post", async () => {
    const acme = await seedCompany("Acme Capital");
    const author = await seedCompanyUser("recruiter@acme.dev", acme);
    const memberId = await seedMember("member@test.dev");

    const { data: post } = await asService()
      .from("posts")
      .insert({
        author_id: author,
        company_id: acme,
        kind: "job",
        title: "External role",
        external_url: "https://acme.example/careers",
      })
      .select("id")
      .single();

    const row = {
      member_id: memberId,
      kind: "off_platform" as const,
      post_id: post!.id,
      company_id: acme,
      company_name: "Acme Capital",
    };

    const first = await asService().from("applications").insert(row);
    expect(first.error).toBeNull();

    const second = await asService().from("applications").insert(row);
    expect(second.error?.code).toBe("23505");
  });
});
```

- [ ] **Step 2: Run it**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test -- duplicate-application
```

Expected: PASS, confirming `23505` is the code to catch.

- [ ] **Step 3: Hide the form when an application already exists**

In `app/(member)/feed/[id]/page.tsx`, the page already loads `existingApp` for the in-app branch. Reuse it for the off-platform form — change the condition at line 102 from `{p.external_url && profile && (` to:

```tsx
{p.external_url && profile && !existingApp && (
```

And add the confirmed state directly after that block:

```tsx
{p.external_url && profile && existingApp && (
  <p className="mt-6 text-sm text-blue-light">
    Logged — this is in your applications.
  </p>
)}
```

Confirm `existingApp` is fetched regardless of post kind. If its query is currently guarded by `inApp`, remove that guard so it runs for external posts too.

- [ ] **Step 4: Catch the race in the action**

In `lib/actions/applications.ts`, in `logOffPlatform`, replace the bare throw with a specific catch:

```ts
const { error } = await supabase.from("applications").insert(row);
if (error) {
  if (error.code === "23505") {
    denyRedirect("/applications", "You've already logged an application to that posting.");
  }
  throw new Error(error.message);
}
```

This closes the double-submit window that hiding the form alone cannot.

- [ ] **Step 5: Verify by hand**

Open an external post as a member, click "Log that I applied" twice. Expect the button to be replaced by "Logged" after the first click, and no crash on a double submit.

- [ ] **Step 6: Commit**

```bash
git add "app/(member)/feed/[id]/page.tsx" lib/actions/applications.ts tests/rls/duplicate-application.test.ts
git commit -m "fix: logging an external application twice no longer crashes"
```

---

### Task 6: Fix the hiring-package dead end

`feed/[id]:118` renders "Create a hiring package first" as grey text at the app's primary conversion moment, with no link.

**Files:**
- Modify: `app/(member)/feed/[id]/page.tsx:118`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Replace the text with a CTA**

```tsx
) : !packages?.length ? (
  <div className="mt-3">
    <p className="text-sm text-white/60">
      A hiring package bundles your resume, LinkedIn, and an optional cover
      letter so you can apply in one click. You need one before applying.
    </p>
    <Link
      href="/packages"
      className="mt-4 inline-block rounded bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white"
    >
      Create a hiring package
    </Link>
  </div>
) : (
```

Confirm `Link` is imported at the top of the file.

- [ ] **Step 2: Verify**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm run build
```

Expected: build succeeds. In dev, as a member with no packages, open an in-app job and confirm the button navigates to `/packages`.

- [ ] **Step 3: Commit**

```bash
git add "app/(member)/feed/[id]/page.tsx"
git commit -m "fix: link members to package creation from the apply block"
```

---

### Task 7: Resume-book consent toggle

Ships ahead of the resume book itself so consent accumulates while it is built. An empty resume book is worse than none. Supporter's promise is the "**opt-in** member resume book" and no consent column exists anywhere in the schema.

**Files:**
- Create: `supabase/migrations/0004_resume_book_opt_in.sql`
- Modify: `app/(member)/profile/page.tsx`
- Modify: `lib/actions/profile.ts`
- Modify: `lib/types.ts`
- Test: `tests/rls/resume-book-consent.test.ts`

**Interfaces:**
- Consumes: `tests/helpers/db.ts`.
- Produces: `profiles.resume_book_opt_in boolean`, `profiles.resume_book_opt_in_at timestamptz`. The Phase 2 resume book reads both — the timestamp drives Principal's "early access" embargo.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_resume_book_opt_in.sql`:

```sql
-- Member consent for the resume book. Self-writable: this is the member's
-- own decision, so it is deliberately NOT added to profiles_protect_privileged.
alter table public.profiles
  add column resume_book_opt_in boolean not null default false,
  add column resume_book_opt_in_at timestamptz;

-- Stamp the timestamp whenever consent is granted; clear it when withdrawn.
-- The timestamp drives the Principal early-access embargo in Phase 2.
create or replace function public.profiles_stamp_opt_in()
returns trigger
language plpgsql
as $$
begin
  if new.resume_book_opt_in and not coalesce(old.resume_book_opt_in, false) then
    new.resume_book_opt_in_at := now();
  elsif not new.resume_book_opt_in then
    new.resume_book_opt_in_at := null;
  end if;
  return new;
end;
$$;

create trigger profiles_stamp_opt_in
  before update on public.profiles
  for each row execute function public.profiles_stamp_opt_in();

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Write the failing test**

Create `tests/rls/resume-book-consent.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, resetDb, seedMember } from "../helpers/db";

describe("resume book consent", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("defaults to false with no timestamp", async () => {
    const id = await seedMember("member@test.dev");
    const member = await asUser("member@test.dev");

    const { data } = await member
      .from("profiles")
      .select("resume_book_opt_in, resume_book_opt_in_at")
      .eq("id", id)
      .single();

    expect(data!.resume_book_opt_in).toBe(false);
    expect(data!.resume_book_opt_in_at).toBeNull();
  });

  it("stamps a timestamp when a member opts in, and clears it on withdrawal", async () => {
    const id = await seedMember("member@test.dev");
    const member = await asUser("member@test.dev");

    await member.from("profiles").update({ resume_book_opt_in: true }).eq("id", id);
    const { data: onData } = await member
      .from("profiles")
      .select("resume_book_opt_in_at")
      .eq("id", id)
      .single();
    expect(onData!.resume_book_opt_in_at).not.toBeNull();

    await member.from("profiles").update({ resume_book_opt_in: false }).eq("id", id);
    const { data: offData } = await member
      .from("profiles")
      .select("resume_book_opt_in_at")
      .eq("id", id)
      .single();
    expect(offData!.resume_book_opt_in_at).toBeNull();
  });

  it("a member cannot set another member's consent", async () => {
    await seedMember("a@test.dev");
    const bId = await seedMember("b@test.dev");
    const a = await asUser("a@test.dev");

    const { data } = await a
      .from("profiles")
      .update({ resume_book_opt_in: true })
      .eq("id", bId)
      .select("id");

    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test -- resume-book-consent
```

Expected: FAIL — column does not exist.

- [ ] **Step 4: Apply the migration and re-run**

```bash
supabase db reset
~/.nvm/versions/node/v20.20.2/bin/npm test -- resume-book-consent
```

Expected: all three PASS.

- [ ] **Step 5: Add the toggle to the profile page**

In `lib/types.ts`, add to the `Profile` type:

```ts
resume_book_opt_in: boolean;
resume_book_opt_in_at: string | null;
```

In `lib/actions/profile.ts`, add a dedicated action rather than folding it into `updateProfile`, so consent is always a deliberate act:

```ts
export async function setResumeBookOptIn(formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "member") throw new Error("Members only");
  const supabase = await createClient();
  const optIn = formData.get("opt_in") === "true";

  const { error } = await supabase
    .from("profiles")
    .update({ resume_book_opt_in: optIn })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}
```

In `app/(member)/profile/page.tsx`, render a section that states plainly what consent means:

```tsx
<section className="mt-10 border-t border-white/10 pt-8">
  <h2 className="font-heading text-lg font-bold text-white">Resume book</h2>
  <p className="mt-2 text-sm text-white/60">
    QUANTT sponsors can browse an opt-in resume book. If you opt in, sponsor
    firms can see your name, program, graduation year, and your default hiring
    package&apos;s resume. They cannot see your applications or messages. You
    can withdraw at any time.
  </p>
  <p className="mt-2 text-sm text-white/80">
    You are currently{" "}
    <strong>{profile.resume_book_opt_in ? "opted in" : "opted out"}</strong>.
  </p>
  <form action={setResumeBookOptIn} className="mt-4">
    <input
      type="hidden"
      name="opt_in"
      value={profile.resume_book_opt_in ? "false" : "true"}
    />
    <PrimaryButton type="submit">
      {profile.resume_book_opt_in ? "Withdraw from the resume book" : "Opt in"}
    </PrimaryButton>
  </form>
</section>
```

- [ ] **Step 6: Verify**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm test
~/.nvm/versions/node/v20.20.2/bin/npm run lint
~/.nvm/versions/node/v20.20.2/bin/npm run build
```

Expected: all pass. In dev, toggle consent on `/profile` twice and confirm the label flips both ways.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0004_resume_book_opt_in.sql "app/(member)/profile/page.tsx" lib/actions/profile.ts lib/types.ts tests/rls/resume-book-consent.test.ts
git commit -m "feat: add member resume-book consent toggle"
```

---

### Task 8: Custom SMTP

Configuration, not code — but it deletes the worst security behaviour in the system, and every safety mechanism in the tier design needs outbound email.

**Files:**
- Modify: `lib/actions/admin.ts` (remove the fallback path)
- Delete: `components/ManualInviteBanner.tsx`
- Modify: `app/(admin)/admin/invite/page.tsx`
- Modify: `lib/notify.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `notify()` becomes a real sender. Phase 1 expiry warnings depend on it.

- [ ] **Step 1: Configure SMTP (human action)**

This step must be done by someone with Supabase dashboard access. In Project Settings → Authentication → SMTP Settings, configure a provider (Resend or Postmark; both have free tiers adequate for this volume). Set sender name "QUANTT" and a sender address on a domain you control. Verify the domain's SPF and DKIM records.

Then raise the invite rate limit in Authentication → Rate Limits, which defaults to roughly two emails per hour on built-in SMTP.

Confirm before proceeding: send a test invite from `/admin/invite` to your own address and confirm delivery without the manual-password banner appearing.

- [ ] **Step 2: Delete the fallback path**

In `lib/actions/admin.ts`, remove `createUserWithoutEmail`, `stashManualInvite`, `readManualInvite`, and `markInviteNeedsPassword`. In `sendAuthInvite`, remove the rate-limit and already-registered fallback branches so a failure surfaces as an error rather than silently degrading to a hand-relayed password.

```ts
async function sendAuthInvite(admin: SupabaseClient, email: string, meta: InviteMeta) {
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: meta,
    redirectTo: `${siteUrl()}/auth/callback`,
  });
  if (error) throw new Error(`Invite email failed: ${error.message}`);
}
```

- [ ] **Step 3: Remove the banner**

```bash
git rm components/ManualInviteBanner.tsx
```

In `app/(admin)/admin/invite/page.tsx`, remove the `ManualInviteBanner` import, its render, and the `?manual=1` handling.

- [ ] **Step 4: Make notify real**

Replace `lib/notify.ts` with a Resend-backed sender. Add `RESEND_API_KEY` to `.env.local` and to the deployment environment.

```ts
type NotifyEvent = { to: string[]; subject: string; body: string };

export async function notify(event: NotifyEvent): Promise<void> {
  if (!event.to.length) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("notify: RESEND_API_KEY unset, skipping", event.subject);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "QUANTT <hub@quantt.ca>",
      to: event.to,
      subject: event.subject,
      text: event.body,
    }),
  });

  if (!res.ok) {
    console.error("notify: send failed", res.status, await res.text());
  }
}
```

Failures log rather than throw — a notification must never break the mutation that triggered it.

- [ ] **Step 5: Verify**

```bash
~/.nvm/versions/node/v20.20.2/bin/npm run lint
~/.nvm/versions/node/v20.20.2/bin/npm run build
~/.nvm/versions/node/v20.20.2/bin/npm test
```

Expected: all pass, no references to the removed functions remain.

```bash
grep -rn "ManualInviteBanner\|createUserWithoutEmail\|stashManualInvite" --include=*.ts --include=*.tsx . | grep -v node_modules
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add -A lib/actions/admin.ts lib/notify.ts "app/(admin)/admin/invite/page.tsx" components/
git commit -m "feat: real invite email, remove plaintext password relay"
```

---

## Self-review

**Spec coverage.** Phase 0 of the spec §7 lists: custom SMTP (Task 8), `app/error.tsx` and `not-found.tsx` (Task 2), `denyRedirect` (Task 3), `.select()` on the two silent updates (Task 3), the resume-book opt-in toggle (Task 7), and the three crashes (Tasks 4, 5, 6). All covered. The test harness (Task 1) is not in the spec — it is a precondition discovered while planning, because the repo has no test framework and no local database, and every tier assertion in Phase 1 is an RLS claim.

**Deliberately excluded**, per spec §7: `loading.tsx`, `EmptyState` across nine pages, and the `useFormStatus` refactor. They are unrelated to tiers and ship separately.

**Not covered here**, deferred to the Phase 1 plan: the tier columns, `company_sponsorships`, the rank helpers, the trigger rewrite, the grandfathering migration, shadow mode, and the admin tier editor.

**Migration numbering.** Task 1 takes `0003`, Task 7 takes `0004`. The spec §8 calls the tiers migration `0003`; it becomes `0005`. Update the spec when Phase 1 starts.

**Type consistency.** `denyRedirect(path, message)` is defined in Task 3 and used with that signature in Tasks 3, 4, and 5. `asUser`, `asService`, `seedMember`, `seedCompany`, `seedCompanyUser`, and `resetDb` are defined in Task 1 and used with those signatures in Tasks 3, 4, 5, and 7. `setResumeBookOptIn` is defined and consumed within Task 7.

**Known gap.** Task 8 step 1 requires Supabase dashboard access and cannot be completed by an agent. It blocks nothing else in this plan — Tasks 1–7 are independent of it — but it blocks the Phase 1 expiry warnings.
