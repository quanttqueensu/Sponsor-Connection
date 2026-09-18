import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { redirect } from "next/navigation";

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const { supabase, user } = await getSessionUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return data as Profile | null;
}

/**
 * Hub pages that need a signed-in profile. A session without a profiles row
 * used to bounce /feed → /login with no banner; send a real code instead.
 */
export async function requireCurrentProfile(): Promise<Profile> {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) redirect("/login?error=login_account_missing");
  return data as Profile;
}

export async function requireProfile() {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("Not signed in");
  }
  return profile;
}
