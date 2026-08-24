"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { denyRedirect } from "./deny";

export async function createPackage(formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "member") throw new Error("Members only");
  const file = formData.get("resume") as File | null;
  if (!file || file.size === 0) throw new Error("Upload a resume PDF");
  if (file.type !== "application/pdf") throw new Error("Resume must be a PDF");
  if (file.size > 5 * 1024 * 1024) throw new Error("Resume must be under 5MB");

  const supabase = await createClient();
  const id = crypto.randomUUID();
  const resumePath = `${profile.id}/packages/${id}/resume.pdf`;
  const { error: upErr } = await supabase.storage.from("resumes").upload(resumePath, file, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);

  let coverPath: string | null = null;
  const coverFile = formData.get("cover_pdf") as File | null;
  if (coverFile && coverFile.size > 0) {
    if (coverFile.type !== "application/pdf") throw new Error("Cover letter file must be a PDF");
    coverPath = `${profile.id}/packages/${id}/cover.pdf`;
    const { error } = await supabase.storage.from("resumes").upload(coverPath, coverFile, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (error) throw new Error(error.message);
  }

  const { error } = await supabase.from("hiring_packages").insert({
    id,
    member_id: profile.id,
    name: String(formData.get("name") ?? "").trim(),
    linkedin_url: String(formData.get("linkedin_url") ?? "").trim(),
    resume_path: resumePath,
    cover_letter: emptyToNull(formData.get("cover_letter")),
    cover_letter_path: coverPath,
    is_default: formData.get("is_default") === "on",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/packages");
}

export async function setDefaultPackage(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hiring_packages")
    .update({ is_default: true })
    .eq("id", String(formData.get("id")))
    .eq("member_id", profile.id)
    .select("id");
  if (error) throw new Error(error.message);
  // Owner-scoped, matching the RLS policy exactly, so zero rows means the
  // package is gone rather than that it belongs to someone else.
  if (!data?.length) {
    denyRedirect("/packages", "That package no longer exists, so it was not made your default.");
  }
  revalidatePath("/packages");
}

export async function deletePackage(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hiring_packages")
    .delete()
    .eq("id", String(formData.get("id")))
    .eq("member_id", profile.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) {
    denyRedirect("/packages", "That package no longer exists.");
  }
  revalidatePath("/packages");
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}
