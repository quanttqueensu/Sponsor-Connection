import type { User } from "@supabase/supabase-js";

/**
 * Invited users must set a password before using the app.
 * `invited_at` is never cleared after updateUser({ password }), so do not use it.
 */
export function userNeedsPassword(user: User | null | undefined) {
  return user?.app_metadata?.must_set_password === true;
}

export function isPasswordSetupAuthType(type: string | null | undefined) {
  return type === "invite" || type === "recovery";
}

export function parseAuthHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    type: params.get("type"),
    error: params.get("error") ?? params.get("error_code"),
    error_description: params.get("error_description"),
  };
}

/**
 * Invite / recovery / magic links often land on `/` or `/login` because that
 * is the Supabase Site URL. The only page that exchanges them is
 * `/auth/callback`. Forward rather than dropping the tokens.
 */
export function shouldForwardToAuthCallback(
  pathname: string,
  search: string,
  hash: string,
) {
  if (pathname.startsWith("/auth/callback")) return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("code") || params.get("token_hash")) return true;
  const parsed = parseAuthHash(hash);
  if (parsed.error) return true;
  return Boolean(parsed.access_token && parsed.refresh_token);
}
