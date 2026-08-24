"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PostKind } from "@/lib/types";
import { denyRedirect } from "./deny";

export async function createPost(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const kind = String(formData.get("kind")) as PostKind;
  const postFormPath =
    profile.role === "company_user" ? "/company/posts/new" : "/admin/posts";

  const parsedUrl = httpUrlOrNull(formData.get("external_url"));
  if (parsedUrl === INVALID_URL) {
    denyRedirect(
      postFormPath,
      "That external listing URL isn't valid. Use a full http:// or https:// web address, or leave it blank.",
    );
  }
  const externalUrl = parsedUrl;

  let companyId: string | null = emptyToNull(formData.get("company_id"));
  if (profile.role === "company_user") {
    const { data } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("profile_id", profile.id)
      .single();
    companyId = data?.company_id ?? null;
    if (!companyId) throw new Error("No company on this account");
    if (!["job", "job_link", "event", "announcement"].includes(kind)) {
      throw new Error("Companies cannot create that post type");
    }
  } else if (!profile.is_admin) {
    throw new Error("Only companies and admins can post");
  }

  const roleType = emptyToNull(formData.get("role_type"));
  const termSeason = emptyToNull(formData.get("term_season"));
  const termYear = Number(formData.get("term_year")) || null;

  const isInApp = kind === "job" && !externalUrl;
  if (isInApp && (!roleType || !termSeason || !termYear)) {
    denyRedirect(
      postFormPath,
      "In-app jobs need a role type, term season, and term year. Add an external listing URL instead if you want to link out.",
    );
  }

  // job_link_has_url (0001_init.sql:133) requires external_url on a job_link.
  // Without this guard a blank URL reaches the database and crashes.
  if (kind === "job_link" && !externalUrl) {
    denyRedirect(
      postFormPath,
      "A job link needs an external listing URL. Add one, or post it as a job to take applications in the hub.",
    );
  }

  const { error } = await supabase.from("posts").insert({
    author_id: profile.id,
    company_id: companyId,
    kind,
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    location: emptyToNull(formData.get("location")),
    starts_at: emptyToNull(formData.get("starts_at")),
    published: true,
    status: "open",
    role_type: isInApp ? roleType : null,
    term_season: isInApp ? termSeason : null,
    term_year: isInApp ? termYear : null,
    external_url: kind === "job_link" || kind === "job" ? externalUrl : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/feed");
  revalidatePath("/company");
  revalidatePath("/admin");
  redirect(profile.role === "company_user" ? "/company" : "/admin/posts");
}

export async function addComment(formData: FormData) {
  const profile = await requireProfile();
  if (profile.role !== "member") throw new Error("Members only");
  const supabase = await createClient();
  const { error } = await supabase.from("post_comments").insert({
    post_id: String(formData.get("post_id")),
    author_id: profile.id,
    body: String(formData.get("body") ?? "").trim(),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/feed/${String(formData.get("post_id"))}`);
}

export async function closePost(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const id = String(formData.get("id"));

  const { data, error } = await supabase
    .from("posts")
    .update({ status: "closed" })
    .eq("id", id)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) {
    denyRedirect(
      profile.role === "company_user"
        ? "/company"
        : profile.is_admin
          ? "/admin/posts"
          : "/feed",
      "That post could not be closed. It may belong to another firm.",
    );
  }

  revalidatePath("/company");
  revalidatePath("/feed");
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

/**
 * Sentinel for a URL the user typed that we will not accept. The browser's
 * type="url" check is looser than the protocol check below (it lets ftp://
 * through), so a bad value is a correctable user mistake, not an exceptional
 * state — the caller surfaces it with denyRedirect rather than crashing.
 */
const INVALID_URL = Symbol("invalid-url");

function httpUrlOrNull(
  v: FormDataEntryValue | null,
): string | null | typeof INVALID_URL {
  const s = emptyToNull(v);
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return INVALID_URL;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return INVALID_URL;
  return u.toString();
}
