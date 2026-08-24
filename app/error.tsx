"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-5 py-20">
      <p className="text-xs uppercase tracking-wider text-blue-light">Something broke</p>
      <h1 className="mt-2 font-heading text-2xl font-bold text-white">
        That didn&apos;t work
      </h1>
      <p className="mt-4 text-sm text-white/60">
        The action didn&apos;t complete. Your work may not have been saved. Try
        again, and if it keeps happening tell a QUANTT exec what you were doing.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-white/40">Reference: {error.digest}</p>
      )}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={reset}
          className="rounded bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white"
        >
          Try again
        </button>
        <Link href="/" className="text-xs uppercase tracking-wider text-blue-light">
          Go back
        </Link>
      </div>
    </div>
  );
}
