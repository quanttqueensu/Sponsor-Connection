"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { denialMessage } from "@/lib/denials";
import { notify } from "@/lib/notify";
import { authCallbackUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { denyRedirect } from "./deny";

const MANUAL_INVITE_COOKIE = "hub_manual_invite";
/**
 * The cookie carries a working credential, so it is scoped to the only routes
 * that render it (/admin/invite and /admin/requests) rather than the whole
 * site, and it lives just long enough to survive the redirect that shows it.
 */
const MANUAL_INVITE_PATH = "/admin";
const MANUAL_INVITE_MAX_AGE = 120;

const JOIN_REQUEST_FAILED =
  "We could not submit that request right now. Check your details and try again, or email the QUANTT team directly.";

const INVITE_FAILED =
  "That invite could not be sent. Check the details and try again, or contact another exec if it keeps failing.";

/**
 * An error whose message is safe to show the user: it is copy this file wrote,
 * not text from Postgres or GoTrue. Anything else is reported generically so a
 * redirect target never reflects driver output back out of the app.
 */
class SafeError extends Error {}

/**
 * The address already has an auth account.
 *
 * This is a refusal, never a fallback. An invite must never touch an account
 * that already exists: doing so would let any exec type a colleague's address
 * and be handed a working password for their account. Callers report it and
 * undo whatever they staged; nothing about the existing user is modified.
 */
class AlreadyRegisteredError extends Error {
  constructor() {
    super("Email already registered");
  }
}

/**
 * True for Next's redirect()/notFound() control-flow throws, which must be
 * rethrown rather than reported as an invite failure.
 */
function isControlFlowError(e: unknown) {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND)/.test(digest);
}

type InviteResult = { via: "email" } | { via: "manual"; password: string };

function randomPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function isUniqueViolation(message: string, code?: string) {
  return code === "23505" || /duplicate|unique/i.test(message);
}

function isEmailRateLimited(message: string) {
  return /rate limit|over_email_send_rate_limit/i.test(message);
}

async function stashManualInvite(email: string, password: string, adminId: string) {
  const store = await cookies();
  store.set(MANUAL_INVITE_COOKIE, JSON.stringify({ email, password, adminId }), {
    httpOnly: true,
    sameSite: "lax",
    // Plaintext credential: never let it travel over plain http in production.
    secure: process.env.NODE_ENV === "production",
    maxAge: MANUAL_INVITE_MAX_AGE,
    path: MANUAL_INVITE_PATH,
  });
}

function forgetManualInvite(store: Awaited<ReturnType<typeof cookies>>) {
  // readManualInvite runs during a Server Component render, where Next refuses
  // cookie writes. Best-effort here; ManualInviteBanner calls
  // clearManualInvite() from the client so the delete actually lands.
  try {
    store.set(MANUAL_INVITE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: MANUAL_INVITE_PATH,
    });
  } catch {
    // Server Component render: the client-side clear is the real one.
  }
}

/**
 * Hand back the one-time password stashed by the invite that just ran.
 *
 * This is an exported server action, i.e. a callable endpoint, so it checks
 * admin rights itself rather than trusting the page that calls it, and it
 * only answers the admin who created the stash -- a cookie on a shared exec
 * laptop is not proof that the person at the keyboard is the inviter.
 */
export async function readManualInvite() {
  const profile = await requireProfile().catch(() => null);
  if (!profile?.is_admin) return null;

  const store = await cookies();
  const raw = store.get(MANUAL_INVITE_COOKIE)?.value;
  if (!raw) return null;
  forgetManualInvite(store);
  try {
    const parsed = JSON.parse(raw) as {
      email?: string;
      password?: string;
      adminId?: string;
    };
    if (!parsed.email || !parsed.password) return null;
    if (parsed.adminId !== profile.id) return null;
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}

/** Drop the stashed password once the banner has rendered it. */
export async function clearManualInvite() {
  const profile = await requireProfile().catch(() => null);
  if (!profile?.is_admin) return;
  forgetManualInvite(await cookies());
}

async function markInviteNeedsPassword(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  appMetadata: Record<string, unknown> | undefined,
) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...(appMetadata ?? {}),
      must_set_password: true,
    },
  });
  if (error) throw new Error(error.message);
}

