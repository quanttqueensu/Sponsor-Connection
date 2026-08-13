# Quantt Sponsor Hub — Design Spec

Date: 2026-08-13  
Status: approved for implementation

## Product

A Quantt-branded club hub (separate from quantt-website) where members apply to in-app jobs with hiring packages, companies post roles/events, and execs run invites plus a member-only global feed.

## Users

- **Member** (invite-only): profile, packages, global feed, comments, in-app apply, off-platform log, member directory, DMs to companies.
- **Company user** (invite or exec-approved request): own posts only, applicant inbox on in-app jobs, DMs (reply, or start if that member applied in-app). No global feed, no talent directory.
- **Admin**: a member with `is_admin`. Full member app plus `/admin`. Can apply.

## Rules

- Apply + hiring package only when `posts.kind = job` AND `external_url` is null.
- Posts (events, announcements, connections, job links, jobs) may have comments. Comments are not applications.
- One hiring package may be `is_default`. Apply preselects it; member may change package and/or cover letter per application. Snapshot is immutable.
- External jobs: CTA “Open listing”; optional “Log that I applied”.
- Email sending is out of v1. `notify()` is a no-op hook.
- Companies never see other firms’ posts, the member feed, or the member directory.

## Stack

Next.js 16 App Router, React 19, Tailwind 4, Supabase (Auth, Postgres, Storage). Invite-only (public signup off). Vercel + hosted Supabase.

## Data

See implementation plan. Core tables: `profiles`, `profile_sections`, `hiring_packages`, `companies`, `company_users`, `invites`, `company_join_requests`, `posts`, `post_comments`, `applications`, `conversations`, `messages`. Storage buckets `resumes` and `photos`.

## Branding

Navy `#0a1628`, primary `#2452a1`, Inter + Merriweather, QUANTT wordmark. Dark hub, not a light SaaS dashboard.
