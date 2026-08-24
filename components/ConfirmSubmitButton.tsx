"use client";

import type { ButtonHTMLAttributes } from "react";

/**
 * A submit button that requires a native confirm() before the form
 * submission is allowed to proceed. Used for actions that should not fire
 * from a stale tab or accidental double-click (e.g. withdrawing consent).
 */
export default function ConfirmSubmitButton({
  confirmMessage,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { confirmMessage: string }) {
  return (
    <button
      {...props}
      type="submit"
      className="rounded bg-primary px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-white hover:bg-primary/80 disabled:opacity-50"
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
