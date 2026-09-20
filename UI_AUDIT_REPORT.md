# UI audit — button visibility

Focused polish on the dark hub: shared button primitives, then used them for CTAs and list-row actions. Brand colors and type families unchanged. No business-logic changes.

## What was wrong

- Many submits were unstyled uppercase text (`text-white/50`–`/60` or `text-blue-light`) and did not read as buttons on navy.
- Primary / secondary / destructive were mixed: raw `<button>` next to `PrimaryButton`, Approve looked like a link, Reject like body copy, logout like a nav item.
- Action rows sat in the same visual weight as metadata.

## What changed

Shared variants in `components/Form.tsx`: `primary`, `ghost`, `danger`, `quiet`, `quietDanger`, `nav`, plus `buttonClass()` for links.

Applied across member, company, admin, and public screens (see commit). Confirm dialogs, copy-link, locked actions, and nav logout/Club use the same system.

## Verify

- `npm run lint` — pass (also ignore `.worktrees/` so eslint does not OOM)
- `npm run typecheck` — pass
- No `.env.local` here; live login/browser pass skipped

## Left alone

- Nav section links (Feed, Posts, …) stay text links
- Inline sentence links (e.g. feed “Log it”, login “Request access”)
- PageHeader kickers, member cards, admin home cards

## Round 1 follow-up

Disabled buttons still took variant hover (border/bg) because Tailwind does not skip `hover:` when `disabled`. Added `disabled:pointer-events-none` to the shared BASE class so locked quiet actions (and every other variant) stay flat.

