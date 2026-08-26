import { can, lowestTierWith, type CapabilityKey, type TierWithCaps } from "@/lib/tiers";
import type { ReactNode } from "react";

export default function LockedAction({
  capability,
  tier,
  tiers,
  children,
}: {
  capability: CapabilityKey;
  tier: TierWithCaps | null;
  tiers: TierWithCaps[];
  children: ReactNode;
}) {
  if (can(tier, capability)) return <>{children}</>;
  const needed = lowestTierWith(tiers, capability);
  return (
    <div>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="rounded bg-white/10 px-5 py-2.5 text-xs uppercase tracking-wider text-white/40"
      >
        {typeof children === "string" ? children : "Unavailable"}
      </button>
      {needed && <p className="mt-2 text-xs text-white/50">Included from {needed.name}.</p>}
    </div>
  );
}
