# Complete hub capabilities

> Execute in this session. Email/`notify()` stays a no-op (v1). Do not push.

**Goal:** Every admin-toggled capability does something real; Phase 1 leftovers and visible polish land; local git is a clean series ready to push.

**Out of scope:** custom SMTP, enforcing CSP, public member signup, package/post/comment edit, people promote, letters of rec / Firm Days.

## Sequence

1. Keep `0010` enforcement (quota UPDATE, embargo leaks, loud admin-field denial) plus the uncommitted UI/action patches. Gate company UI on **effective** tier so grandfathering still works; warn when assigned will take that away.
2. Feed: hide `status = closed`; add a term season/year control.
3. Photos on profile/directory; LinkedIn/GitHub/website as links.
4. Migration `0011`: `resume_book_embargo_hours` on tiers, RPCs `resume_book_list` / `candidate_search_list`, `member_in_my_resume_book`, `my_contactable_opt_in`, widen `conversations_company_insert`, set `is_enforced` true, `test_reset` for the RLS suite.
5. Company: `/company/resume-book`, `/company/search`, talent resume/photo routes, CSV export, logos, nav.
6. RLS tests for resume book, search, DM-any, quota UPDATE.
7. Commits per slice on top of the existing 26 (do not rewrite them).

## Capability → product

| Admin tick | What it unlocks |
| --- | --- |
| `post_in_app_job` | In-app jobs + quota (already) |
| `read_applicants` | Pipeline (already) |
| `dm_initiate_applicant` | Message applicants past embargo (already) |
| `post_event` | Event posts (already) |
| `resume_book` | `/company/resume-book` + resume download |
| `candidate_search` | `/company/search` (program/year/interests) |
| `dm_initiate_any` | Message opted-in members from those pages |

Resume-book delay hours live on the tier form next to applicant delay. Principal seeds at 0 (immediate); supporter/partner/leader at 168 (7 days). Admins can change either.
