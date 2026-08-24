"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isInAppJob, type Post } from "@/lib/types";
import { denyRedirect } from "./deny";

const STAGES = ["submitted", "reviewing", "interviewing", "offer", "closed"] as const;

export async function applyToJob(formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "member") throw new Error("Members only");
  const supabase = await createClient();
  const postId = String(formData.get("post_id"));
  const packageId = String(formData.get("package_id"));

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .single();
  if (postErr || !post) throw new Error("Post not found");
  if (!isInAppJob(post as Post)) throw new Error("Apply is only allowed on open in-app jobs");

  const { data: pack, error: packErr } = await supabase
    .from("hiring_packages")
    .select("*")
    .eq("id", packageId)
    .eq("member_id", profile.id)
    .single();
  if (packErr || !pack) throw new Error("Choose a hiring package");

  const coverMode = String(formData.get("cover_mode") ?? "default");
  let coverLetter = pack.cover_letter as string | null;
  let coverPath: string | null = null;
  const appId = crypto.randomUUID();
  const admin = createAdminClient();

  if (coverMode === "none") {
    coverLetter = null;
  } else if (coverMode === "write") {
    coverLetter = String(formData.get("cover_letter") ?? "").trim() || null;
  } else if (coverMode === "upload") {
    const file = formData.get("cover_pdf") as File | null;
    if (!file || file.size === 0) throw new Error("Upload a cover letter PDF");
    if (file.type !== "application/pdf") throw new Error("Cover letter must be a PDF");
    if (file.size > 5 * 1024 * 1024) throw new Error("Cover letter must be under 5MB");
    coverPath = `snapshots/${appId}/cover.pdf`;
    const { error } = await admin.storage.from("resumes").upload(coverPath, file, {
      contentType: "application/pdf",
    });
    if (error) throw new Error(error.message);
    coverLetter = null;
  }

  const snapResume = `snapshots/${appId}/resume.pdf`;
  const { error: copyErr } = await admin.storage
    .from("resumes")
    .copy(pack.resume_path, snapResume);
  if (copyErr) throw new Error(copyErr.message);

  let snapCover = coverPath;
  if (coverMode === "default" && pack.cover_letter_path) {
    snapCover = `snapshots/${appId}/cover.pdf`;
    await admin.storage.from("resumes").copy(pack.cover_letter_path, snapCover);
  }

  const { error } = await supabase.from("applications").insert({
    id: appId,
    member_id: profile.id,
    kind: "in_app",
    post_id: postId,
    company_id: post.company_id,
    package_id: pack.id,
    package_name: pack.name,
    linkedin_url: pack.linkedin_url,
    resume_path: snapResume,
    cover_letter: coverLetter,
    cover_letter_path: snapCover,
    stage: "submitted",
  });
  if (error) throw new Error(error.message);
  await notify({
    type: "application",
    to: [],
    subject: "New application",
    body: `${profile.full_name} applied to ${post.title}`,
  });
  revalidatePath("/feed");
  revalidatePath("/applications");
}

export async function logOffPlatform(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("applications").insert({
    member_id: profile.id,
    kind: "off_platform",
    post_id: emptyToNull(formData.get("post_id")),
    company_id: emptyToNull(formData.get("company_id")),
    company_name: String(formData.get("company_name") ?? "").trim(),
    stage: "submitted",
    notes: emptyToNull(formData.get("notes")),
  });
  if (error) {
    if (error.code === "23505") {
      denyRedirect("/applications", "You've already logged an application to that posting.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/applications");
}

export async function updateApplicationStage(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const stage = String(formData.get("stage"));

  if (!STAGES.includes(stage as (typeof STAGES)[number])) {
    denyRedirect("/applications", "That is not a valid application stage.");
  }

  const { data, error } = await supabase
    .from("applications")
    .update({ stage })
    .eq("id", id)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) {
    denyRedirect(
      profile.role === "company_user"
        ? "/company/applicants"
        : profile.is_admin
          ? "/admin/applications"
          : "/applications",
      "That application could not be updated.",
    );
  }

  revalidatePath("/applications");
  revalidatePath("/company");
  revalidatePath("/admin/applications");
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}
