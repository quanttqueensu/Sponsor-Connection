import PageHeader from "@/components/PageHeader";
import CopyLink from "@/components/CopyLink";
import ManualInviteBanner from "@/components/ManualInviteBanner";
import { Field, PrimaryButton, TextInput } from "@/components/Form";
import { inviteCompany, readManualInvite, toggleSponsor } from "@/lib/actions/admin";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; manual?: string }>;
}) {
  const { sent, error, manual } = await searchParams;
  const setup = manual ? await readManualInvite() : null;
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("*").order("name");

  return (
    <>
      <PageHeader kicker="Firms" title="Companies" />
      {setup && <ManualInviteBanner email={setup.email} password={setup.password} />}
      <div className="mb-10 border border-white/10 p-5">
        <p className="text-[11px] uppercase tracking-[2px] text-white/45">Sponsor signup link</p>
        <p className="mt-2 text-sm text-white/60">
          Share this with hiring contacts. Requests land in Admin → Join requests. Approve there
          to send them an invite and password link.
        </p>
        <div className="mt-3">
          <CopyLink value={`${siteUrl()}/join`} />
        </div>
      </div>
      <ul className="mb-10">
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
      <form action={inviteCompany} className="max-w-md space-y-3">
        <h2 className="font-heading text-lg font-bold text-white">Invite company contact</h2>
        {sent && <p className="text-sm text-blue-light">Invite sent. They will set a password from the email link.</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Field label="Existing company">
          <select name="company_id" className="w-full rounded px-3 py-2 text-sm">
            <option value="">Create new below</option>
            {(companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Or new company name">
          <TextInput name="new_company_name" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" name="is_sponsor" />
          Sponsor
        </label>
        <Field label="Contact name">
          <TextInput name="full_name" required />
        </Field>
        <Field label="Contact email">
          <TextInput name="email" type="email" required />
        </Field>
        <PrimaryButton type="submit">Send invite</PrimaryButton>
      </form>
    </>
  );
}
