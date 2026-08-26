import type { SponsorTier } from "@/lib/types";

export default function TierBadge({
  tier,
}: {
  tier: Pick<SponsorTier, "name" | "rank"> | null | undefined;
}) {
  if (!tier || tier.rank === 0) return null;
  return (
    <span className="rounded border border-blue-light/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blue-light">
      {tier.name}
    </span>
  );
}
