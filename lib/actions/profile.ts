"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "member") throw new Error("Members only");
  const supabase = await createClient();
  const { error } = await supabase
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
    .eq("id", profile.id);
  if (error) throw new Error(error.message);
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
  const { error } = await supabase
    .from("profile_sections")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("member_id", profile.id);
  if (error) throw new Error(error.message);
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
  await supabase.from("profiles").update({ photo_path: path }).eq("id", profile.id);
  revalidatePath("/profile");
}

export async function setResumeBookOptIn(formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "member") throw new Error("Members only");
  const supabase = await createClient();
  const optIn = formData.get("opt_in") === "true";

  const { error } = await supabase
    .from("profiles")
    .update({ resume_book_opt_in: optIn })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);
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
