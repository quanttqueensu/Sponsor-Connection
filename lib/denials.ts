/**
 * Refusal messages, keyed by an opaque code.
 *
 * The banner in components/Notice.tsx is part of the hub's own trusted
 * chrome, so it must never render text an attacker can put in the URL. A
 * crafted link such as /profile?denied=Email+your+resume+to+attacker@x would
 * otherwise render as a hub instruction on an authenticated page. Actions
 * therefore pass a code and the copy lives here; an unrecognised code
 * renders nothing at all.
 *
 * Kept as a plain .ts module (no JSX) so it can be imported from
 * node-environment code -- lib/actions/deny.ts and the vitest suite in
 * tests/rls -- without dragging in a React component module.
 */
const MESSAGES = {
  // lib/actions/posts.ts
  post_url_invalid:
    "That external listing URL isn't valid. Use a full http:// or https:// web address, or leave it blank.",
  post_term_fields_required:
    "In-app jobs need a role type, term season, and term year. Add an external listing URL instead if you want to link out.",
  post_job_link_url_required:
    "A job link needs an external listing URL. Add one, or post it as a job to take applications in the hub.",
  post_close_not_yours:
    "That post could not be closed. It belongs to another firm, or it has been removed.",
  post_close_missing:
    "That post could not be closed. It no longer exists.",
  post_close_forbidden:
    "You do not have permission to close posts.",
  comment_invalid:
    "That comment was not posted. Write something first, and keep it under 4,000 characters.",

  // lib/actions/applications.ts
  application_duplicate: "You've already applied to that job.",
  application_log_duplicate:
    "You've already logged an application to that posting.",
  application_log_post_missing:
    "That posting no longer exists, so the application was not logged. Log it without a posting instead.",
  stage_invalid: "That is not a valid application stage.",
  application_update_failed: "That application could not be updated.",

  // lib/actions/admin.ts
  join_request_reject_failed:
    "That request was not rejected. It may have been deleted, or your account may no longer have admin rights.",
  join_request_review_race:
    "Another admin reviewed that request first. The firm and its invite were created anyway — check Companies before approving again.",
  join_request_contact_already_registered:
    "The firm was created and the request approved, but that contact address already has a Hub account, so no invite was sent and their account was not touched. They are not attached to the new firm yet — invite a different contact for the firm, or have them tell an exec which account to link.",
  invite_email_already_registered:
    "That address already has a Hub account, so no invite was sent and nothing about the account was changed. Ask them to log in — if they cannot get in, they can use “Forgot your password?” on the login page. Re-inviting never changes an existing account's role.",
  sponsor_toggle_failed:
    "That firm's sponsor status was not changed. The firm may have been removed, or your account may no longer have admin rights.",

  // lib/actions/packages.ts
  package_default_missing:
    "That package no longer exists, so it was not made your default.",
  package_missing: "That package no longer exists.",
  package_create_duplicate:
    "That package was not created — you already have a default package. Uncheck \u201cmake this my default\u201d and try again.",

  // lib/actions/profile.ts
  profile_save_failed:
    "Your profile was not saved. Sign out and back in, then try again.",
  profile_section_missing: "That section no longer exists.",
  profile_photo_attach_failed:
    "The photo uploaded but could not be attached to your profile. Sign out and back in, then try again.",
  resume_book_opt_in_failed:
    "Your resume book opt-in was not saved. You are still opted out.",
  profile_invalid:
    "Your profile was not saved. Check that your name is filled in, that your graduation year is a real year, and that no field is unreasonably long.",
  profile_section_invalid:
    "That section was not added. Give it a short label and a body, keep the body under 4,000 characters, and use a whole number for the order.",
  profile_section_limit:
    "That section was not added — you already have the maximum number of profile sections. Delete one first.",
  resume_book_opt_out_failed:
    "Your resume book consent was NOT withdrawn. Nothing changed — try again, and tell a QUANTT exec if it keeps failing.",
} as const;

/** Every code an action may pass to denyRedirect. */
export type DenialCode = keyof typeof MESSAGES;

const DENIAL_MESSAGES_BY_CODE: Record<DenialCode, string> = MESSAGES;

/**
 * The copy for a code, for the handful of screens that render a refusal
 * through their own `?error=` banner instead of Notice's `?denied=` lookup.
 * The argument is a DenialCode, never URL text, so the result is still copy
 * this repo wrote -- the property Notice exists to guarantee.
 */
export function denialMessage(code: DenialCode): string {
  return DENIAL_MESSAGES_BY_CODE[code];
}

/**
 * Looks up a denial code that may not be a real DenialCode at all -- the
 * whole point is that ?denied= comes from the URL, so an unrecognised (or
 * attacker-supplied) key must resolve to undefined rather than `string`.
 */
export const DENIAL_MESSAGES: Record<string, string | undefined> =
  DENIAL_MESSAGES_BY_CODE;
