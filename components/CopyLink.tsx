"use client";

import { useState } from "react";

export default function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <code className="break-all text-sm text-white/70">{value}</code>
      <button
        type="button"
        className="text-xs uppercase tracking-wider text-blue-light"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
