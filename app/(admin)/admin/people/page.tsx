import PageHeader from "@/components/PageHeader";
import { Field, PrimaryButton, TextInput } from "@/components/Form";
import { inviteMember } from "@/lib/actions/admin";
import { createClient } from "@/lib/supabase/server";

export default async function PeoplePage() {
  const supabase = await createClient();
  const { data: people } = await supabase
    .from("profiles")
    .select("full_name, email, role, is_admin")
    .eq("role", "member")
    .order("full_name");

  return (
    <>
      <PageHeader kicker="Roster" title="People" />
      <ul className="mb-10">
        {(people ?? []).map((p) => (
          <li key={p.email} className="border-t border-white/10 py-3 text-sm text-white/80">
            {p.full_name}{" "}
            <span className="text-white/40">
              {p.email}
              {p.is_admin ? " · admin" : ""}
            </span>
          </li>
        ))}
      </ul>
      <form action={inviteMember} className="max-w-md space-y-3">
        <h2 className="font-heading text-lg font-bold text-white">Invite member</h2>
        <Field label="Name">
          <TextInput name="full_name" required />
        </Field>
        <Field label="Email">
          <TextInput name="email" type="email" required />
        </Field>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" name="is_admin" />
          Admin
        </label>
        <PrimaryButton type="submit">Send invite</PrimaryButton>
      </form>
    </>
  );
}
