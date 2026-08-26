import { createClient } from "@/lib/supabase/server";
import type { SponsorCapability, SponsorTier, SponsorTierCapability } from "@/lib/types";

export const CAPABILITY_KEYS = [
  "post_in_app_job",
  "read_applicants",
  "dm_initiate_applicant",
  "post_event",
  "resume_book",
  "candidate_search",
  "dm_initiate_any",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type TierWithCaps = SponsorTier & {
  sponsor_tier_capabilities: SponsorTierCapability[];
};

export function isCapabilityKey(value: string): value is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(value);
}

export function can(tier: TierWithCaps | null | undefined, key: CapabilityKey) {
  return Boolean(tier?.sponsor_tier_capabilities?.some((c) => c.capability === key));
}

export function capValue(tier: TierWithCaps | null | undefined, key: CapabilityKey) {
  return tier?.sponsor_tier_capabilities?.find((c) => c.capability === key)?.value ?? null;
}

export function lowestTierWith(tiers: TierWithCaps[], key: CapabilityKey) {
  return (
    [...tiers]
      .filter((t) => t.is_active && t.rank > 0 && can(t, key))
      .sort((a, b) => a.rank - b.rank)[0] ?? null
  );
}

export function graceIsOpen(until: string | null | undefined) {
  if (!until) return false;
  return until >= new Date().toISOString().slice(0, 10);
}

export function priceDollars(cents: number | null) {
  if (cents == null) return "";
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2);
}

export function formatPrice(cents: number | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export async function loadCapabilities(): Promise<SponsorCapability[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sponsor_capabilities")
    .select("*")
    .order("sort_order");
  return (data as SponsorCapability[] | null) ?? [];
}

export async function loadTiers(opts: { includeInactive?: boolean } = {}): Promise<TierWithCaps[]> {
  const supabase = await createClient();
  let query = supabase
    .from("sponsor_tiers")
    .select("*, sponsor_tier_capabilities(*)")
    .order("rank");
  if (!opts.includeInactive) query = query.eq("is_active", true);
  const { data } = await query;
  return (data as TierWithCaps[] | null) ?? [];
}

export async function loadMyCompanyTier(companyId: string) {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("sponsor_tier_id, grace_tier_id, tier_grace_until")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) {
    return {
      assigned: null as TierWithCaps | null,
      effective: null as TierWithCaps | null,
      graceUntil: null as string | null,
    };
  }

  const tiers = await loadTiers({ includeInactive: true });
  const assigned = tiers.find((t) => t.id === company.sponsor_tier_id) ?? null;
  const graceOpen = graceIsOpen(company.tier_grace_until as string | null);
  const effective =
    graceOpen && company.grace_tier_id
      ? (tiers.find((t) => t.id === company.grace_tier_id) ?? assigned)
      : assigned;
  return {
    assigned,
    effective,
    graceUntil: company.tier_grace_until as string | null,
  };
}
