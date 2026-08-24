import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { Field, PrimaryButton, TextArea, TextInput } from "@/components/Form";
import {
  addSection,
  deleteSection,
  setResumeBookOptIn,
  updateProfile,
  uploadPhoto,
} from "@/lib/actions/profile";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ProfileSection } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: sections } = await supabase
    .from("profile_sections")
    .select("*")
    .eq("member_id", profile.id)
    .order("sort_order");

  return (
    <>
      <PageHeader kicker="You" title="Profile">
        Visible to other members. Resumes live on hiring packages, not here.
      </PageHeader>
      <Notice message={sp.denied} />
      <form action={uploadPhoto} encType="multipart/form-data" className="mb-8 flex items-end gap-3">
        <Field label="Photo">
          <input type="file" name="photo" accept="image/*" />
        </Field>
        <PrimaryButton type="submit">Upload</PrimaryButton>
      </form>
      <form action={updateProfile} className="grid max-w-xl gap-4">
        <Field label="Name">
          <TextInput name="full_name" defaultValue={profile.full_name} required />
        </Field>
        <Field label="Program">
          <TextInput name="program" defaultValue={profile.program ?? ""} />
        </Field>
        <Field label="Grad year">
          <TextInput name="grad_year" type="number" defaultValue={profile.grad_year ?? ""} />
        </Field>
        <Field label="Bio">
          <TextArea name="bio" rows={4} defaultValue={profile.bio ?? ""} />
        </Field>
        <Field label="Interests">
          <TextInput name="interests" defaultValue={profile.interests ?? ""} />
        </Field>
        <Field label="LinkedIn">
          <TextInput name="linkedin_url" defaultValue={profile.linkedin_url ?? ""} />
        </Field>
        <Field label="GitHub">
          <TextInput name="github_url" defaultValue={profile.github_url ?? ""} />
        </Field>
        <Field label="Website">
          <TextInput name="website_url" defaultValue={profile.website_url ?? ""} />
        </Field>
        <PrimaryButton type="submit">Save profile</PrimaryButton>
      </form>

      <h2 className="mt-14 font-heading text-lg font-bold text-white">Custom sections</h2>
      <ul className="mt-4 space-y-4">
        {(sections as ProfileSection[] | null)?.map((s) => (
          <li key={s.id} className="border-t border-white/10 pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white">{s.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-white/60">{s.body}</p>
              </div>
              <form action={deleteSection}>
                <input type="hidden" name="id" value={s.id} />
                <button className="text-xs uppercase tracking-wider text-white/35 hover:text-white">
                  Delete
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <form action={addSection} className="mt-6 max-w-xl space-y-3">
        <Field label="Section title">
          <TextInput name="label" required placeholder="Coursework" />
        </Field>
        <Field label="Content">
          <TextArea name="body" rows={3} required />
        </Field>
        <PrimaryButton type="submit">Add section</PrimaryButton>
      </form>

      <section className="mt-10 border-t border-white/10 pt-8">
        <h2 className="font-heading text-lg font-bold text-white">Resume book</h2>
        <p className="mt-2 text-sm text-white/60">
          QUANTT sponsors will be able to browse an opt-in resume book. If you opt
          in, sponsor firms will be able to see your name, program, graduation
          year, and your default hiring package&apos;s resume. The resume book
          does not include your applications or messages. You can withdraw at
          any time.
        </p>
        <p className="mt-2 text-sm text-white/80">
          You are currently{" "}
          <strong>{profile.resume_book_opt_in ? "opted in" : "opted out"}</strong>.
        </p>
        <form action={setResumeBookOptIn} className="mt-4">
          <input
            type="hidden"
            name="opt_in"
            value={profile.resume_book_opt_in ? "false" : "true"}
          />
          {profile.resume_book_opt_in ? (
            <ConfirmSubmitButton confirmMessage="Withdraw from the resume book? Sponsors will no longer be able to see your profile there.">
              Withdraw from the resume book
            </ConfirmSubmitButton>
          ) : (
            <PrimaryButton type="submit">Opt in</PrimaryButton>
          )}
        </form>
      </section>
    </>
  );
}
