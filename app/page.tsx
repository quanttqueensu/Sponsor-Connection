"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    if (window.location.hash.includes("access_token")) return;
    window.location.replace("/login");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <p className="text-sm text-white/55">Loading…</p>
    </div>
  );
}
