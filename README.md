# QUANTT Hub (Sponsor Connection)

Invite-only hub for QUANTT members and companies. Members see a global feed and apply to in-app jobs with hiring packages. Companies see only their own posts and applicants.

The public brochure site remains [quantt-website](https://github.com). This app is Quantt-branded (navy, Inter, Merriweather) but is a separate product.

## Stack

Next.js 16, React 19, Tailwind 4, Supabase (Auth, Postgres, Storage).

## Setup

1. Create a Supabase project. Turn **off** public signups (Authentication → Providers → Email: disable sign-ups; invites still work).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor, then `supabase/seed.sql`.
3. Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

4. Seed the first admin: insert a row into `invites` with your email, `role = 'member'`, `is_admin = true`, then invite that email from Authentication → Users → Invite (or use Admin → People after you have any admin). Fastest path in SQL:

```sql
insert into public.invites (email, full_name, role, is_admin)
values ('you@quantt.ca', 'Your Name', 'member', true);
```

Then send an invite from the Supabase dashboard for that email. Accept the link, set a password, log in at `/login`.

5. `npm install && npm run dev`

## Rules (v1)

- Apply + hiring package only on **in-app jobs** (`kind = job`, no `external_url`).
- Posts can have comments. Comments are not applications.
- External job links: “Open listing”, optional off-platform log.
- Member feed is global. Companies see **only their own posts**.
- Email sending is not implemented (`lib/notify.ts` is a no-op hook).
- Resumes: PDF, 5MB. Photos: ~2MB.

## Routes

| Who | Paths |
| --- | --- |
| Public | `/login`, `/for-companies`, `/auth/callback` |
| Member | `/feed`, `/packages`, `/applications`, `/profile`, `/members`, `/messages` |
| Company | `/company`, `/company/posts/new`, `/company/applicants`, `/company/messages` |
| Admin | `/admin` plus the member app |
