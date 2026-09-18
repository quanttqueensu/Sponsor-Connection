"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { shouldForwardToAuthCallback } from "@/lib/auth-session";

/** Invite emails put tokens in the URL; the server never sees the hash. */
export default function AuthHashCatcher() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      !shouldForwardToAuthCallback(
        pathname,
        window.location.search,
        window.location.hash,
      )
    ) {
      return;
    }
    window.location.replace(`/auth/callback${window.location.search}${window.location.hash}`);
  }, [pathname]);

  return null;
}
