import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] uppercase tracking-wider text-white/60">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded px-3 py-2 text-sm ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded px-3 py-2 text-sm ${props.className ?? ""}`}
    />
  );
}

export type ButtonVariant = "primary" | "ghost" | "danger" | "quiet" | "quietDanger" | "nav";

const BASE =
  "inline-flex items-center justify-center rounded font-medium disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "min-h-11 bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white hover:bg-primary/80",
  ghost:
    "min-h-11 border border-white/25 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-wider text-white/90 hover:border-white/45 hover:bg-white/[0.08] hover:text-white",
  danger:
    "min-h-11 border border-red-400/40 bg-red-950/45 px-4 py-2 text-xs uppercase tracking-wider text-red-100 hover:border-red-300/65 hover:bg-red-900/50 hover:text-white",
  quiet:
    "min-h-9 border border-white/25 bg-white/[0.05] px-3 py-1.5 text-xs text-white/90 hover:border-white/45 hover:bg-white/[0.09] hover:text-white",
  quietDanger:
    "min-h-9 border border-red-400/35 bg-red-950/35 px-3 py-1.5 text-xs text-red-100 hover:border-red-300/60 hover:bg-red-900/45 hover:text-white",
  nav: "min-h-8 shrink-0 border border-white/25 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[1px] text-white/90 hover:border-white/45 hover:bg-white/[0.08] hover:text-white",
};

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return [BASE, VARIANTS[variant], className].filter(Boolean).join(" ");
}

function HubButton({
  variant,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant: ButtonVariant }) {
  return (
    <button {...props} className={buttonClass(variant, className)}>
      {children}
    </button>
  );
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <HubButton variant="primary" {...props} />;
}

export function GhostButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <HubButton variant="ghost" {...props} />;
}

export function DangerButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <HubButton variant="danger" {...props} />;
}

export function QuietButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <HubButton variant="quiet" {...props} />;
}

export function QuietDangerButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <HubButton variant="quietDanger" {...props} />;
}
