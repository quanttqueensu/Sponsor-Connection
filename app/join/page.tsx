import { submitCompanyRequest } from "@/lib/actions/admin";
import { Field, PrimaryButton, TextArea, TextInput } from "@/components/Form";
import Link from "next/link";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg px-6 py-24">
      <p className="text-[11px] uppercase tracking-[2px] text-blue-light/70">Sponsors</p>
      <h1 className="mt-2 font-heading text-3xl font-bold text-white">Request hub access</h1>
      <p className="mt-3 text-sm text-white/60">
        Share this page with hiring contacts. QUANTT execs review each request and send an
        invite to set a password. You will not have an account until you are approved.
      </p>
      {sent ? (
        <p className="mt-10 text-sm text-blue-light">
          We’ll be in touch if QUANTT approves your access.
        </p>
      ) : (
        <form action={submitCompanyRequest} className="mt-10 space-y-4">
          {error && <p className="text-sm text-red-300">{error}</p>}
          <Field label="Company name">
            <TextInput name="company_name" required />
          </Field>
          <Field label="Website">
            <TextInput name="website" type="url" />
          </Field>
          <Field label="Your name">
            <TextInput name="contact_name" required />
          </Field>
          <Field label="Work email">
            <TextInput name="contact_email" type="email" required />
          </Field>
          <Field label="Note">
            <TextArea name="note" rows={4} />
          </Field>
          <PrimaryButton type="submit">Submit request</PrimaryButton>
        </form>
      )}
      <p className="mt-8 text-sm text-white/40">
        Already invited?{" "}
        <Link href="/login" className="text-blue-light hover:text-white">
          Log in
        </Link>
      </p>
    </div>
  );
}
