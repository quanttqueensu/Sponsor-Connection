import LockedCard from "@/components/LockedCard";
import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import TalentList, { type TalentRow } from "@/components/TalentList";
import { Field, TextInput } from "@/components/Form";
import { getCurrentProfile } from "@/lib/auth";
import { can, liveCan, liveTier, loadMyCompanyTier, loadTiers } from "@/lib/tiers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function cleanTerm(raw: string | undefined) {
  return String(raw ?? "")
    .replace(/[%_\\]/g, " ")
    .trim()
    .slice(0, 80);
}

export default async function CandidateSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; program?: string; year?: string; denied?: string }>;
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

  const [{ assigned, effective }, tiers] = await Promise.all([
    loadMyCompanyTier(cu.company_id),
    loadTiers(),
  ]);

  const q = cleanTerm(sp.q);
  const program = cleanTerm(sp.program);
  const yearRaw = String(sp.year ?? "").trim();
  const year = yearRaw === "" ? null : Number(yearRaw);
  const yearOk = year === null || (Number.isInteger(year) && year >= 1900 && year <= 2100);

  const { data: members } = liveCan(assigned, effective, "candidate_search")
    ? await supabase.rpc("candidate_search_list", {
        p_q: q || null,
        p_program: program || null,
        p_grad_year: yearOk ? year : null,
      })
    : { data: [] as TalentRow[] };

  return (
    <>
      <PageHeader kicker="Talent" title="Candidate search">
        Search opted-in members by name, program, year, or interests.
      </PageHeader>
      <Notice message={sp.denied} />
      <LockedCard
        capability="candidate_search"
        tier={liveTier(assigned, effective, "candidate_search")}
        tiers={tiers}
        title="Candidate search"
        description="Your current sponsorship does not include searching the member book."
      >
        {assigned &&
          !can(assigned, "candidate_search") &&
          can(effective, "candidate_search") && (
            <p className="mb-6 border border-blue-light/30 bg-blue-light/10 p-4 text-sm text-white/80">
              Search is still open during grandfathering. It will lock when your {assigned.name}{" "}
              package takes effect.
            </p>
          )}
        <form method="get" className="mb-8 grid max-w-2xl gap-3 md:grid-cols-4">
          <Field label="Search">
            <TextInput name="q" defaultValue={q} maxLength={80} placeholder="Name or interests" />
          </Field>
          <Field label="Program">
            <TextInput name="program" defaultValue={program} maxLength={80} />
          </Field>
          <Field label="Grad year">
            <TextInput name="year" type="number" defaultValue={yearRaw} />
          </Field>
          <div className="flex items-end">
            <button className="rounded bg-primary px-4 py-2 text-xs uppercase tracking-wider text-white">
              Search
            </button>
          </div>
        </form>
        <TalentList
          members={(members as TalentRow[] | null) ?? []}
          companyId={cu.company_id}
          returnTo="/company/search"
          dmTier={liveTier(assigned, effective, "dm_initiate_any")}
          tiers={tiers}
          empty={
            q || program || yearRaw
              ? "No opted-in members match these filters."
              : "No opted-in members yet."
          }
        />
      </LockedCard>
    </>
  );
}
