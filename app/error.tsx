"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * `reset()` only re-renders the failed segment. These are Server Component
 * pages whose data load already failed, so a retry usually fails the same way
 * — always offer a route out as well.
 */
function homeFor(pathname: string) {
  if (pathname.startsWith("/admin")) return { href: "/admin", label: "Admin" };
  if (pathname.startsWith("/company")) return { href: "/company", label: "Company" };
  if (pathname.startsWith("/feed") || pathname.startsWith("/members")) {
    return { href: "/feed", label: "Feed" };
  }
  return { href: "/", label: "Home" };
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const home = homeFor(pathname ?? "/");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-5 py-20">
      <p className="text-xs uppercase tracking-wider text-blue-light">Error</p>
      <h1 className="mt-2 font-heading text-2xl font-bold text-white">
        This page didn&apos;t load
      </h1>
      <p className="mt-4 text-sm text-white/60">
        Nothing was saved. Retrying may not help — go back to {home.label} instead. If it keeps
        happening, send a QUANTT exec the reference below.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-white/60">Reference: {error.digest}</p>
      )}
      <div className="mt-8 flex items-center gap-4">
        <Link
          href={home.href}
          className="rounded bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white"
        >
          Go to {home.label}
        </Link>
        <button
          onClick={reset}
          className="text-xs uppercase tracking-wider text-blue-light hover:text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
