import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import { Field, PrimaryButton, TextArea, TextInput } from "@/components/Form";
import { createPackage, deletePackage, setDefaultPackage } from "@/lib/actions/packages";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { HiringPackage } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: packages } = await supabase
    .from("hiring_packages")
    .select("*")
    .eq("member_id", profile.id)
    .order("created_at", { ascending: false });

  const rows = (packages as HiringPackage[] | null) ?? [];

  return (
    <>
      <PageHeader kicker="Apply" title="Hiring packages">
        A package is resume + LinkedIn, with an optional default cover letter. You can change
        package and cover letter on each in-app job.
      </PageHeader>
      <Notice message={sp.denied} />
      {rows.length === 0 && (
        <p className="border border-white/10 p-6 text-sm text-white/60">
          You have no hiring packages yet. Build your first one with the form below — you
          need at least one before you can apply to an in-app job.
        </p>
      )}
      <ul className="space-y-4">
        {rows.map((pkg) => (
          <li key={pkg.id} className="border-t border-white/10 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-white">
                  {pkg.name}{" "}
                  {pkg.is_default && (
                    <span className="text-[10px] uppercase tracking-wider text-blue-light">
                      Default
                    </span>
                  )}
                </p>
                <p className="text-sm text-white/60">{pkg.linkedin_url}</p>
              </div>
              <div className="flex gap-2">
                {!pkg.is_default && (
                  <form action={setDefaultPackage}>
                    <input type="hidden" name="id" value={pkg.id} />
                    <button className="text-xs uppercase tracking-wider text-white/50 hover:text-white">
                      Make default
                    </button>
                  </form>
                )}
                <form action={deletePackage}>
                  <input type="hidden" name="id" value={pkg.id} />
                  <button className="text-xs uppercase tracking-wider text-white/60 hover:text-white">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <form action={createPackage} encType="multipart/form-data" className="mt-10 max-w-lg space-y-4">
        <h2 className="font-heading text-lg font-bold text-white">New package</h2>
        <Field label="Name">
          <TextInput name="name" required placeholder="Quant Research" maxLength={120} />
        </Field>
        <Field label="LinkedIn URL">
          <TextInput
            name="linkedin_url"
            required
            defaultValue={profile.linkedin_url ?? ""}
            maxLength={500}
          />
        </Field>
        <Field label="Resume PDF">
          <input type="file" name="resume" accept="application/pdf" required />
        </Field>
        <Field label="Default cover letter (optional)">
          <TextArea name="cover_letter" rows={5} maxLength={4000} />
        </Field>
        <Field label="Default cover PDF (optional)">
          <input type="file" name="cover_pdf" accept="application/pdf" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" name="is_default" />
          Make this my default package
        </label>
        <PrimaryButton type="submit">Save package</PrimaryButton>
      </form>
    </>
  );
}
