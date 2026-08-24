import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import ManualInviteBanner from "@/components/ManualInviteBanner";
import { readManualInvite, reviewJoinRequest } from "@/lib/actions/admin";
import { createClient } from "@/lib/supabase/server";
import type { JoinRequest } from "@/lib/types";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ manual?: string; denied?: string }>;
}) {
  const { manual, denied } = await searchParams;
  const setup = manual ? await readManualInvite() : null;
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("company_join_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at");

  return (
    <>
      <PageHeader kicker="Queue" title="Join requests" />
      <Notice message={denied} />
      {setup &&<ManualInviteBanner email={setup.email} password={setup.password} />}
      <ul>
        {(requests as JoinRequest[] | null)?.map((r) => (
          <li key={r.id} className="border-t border-white/10 py-5">
            <p className="text-white">{r.company_name}</p>
            <p className="text-sm text-white/50">
              {r.contact_name} · {r.contact_email}
            </p>
            {r.note && <p className="mt-2 text-sm text-white/60">{r.note}</p>}
            <div className="mt-3 flex gap-3">
              <form action={reviewJoinRequest}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="approved" />
                <label className="mr-3 text-xs text-white/50">
                  <input type="checkbox" name="is_sponsor" /> Sponsor
                </label>
                <button className="text-xs uppercase tracking-wider text-blue-light">Approve</button>
              </form>
              <form action={reviewJoinRequest}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="rejected" />
                <button className="text-xs uppercase tracking-wider text-white/40">Reject</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      {!(requests ?? []).length && <p className="text-sm text-white/45">No pending requests.</p>}
    </>
  );
}