/**
 * Create a brand-new account with a generated password, for when GoTrue will
 * not send the invite email (rate limit). Only ever creates: if the address
 * turns out to already exist, this refuses rather than reaching for the
 * existing row, so no code path here can hand an admin a password to someone
 * else's account.
 */
async function createUserWithoutEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<InviteResult> {
  const password = randomPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { must_set_password: true },
  });
  if (!error && data.user) return { via: "manual", password };

  if (error && /already/i.test(error.message)) throw new AlreadyRegisteredError();

  throw new Error(error?.message ?? "Could not create user");
}

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
): Promise<InviteResult> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: authCallbackUrl(),
  });
  if (!error && data.user) {
    await markInviteNeedsPassword(admin, data.user.id, data.user.app_metadata);
    return { via: "email" };
  }

  const message = error?.message ?? "Invite failed";

  // "Already registered / already invited" means an account exists. Refuse.
  // The generated-password fallback below is only ever safe for an address
  // that has no account yet; running it here would reset a colleague's
  // password and hand it to whoever typed their email into this form.
  if (/already been (registered|invited)/i.test(message)) {
    throw new AlreadyRegisteredError();
  }

  // A genuine send-rate limit: the account does not exist, GoTrue just will
  // not mail it. Creating it with a temporary password to read out is fine.
  if (isEmailRateLimited(message)) return createUserWithoutEmail(admin, email);

  throw new Error(message);
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
    if (isControlFlowError(e)) throw e;
    // /join is public and unauthenticated. The pending-email unique index means
    // a duplicate submission comes back as a 23505 naming the constraint, so
    // echoing the driver text would confirm whether an address has already
    // requested access (email enumeration) and disclose schema besides. One
    // fixed message for every failure, distinguishing nothing.
    redirect(`/join?error=${encodeURIComponent(JOIN_REQUEST_FAILED)}`);
  }
  redirect("/join?sent=1");
}

async function finishInvite(
  email: string,
  adminId: string,
  result: InviteResult,
): Promise<never> {
  revalidatePath("/admin/invite");
  revalidatePath("/admin/people");
  revalidatePath("/admin/companies");
  if (result.via === "manual") {
    await stashManualInvite(email, result.password, adminId);
    redirect("/admin/invite?manual=1");
  }
  redirect("/admin/invite?sent=1");
}

export async function invitePerson(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  let result: InviteResult = { via: "email" };
  let profileId = "";
  // The invites row has to exist before the auth user is created --
  // handle_new_user() raises 'Invite required' otherwise -- so it is inserted
  // first and removed again if the invite does not go out. Only a row this
  // call actually inserted is removed; a pre-existing pending invite (unique
  // violation, id stays null) is left alone.
  let insertedInviteId: string | null = null;
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    const profile = await requireProfile();
    if (!profile.is_admin) throw new SafeError("Admins only");
    profileId = profile.id;
    const kind = String(formData.get("kind") ?? "member");
    const fullName = String(formData.get("full_name") ?? "").trim();
    if (!email || !fullName) throw new SafeError("Name and email are required");

    admin = createAdminClient();

    if (kind === "company") {
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
      if (!companyId) {
        throw new SafeError("Choose an existing firm or enter a new company name");
      }
      const { data: row, error: invErr } = await admin
        .from("invites")
        .insert({
          email,
          full_name: fullName,
          role: "company_user",
          company_id: companyId,
          invited_by: profile.id,
        })
        .select("id")
        .maybeSingle();
      if (invErr && !isUniqueViolation(invErr.message, invErr.code)) {
        throw new Error(invErr.message);
      }
      insertedInviteId = row?.id ?? null;
    } else if (kind === "member" || kind === "admin") {
      const { data: row, error: invErr } = await admin
        .from("invites")
        .insert({
          email,
          full_name: fullName,
          role: "member",
          is_admin: kind === "admin",
          invited_by: profile.id,
        })
        .select("id")
        .maybeSingle();
      if (invErr && !isUniqueViolation(invErr.message, invErr.code)) {
        throw new Error(invErr.message);
      }
      insertedInviteId = row?.id ?? null;
    } else {
      throw new SafeError("Choose member, admin, or company");
    }

    result = await sendAuthInvite(admin, email);
  } catch (e) {
    if (isControlFlowError(e)) throw e;
    // Nothing was invited, so do not leave a row sitting in "Waiting to join"
    // forever. Best-effort: a failed cleanup must not replace the real reason.
    if (admin && insertedInviteId) {
      await admin
        .from("invites")
        .delete()
        .eq("id", insertedInviteId)
        .then(undefined, () => undefined);
      revalidatePath("/admin/invite");
    }
    // Same rule as /join: only this file's own copy reaches the URL. A raw
    // Postgres or GoTrue message here would put constraint and schema detail
    // into a query string (and into any log or referrer that carries it).
    const message =
      e instanceof AlreadyRegisteredError
        ? denialMessage("invite_email_already_registered")
        : e instanceof SafeError
          ? e.message
          : INVITE_FAILED;
    redirect(`/admin/invite?error=${encodeURIComponent(message)}`);
  }
  return finishInvite(email, profileId, result);
}

