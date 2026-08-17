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
