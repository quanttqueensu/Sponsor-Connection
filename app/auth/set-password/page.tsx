import Image from "next/image";
import { redirect } from "next/navigation";
import AwaitInviteSession from "@/components/AwaitInviteSession";
import { Field, PrimaryButton, TextInput } from "@/components/Form";
import { setPassword } from "@/lib/actions/auth";
import { userNeedsPassword } from "@/lib/auth-session";
import { DENIAL_MESSAGES } from "@/lib/denials";
import { createClient } from "@/lib/supabase/server";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <AwaitInviteSession />;
  }

  if (user.app_metadata?.must_set_password === false) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    redirect(profile?.role === "company_user" ? "/company" : "/feed");
  }

  const { error } = await searchParams;
  const errorText = error ? DENIAL_MESSAGES[error] : undefined;
  const invited = userNeedsPassword(user);

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
      <h1 className="mt-6 font-heading text-3xl font-bold text-white">Create your password</h1>
      <p className="mt-2 max-w-sm text-center text-sm text-white/55">
        You&apos;re almost in. Choose a password to finish setting up your QUANTT Hub account.
      </p>
      <form action={setPassword} className="mt-10 w-full max-w-sm space-y-4">
        {errorText && <p className="text-sm text-red-300">{errorText}</p>}
        {!invited && (
          <p className="text-sm text-white/60">
            Use this form to choose the password you&apos;ll log in with.
          </p>
        )}
        <Field label="Password">
          <TextInput
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm password">
          <TextInput
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <PrimaryButton type="submit">Save password</PrimaryButton>
      </form>
    </div>
  );
}
