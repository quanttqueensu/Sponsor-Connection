/**
 * Refusal messages, keyed by an opaque code.
 *
 * The banner below is part of the hub's own trusted chrome, so it must never
 * render text an attacker can put in the URL. A crafted link such as
 * /profile?denied=Email+your+resume+to+attacker@x would otherwise render as a
 * hub instruction on an authenticated page. Actions therefore pass a code and
 * the copy lives here; an unrecognised code renders nothing at all.
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

  // lib/actions/applications.ts
  application_duplicate: "You've already applied to that job.",
  application_log_duplicate:
    "You've already logged an application to that posting.",
  stage_invalid: "That is not a valid application stage.",
  application_update_failed: "That application could not be updated.",

  // lib/actions/admin.ts
  join_request_reject_failed:
    "That request was not rejected. It may have been deleted, or your account may no longer have admin rights.",
  join_request_review_race:
    "Another admin reviewed that request first. The firm and its invite were created anyway — check Companies before approving again.",
  sponsor_toggle_failed:
    "That firm's sponsor status was not changed. The firm may have been removed, or your account may no longer have admin rights.",

  // lib/actions/messages.ts
  message_read_marker_failed:
    "Your message was sent, but this thread could not be marked as read. It may no longer be yours.",

  // lib/actions/packages.ts
  package_default_missing:
    "That package no longer exists, so it was not made your default.",
  package_missing: "That package no longer exists.",

  // lib/actions/profile.ts
  profile_save_failed:
    "Your profile was not saved. Sign out and back in, then try again.",
  profile_section_missing: "That section no longer exists.",
  profile_photo_attach_failed:
    "The photo uploaded but could not be attached to your profile. Sign out and back in, then try again.",
  resume_book_opt_in_failed:
    "Your resume book opt-in was not saved. You are still opted out.",
  resume_book_opt_out_failed:
    "Your resume book consent was NOT withdrawn. Nothing changed — try again, and tell a QUANTT exec if it keeps failing.",
} as const;

/** Every code an action may pass to denyRedirect. */
export type DenialCode = keyof typeof MESSAGES;

export const DENIAL_MESSAGES: Record<string, string> = MESSAGES;

export default function Notice({ message }: { message?: string }) {
  const text = message ? DENIAL_MESSAGES[message] : undefined;
  if (!text) return null;
  return (
    <p
      role="alert"
      className="mb-6 rounded border border-blue-light/40 bg-blue-light/10 px-4 py-3 text-sm text-white/80"
    >
      {text}
    </p>
  );
}