export async function reviewJoinRequest(formData: FormData) {
  const profile = await requireProfile();
  if (!profile.is_admin) throw new Error("Admins only");
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  const supabase = await createClient();
  if (decision === "rejected") {
    const { data, error } = await supabase
      .from("company_join_requests")
      .update({
        status: "rejected",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        admin_note: emptyToNull(formData.get("admin_note")),
      })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) {
      // This update has no status filter, so an already-reviewed row still
      // matches and returns a row. Zero rows can only mean the request was
      // deleted, or RLS refused the write.
      denyRedirect("/admin/requests", "join_request_reject_failed");
    }
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

  const { data: inviteRow, error: inviteRowErr } = await admin
    .from("invites")
    .insert({
      email: req.contact_email,
      full_name: req.contact_name,
      role: "company_user",
      company_id: company.id,
      invited_by: profile.id,
    })
    .select("id")
    .maybeSingle();
  if (inviteRowErr && !isUniqueViolation(inviteRowErr.message, inviteRowErr.code)) {
    throw new Error(inviteRowErr.message);
  }

  let invite: InviteResult | null = null;
  try {
    invite = await sendAuthInvite(admin, req.contact_email);
  } catch (e) {
    if (!(e instanceof AlreadyRegisteredError)) throw e;
    // The contact already has an account, so there is nothing to invite and
    // certainly nothing to reset. Drop the invite row this call just added so
    // it does not sit in "Waiting to join" forever waiting for a signup that
    // can never happen, and say so below.
    if (inviteRow?.id) {
      await admin
        .from("invites")
        .delete()
        .eq("id", inviteRow.id)
        .then(undefined, () => undefined);
    }
  }
  if (invite?.via === "manual") {
    await stashManualInvite(req.contact_email, invite.password, profile.id);
  }

  const { data: approved, error: updErr } = await admin
    .from("company_join_requests")
    .update({
      status: "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      company_id: company.id,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (updErr) throw new Error(updErr.message);
  revalidatePath("/admin/requests");
  revalidatePath("/admin/companies");
  revalidatePath("/admin/invite");
  // The .eq("status", "pending") filter means zero rows here is a race: another
  // admin reviewed this request between the check above and now. The firm and
  // the invite were still created, so say so rather than reporting success.
  if (!approved?.length) {
    denyRedirect("/admin/requests", "join_request_review_race");
  }
  if (!invite) {
    denyRedirect("/admin/requests", "join_request_contact_already_registered");
  }
  if (invite.via === "manual") {
    redirect("/admin/invite?manual=1");
  }
}

export async function toggleSponsor(formData: FormData) {
  const profile = await requireProfile();
  if (!profile.is_admin) throw new Error("Admins only");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ is_sponsor: formData.get("is_sponsor") === "true" })
    .eq("id", String(formData.get("id")))
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) {
    denyRedirect("/admin/companies", "sponsor_toggle_failed");
  }
  revalidatePath("/admin/companies");
}

function emptyToNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}
