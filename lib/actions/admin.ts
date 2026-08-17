"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { authCallbackUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

async function sendAuthInvite(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: authCallbackUrl(),
  });
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user) return;
  const { error: metaErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      must_set_password: true,
    },
  });
  if (metaErr) throw new Error(metaErr.message);
}

export async function requestAccess(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("company_join_requests").insert({
    company_name: String(formData.get("company_name") ?? "").trim(),
    website: emptyToNull(formData.get("website")),
    contact_name: String(formData.get("contact_name") ?? "").trim(),
    contact_email: String(formData.get("contact_email") ?? "").trim(),
    note: emptyToNull(formData.get("note")),
    status: "pending",
  });
  if (error) throw new Error(error.message);
  await notify({
    type: "join_request",
    to: [],
    subject: "Company access request",
    body: String(formData.get("company_name")),
  });
}

export async function submitCompanyRequest(formData: FormData) {
  try {
    await requestAccess(formData);
  } catch (e) {
    redirect(`/join?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect("/join?sent=1");
}

export async function inviteMember(formData: FormData) {
  try {
    const profile = await requireProfile();
    if (!profile.is_admin) throw new Error("Admins only");
    const email = String(formData.get("email") ?? "").trim();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const isAdmin = formData.get("is_admin") === "on";
    const admin = createAdminClient();
    const { error: invErr } = await admin.from("invites").insert({
      email,
      full_name: fullName,
      role: "member",
      is_admin: isAdmin,
      invited_by: profile.id,
    });
    if (invErr) throw new Error(invErr.message);
    await sendAuthInvite(admin, email);
  } catch (e) {
    redirect(`/admin/people?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/admin/people");
  redirect("/admin/people?sent=1");
}

export async function inviteCompany(formData: FormData) {
  try {
    const profile = await requireProfile();
    if (!profile.is_admin) throw new Error("Admins only");
    const admin = createAdminClient();
    let companyId = emptyToNull(formData.get("company_id"));
    const newName = String(formData.get("new_company_name") ?? "").trim();
    if (!companyId && newName) {
      const { data, error } = await admin
        .from("companies")
        .insert({
          name: newName,
          slug: slugify(newName) + "-" + Math.random().toString(36).slice(2, 6),
          is_sponsor: formData.get("is_sponsor") === "on",
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      companyId = data.id;
    }
    if (!companyId) throw new Error("Choose or create a company");
    const email = String(formData.get("email") ?? "").trim();
    const { error: invErr } = await admin.from("invites").insert({
      email,
      full_name: String(formData.get("full_name") ?? "").trim(),
      role: "company_user",
      company_id: companyId,
      invited_by: profile.id,
    });
    if (invErr) throw new Error(invErr.message);
    await sendAuthInvite(admin, email);
  } catch (e) {
    redirect(`/admin/companies?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/admin/companies");
  redirect("/admin/companies?sent=1");
}

export async function reviewJoinRequest(formData: FormData) {
  const profile = await requireProfile();
  if (!profile.is_admin) throw new Error("Admins only");
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  const supabase = await createClient();
  if (decision === "rejected") {
    const { error } = await supabase
      .from("company_join_requests")
      .update({
        status: "rejected",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        admin_note: emptyToNull(formData.get("admin_note")),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/requests");
    return;
  }

  const { data: req } = await supabase
    .from("company_join_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request already reviewed");

  const admin = createAdminClient();
  const { data: company, error: cErr } = await admin
    .from("companies")
    .insert({
      name: req.company_name,
      slug: slugify(req.company_name) + "-" + crypto.randomUUID().slice(0, 4),
      is_sponsor: formData.get("is_sponsor") === "on",
      website: req.website,
      status: "active",
    })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);

  const { error: inviteRowErr } = await admin.from("invites").insert({
    email: req.contact_email,
    full_name: req.contact_name,
    role: "company_user",
    company_id: company.id,
    invited_by: profile.id,
  });
  if (inviteRowErr) throw new Error(inviteRowErr.message);
  await sendAuthInvite(admin, req.contact_email);

  const { error: updErr } = await admin
    .from("company_join_requests")
    .update({
      status: "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      company_id: company.id,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (updErr) throw new Error(updErr.message);
  revalidatePath("/admin/requests");
  revalidatePath("/admin/companies");
}

export async function toggleSponsor(formData: FormData) {
  const profile = await requireProfile();
  if (!profile.is_admin) throw new Error("Admins only");
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ is_sponsor: formData.get("is_sponsor") === "true" })
    .eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/admin/companies");
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}
