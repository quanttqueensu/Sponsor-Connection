import PageHeader from "@/components/PageHeader";
import TierBadge from "@/components/TierBadge";
import { getCurrentProfile } from "@/lib/auth";
import {
  can,
  capValue,
  formatPrice,
  graceIsOpen,
  loadCapabilities,
  loadMyCompanyTier,
  loadTiers,
  lowestTierWith,
} from "@/lib/tiers";
import type { CapabilityKey } from "@/lib/tiers";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import { redirect } from "next/navigation";

export default async function SponsorshipPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: cu } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!cu) redirect("/company");

  const [{ assigned, effective, graceUntil }, capabilities, tiers] = await Promise.all([
    loadMyCompanyTier(cu.company_id),
    loadCapabilities(),
    loadTiers(),
  ]);

  const display = assigned ?? effective;
  const grace = graceIsOpen(graceUntil);

  return (
    <>
      <PageHeader kicker="Package" title="Sponsorship">
        What your firm bought, and what this hub actually unlocks.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-2xl font-bold text-white">{display?.name ?? "Unassigned"}</h2>
        <TierBadge tier={display} />
      </div>
      <p className="mt-2 text-sm text-white/60">
        {formatPrice(display?.price_cents ?? null)}
        {display?.blurb ? ` · ${display.blurb}` : ""}
      </p>
      {grace && graceUntil && assigned && effective && assigned.id !== effective.id && (
        <p className="mt-4 border border-blue-light/30 bg-blue-light/10 p-4 text-sm text-white/80">
          Until {formatDate(`${graceUntil}T12:00:00`)} you still have {effective.name} access. After
          that, {assigned.name} applies.
        </p>
      )}

      <ul className="mt-8 space-y-4">
        {capabilities.map((cap) => {
          const key = cap.key as CapabilityKey;
          const included = can(display, key);
          const needed = included ? null : lowestTierWith(tiers, key);
          const quota = cap.kind === "quota" ? capValue(display, key) : null;
          return (
            <li key={cap.key} className="border-t border-white/10 py-4">
              <p className="text-white">
                {cap.label}{" "}
                <span className="text-xs uppercase tracking-wider text-white/50">
                  {included
                    ? quota == null
                      ? cap.kind === "quota"
                        ? "unlimited"
                        : "included"
                      : `${quota} open jobs`
                    : "not included"}
                </span>
              </p>
              <p className="mt-1 text-sm text-white/55">{cap.description}</p>
              {!included && needed && (
                <p className="mt-2 text-xs text-blue-light">Included from {needed.name}.</p>
              )}
            </li>
          );
        })}
      </ul>
      {display && display.applicant_embargo_hours > 0 && (
        <p className="mt-8 text-sm text-white/60">
          New applications appear {display.applicant_embargo_hours} hours after they are submitted.
        </p>
      )}
    </>
  );
}
