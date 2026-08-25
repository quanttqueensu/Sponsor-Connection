"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { markMustSetPassword } from "@/lib/actions/auth";
import { isPasswordSetupAuthType, parseAuthHash, userNeedsPassword } from "@/lib/auth-session";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const token_hash = url.searchParams.get("token_hash");
      const typeParam = url.searchParams.get("type");
      const hash = parseAuthHash(url.hash);
      const type = (typeParam || hash.type) as EmailOtpType | null;

      try {
        if (hash.error) {
          throw new Error("login_link_expired");
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type });
          if (error) throw error;
        } else if (hash.access_token && hash.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: hash.access_token,
            refresh_token: hash.refresh_token,
          });
          if (error) throw error;
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) throw new Error("login_link_expired");
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("login_link_expired");

        const needsPassword = isPasswordSetupAuthType(type) || userNeedsPassword(user);
        if (needsPassword) {
          await markMustSetPassword();
        }

        window.location.replace(needsPassword ? "/auth/set-password" : "/");
      } catch {
        if (cancelled) return;
        setMessage("That sign-in link didn't work.");
        window.location.replace("/login?error=login_link_expired");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <p className="text-sm text-white/55">{message}</p>
    </div>
  );
}
