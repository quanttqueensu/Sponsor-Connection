import { can, lowestTierWith, type CapabilityKey, type TierWithCaps } from "@/lib/tiers";
import type { ReactNode } from "react";

export default function LockedCard({
  capability,
  tier,
  tiers,
  title,
  description,
  children,
}: {
  capability: CapabilityKey;
  tier: TierWithCaps | null;
  tiers: TierWithCaps[];
  title: string;
  description: string;
  children?: ReactNode;
}) {
  if (can(tier, capability)) return <>{children}</>;

  const needed = lowestTierWith(tiers, capability);

  return (
    <section className="rounded border border-white/10 bg-white/[0.02] p-6">
      <h2 className="font-heading text-lg font-bold text-white/70">{title}</h2>
      <p className="mt-2 text-sm text-white/60">{description}</p>
      <p className="mt-4 text-xs uppercase tracking-wider text-blue-light">
        {needed ? `Included from ${needed.name}` : "Not currently available"}
      </p>
      <a
        href="mailto:sponsors@quantt.ca?subject=QUANTT%20sponsorship"
        className="mt-4 inline-block rounded border border-blue-light/40 px-4 py-2 text-xs uppercase tracking-wider text-blue-light"
      >
        Talk to QUANTT
      </a>
    </section>
  );
}
