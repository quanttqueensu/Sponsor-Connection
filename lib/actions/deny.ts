import { redirect } from "next/navigation";

/**
 * Refuse an action legibly. Extends the ?error= pattern already used by
 * lib/actions/auth.ts so the user sees a message instead of a crash page.
 * Never throws — redirect() unwinds via Next's control flow.
 */
export function denyRedirect(path: string, message: string): never {
  redirect(`${path}?denied=${encodeURIComponent(message)}`);
}
