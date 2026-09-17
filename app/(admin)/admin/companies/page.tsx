import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import CopyLink from "@/components/CopyLink";
import { setCompanyTier } from "@/lib/actions/admin";
import { graceIsOpen, loadTiers } from "@/lib/tiers";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { Company, SponsorTier } from "@/lib/types";
import { formatDate } from "@/lib/time";
import Link from "next/link";

type CompanyRow = Company & { sponsor_tiers: SponsorTier | SponsorTier[] | null };

function oneTier(value: SponsorTier | SponsorTier[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: companies }, tiers] = await Promise.all([
    supabase.from("companies").select("*, sponsor_tiers!sponsor_tier_id(*)").order("name"),
    loadTiers({ includeInactive: true }),
  ]);

  return (
    <>
      <PageHeader kicker="Firms" title="Companies">
        Assign a sponsorship package to each firm.{" "}
        <Link href="/admin/invite?kind=company" className="text-blue-light hover:text-white">
          Invite a company contact
        </Link>
      </PageHeader>
      <Notice message={sp.denied} />
      <div className="mb-10 border border-white/10 p-5">
        <p className="text-[11px] uppercase tracking-[2px] text-white/60">Public signup link</p>
        <p className="mt-2 text-sm text-white/60">
          Firms can request access here. You approve them under Join requests, or invite a contact
          directly.
        </p>
        <div className="mt-3">
          <CopyLink value={`${siteUrl()}/join`} />
        </div>
      </div>
      <ul>
        {(companies as CompanyRow[] | null)?.map((c) => {
          const assigned = oneTier(c.sponsor_tiers);
          const grace = graceIsOpen(c.tier_grace_until);
          return (
            <li key={c.id} className="border-t border-white/10 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-white">
                  {c.name}{" "}
                  <span className="text-xs text-white/60">
                    {assigned?.name ?? "unassigned"} · {c.status}
                    {grace && c.tier_grace_until
                      ? ` · grandfathered until ${formatDate(`${c.tier_grace_until}T12:00:00`)}`
                      : ""}
                  </span>
                </span>
                <form action={setCompanyTier} className="flex items-center gap-2">
                  <input type="hidden" name="company_id" value={c.id} />
                  <select
                    name="sponsor_tier_id"
                    defaultValue={c.sponsor_tier_id}
                    aria-label={`Tier for ${c.name}`}
                    className="rounded px-3 py-2 text-sm"
                  >
                    {tiers
                      .filter((t) => t.is_active || t.id === c.sponsor_tier_id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {!t.is_active ? " (inactive)" : ""}
                        </option>
                      ))}
                  </select>
                  <button className="text-xs uppercase tracking-wider text-blue-light">Save</button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
