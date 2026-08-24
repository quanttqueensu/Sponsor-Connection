"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { denyRedirect } from "./deny";

export async function updateProfile(formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "member") throw new Error("Members only");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim(),
      program: emptyToNull(formData.get("program")),
      grad_year: numOrNull(formData.get("grad_year")),
      bio: emptyToNull(formData.get("bio")),
      interests: emptyToNull(formData.get("interests")),
      linkedin_url: emptyToNull(formData.get("linkedin_url")),
      github_url: emptyToNull(formData.get("github_url")),
      website_url: emptyToNull(formData.get("website_url")),
    })
    .eq("id", profile.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) {
    denyRedirect(
      "/profile",
      "Your profile was not saved. Sign out and back in, then try again.",
    );
  }
  revalidatePath("/profile");
}

export async function addSection(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("profile_sections").insert({
    member_id: profile.id,
    label: String(formData.get("label") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    sort_order: Number(formData.get("sort_order") ?? 0),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function deleteSection(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_sections")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("member_id", profile.id)
    .select("id");
  if (error) throw new Error(error.message);
  // Owner-scoped, matching the RLS policy exactly, so zero rows means the
  // section is already gone rather than that it belongs to someone else.
  if (!data?.length) {
    denyRedirect("/profile", "That section no longer exists.");
  }
  revalidatePath("/profile");
}

export async function uploadPhoto(formData: FormData) {
  const profile = await requireProfile();
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) throw new Error("Choose a photo");
  if (file.size > 2 * 1024 * 1024) throw new Error("Photo must be under 2MB");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Photo must be a JPEG, PNG, or WebP");
  const supabase = await createClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${profile.id}/photo.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw new Error(error.message);

  const { data: updated, error: updErr } = await supabase
    .from("profiles")
    .update({ photo_path: path })
    .eq("id", profile.id)
    .select("id");
  if (updErr) throw new Error(updErr.message);
  if (!updated?.length) {
    denyRedirect(
      "/profile",
      "The photo uploaded but could not be attached to your profile. Sign out and back in, then try again.",
    );
  }
  revalidatePath("/profile");
}

export async function setResumeBookOptIn(formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "member") throw new Error("Members only");
  const supabase = await createClient();
  const optIn = formData.get("opt_in") === "true";

  const { data, error } = await supabase
    .from("profiles")
    .update({ resume_book_opt_in: optIn })
    .eq("id", profile.id)
    .select("id");

  if (error) throw new Error(error.message);
  // A silently dropped write here would tell a member their consent was
  // withdrawn while sponsors could still see them. Never report success.
  if (!data?.length) {
    denyRedirect(
      "/profile",
      optIn
        ? "Your resume book opt-in was not saved. You are still opted out."
        : "Your resume book consent was NOT withdrawn. Nothing changed — try again, and tell a QUANTT exec if it keeps failing.",
    );
  }
  revalidatePath("/profile");
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function numOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
