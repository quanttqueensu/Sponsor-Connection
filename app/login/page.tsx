import Image from "next/image";
import Link from "next/link";
import { login } from "@/lib/actions/auth";
import { Field, PrimaryButton, TextInput } from "@/components/Form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Image
        src="/images/logos/quantt-icon.png"
        alt=""
        width={56}
        height={56}
        className="h-12 w-12"
        priority
      />
      <h1 className="mt-6 font-heading text-3xl font-bold text-white">QUANTT Hub</h1>
      <p className="mt-2 max-w-sm text-center text-sm text-white/55">
        Invite-only access for members and approved companies.
      </p>
      <form action={login} className="mt-10 w-full max-w-sm space-y-4">
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Field label="Email">
          <TextInput name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password">
          <TextInput name="password" type="password" required autoComplete="current-password" />
        </Field>
        <PrimaryButton type="submit">Log in</PrimaryButton>
      </form>
      <p className="mt-8 text-sm text-white/60">
        Hiring for your firm?{" "}
        <Link href="/join" className="text-blue-light hover:text-white">
          Request access
        </Link>
      </p>
    </div>
  );
}
