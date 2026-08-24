import type { ReactNode } from "react";

export default function PageHeader({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-10">
      {kicker && (
        <p className="text-[11px] uppercase tracking-[2px] text-blue-light">{kicker}</p>
      )}
      <h1 className="mt-1 font-heading text-3xl font-bold text-white">{title}</h1>
      {children && <div className="mt-2 text-sm text-white/60">{children}</div>}
    </header>
  );
}
