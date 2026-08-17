import PageHeader from "@/components/PageHeader";
import CopyLink from "@/components/CopyLink";
import { toggleSponsor } from "@/lib/actions/admin";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";
import Link from "next/link";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("*").order("name");

  return (
    <>
      <PageHeader kicker="Firms" title="Companies">
        Sponsors and other firms on the hub.{" "}
        <Link href="/admin/invite?kind=company" className="text-blue-light hover:text-white">
          Invite a company contact
        </Link>
      </PageHeader>
      <div className="mb-10 border border-white/10 p-5">
        <p className="text-[11px] uppercase tracking-[2px] text-white/45">Public signup link</p>
        <p className="mt-2 text-sm text-white/60">
          Firms can request access here. You approve them under Join requests, or invite a contact
          directly.
        </p>
        <div className="mt-3">
          <CopyLink value={`${siteUrl()}/join`} />
        </div>
      </div>
      <ul>
        {(companies as Company[] | null)?.map((c) => (
          <li key={c.id} className="flex items-center justify-between border-t border-white/10 py-3">
            <span className="text-white">
              {c.name}{" "}
              <span className="text-xs text-white/40">
                {c.is_sponsor ? "sponsor" : "firm"} · {c.status}
              </span>
            </span>
            <form action={toggleSponsor}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="is_sponsor" value={c.is_sponsor ? "false" : "true"} />
              <button className="text-xs uppercase tracking-wider text-blue-light">
                {c.is_sponsor ? "Unmark sponsor" : "Mark sponsor"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
