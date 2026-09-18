import LockedCard from "@/components/LockedCard";
import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth";
import { can, graceOnlyCap, loadMyCompanyTier, loadTiers } from "@/lib/tiers";
import { createClient } from "@/lib/supabase/server";
import type { Application } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: cu } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!cu) redirect("/company");

  const [{ assigned, effective, access, overrides }, tiers] = await Promise.all([
    loadMyCompanyTier(cu.company_id),
    loadTiers(),
  ]);

  const { data: apps } = await supabase
    .from("applications")
    .select("*, posts(title), profiles(full_name)")
    .eq("kind", "in_app")
    .eq("company_id", cu.company_id)
    .order("created_at", { ascending: false });

  const embargo = access?.applicant_embargo_hours ?? 0;

  return (
    <>
      <PageHeader kicker="Hiring" title="Applicants" />
      <Notice message={sp.denied} />
      <LockedCard
        capability="read_applicants"
        tier={access}
        tiers={tiers}
        title="Applicant pipeline"
        description="Your current access does not include seeing who applied in the hub."
      >
        {can(access, "read_applicants") && embargo > 0 && (
          <p className="mb-6 text-sm text-white/60">
            New applications appear after {embargo} hours at your tier.
          </p>
        )}
        {graceOnlyCap(assigned, effective, overrides, "read_applicants") && (
            <p className="mb-6 border border-blue-light/30 bg-blue-light/10 p-4 text-sm text-white/80">
              This pipeline is still open during grandfathering. It will lock when your{" "}
              {assigned?.name} package takes effect.
            </p>
          )}
        <p className="mb-6">
          <a
            href="/company/applicants/export"
            className="text-xs uppercase tracking-wider text-blue-light"
          >
            Download CSV
          </a>
        </p>
        <ul>
          {(apps as Application[] | null)?.map((a) => (
            <li key={a.id} className="border-t border-white/10 py-4">
              <p className="text-white">{a.profiles?.full_name}</p>
              <p className="text-sm text-white/60">
                {a.posts?.title} · {a.stage}
              </p>
              {a.post_id && (
                <Link href={`/company/posts/${a.post_id}`} className="text-xs text-blue-light">
                  Open posting
                </Link>
              )}
            </li>
          ))}
        </ul>
        {!(apps ?? []).length && <p className="text-sm text-white/60">No applicants yet.</p>}
      </LockedCard>
    </>
  );
}
