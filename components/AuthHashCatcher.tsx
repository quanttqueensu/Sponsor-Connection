"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { markMustSetPassword } from "@/lib/actions/auth";
import { isPasswordSetupAuthType, parseAuthHash } from "@/lib/auth-session";
import { createClient } from "@/lib/supabase/client";

/** Invite emails put tokens in the URL hash; the server never sees them. */
export default function AuthHashCatcher() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/auth/callback")) return;

    const parsed = parseAuthHash(window.location.hash);
    if (parsed.error) {
      window.location.replace("/login?error=login_link_expired");
      return;
    }
    if (!parsed.access_token || !parsed.refresh_token) return;

    const supabase = createClient();
    void supabase.auth
      .setSession({
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
      })
      .then(async ({ error }) => {
        if (error) {
          window.location.replace("/login?error=login_failed");
          return;
        }
        if (isPasswordSetupAuthType(parsed.type)) {
          await markMustSetPassword();
          window.location.replace("/auth/set-password");
          return;
        }
        window.location.replace("/");
      });
  }, [pathname]);

  return null;
}
