import { can, lowestTierWith, type CapabilityKey, type TierWithCaps } from "@/lib/tiers";
import { QuietButton } from "@/components/Form";
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
      <QuietButton type="button" disabled aria-disabled="true">
        {typeof children === "string" ? children : "Unavailable"}
      </QuietButton>
      {needed && <p className="mt-2 text-xs text-white/50">Included from {needed.name}.</p>}
    </div>
  );
}
