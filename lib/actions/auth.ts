"use server";

import { redirect } from "next/navigation";
import { userNeedsPassword } from "@/lib/auth-session";
import { authCallbackUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function homeForUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";
  if (userNeedsPassword(user)) return "/auth/set-password";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "company_user" ? "/company" : "/feed";
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect(await homeForUser(supabase));
}

/**
 * Self-serve password reset.
 *
 * The outcome never depends on whether the address has an account: a failure
 * from GoTrue (unknown address, send rate limit) leads to exactly the same
 * redirect as a success, so /login cannot be used to test whether someone is
 * a member. This is also the supported way back in for a locked-out user --
 * before it existed, the only recovery was an admin re-invite, which is what
 * made that path dangerous.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect(
      `/login?error=${encodeURIComponent("Enter your email address, then choose “Forgot your password?”.")}`,
    );
  }

  try {
    const supabase = await createClient();
    // The recovery link lands on /auth/callback, which verifies the recovery
    // token and forwards to /auth/set-password.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl(),
    });
  } catch {
    // Same answer either way -- see above.
  }
  redirect("/login?reset=1");
}

export async function markMustSetPassword() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (user.app_metadata?.must_set_password === false) return;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      must_set_password: true,
    },
  });
  if (error) throw new Error(error.message);
}

export async function setPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    redirect(
      `/auth/set-password?error=${encodeURIComponent("Password must be at least 8 characters")}`,
    );
  }
  if (password !== confirm) {
    redirect(`/auth/set-password?error=${encodeURIComponent("Passwords do not match")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?error=Sign+in+link+expired.+Ask+for+a+new+invite.");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/auth/set-password?error=${encodeURIComponent(error.message)}`);
  }

  const admin = createAdminClient();
  const { error: metaErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      must_set_password: false,
    },
  });
  if (metaErr) {
    redirect(`/auth/set-password?error=${encodeURIComponent(metaErr.message)}`);
  }
  await supabase.auth.refreshSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  redirect(profile?.role === "company_user" ? "/company" : "/feed");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
