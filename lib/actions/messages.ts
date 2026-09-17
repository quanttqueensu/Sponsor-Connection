"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { denyRedirect } from "./deny";

export async function startConversation(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  let companyId = String(formData.get("company_id"));
  const memberId =
    profile.role === "member" ? profile.id : String(formData.get("member_id"));
  if (profile.role === "company_user") {
    const { data } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!data) throw new Error("No company on this account");
    companyId = data.company_id;
  }

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("member_id", memberId)
    .eq("company_id", companyId)
    .maybeSingle();

  const id = existing?.id;
  if (!id) {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ member_id: memberId, company_id: companyId })
      .select("id")
      .single();
    if (error || !data) {
      if (error?.code === "23505") {
        const { data: raced } = await supabase
          .from("conversations")
          .select("id")
          .eq("member_id", memberId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (raced?.id) {
          redirect(
            profile.role === "company_user"
              ? `/company/messages/${raced.id}`
              : `/messages/${raced.id}`,
          );
        }
      }
      denyRedirect(
        companyReturnPath(formData, profile.role),
        "conversation_start_forbidden",
      );
    }
    const path =
      profile.role === "company_user"
        ? `/company/messages/${data.id}`
        : `/messages/${data.id}`;
    redirect(path);
  }

  const path =
    profile.role === "company_user" ? `/company/messages/${id}` : `/messages/${id}`;
  redirect(path);
}

const MAX_MESSAGE_BODY = 4000;

export async function sendMessage(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const conversationId = String(formData.get("conversation_id"));
  const body = String(formData.get("body") ?? "").trim();
  const deniedPath =
    profile.role === "company_user"
      ? `/company/messages/${encodeURIComponent(conversationId)}`
      : `/messages/${encodeURIComponent(conversationId)}`;
  if (!body || body.length > MAX_MESSAGE_BODY) {
    denyRedirect(deniedPath, "message_invalid");
  }
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: profile.id,
    body,
  });
  if (error) throw new Error(error.message);

  const col =
    profile.role === "company_user" ? "company_last_read_at" : "member_last_read_at";
  // No zero-row branch here on purpose: the messages insert above already
  // passed, and for both roles conversations_member_update /
  // conversations_company_update are strictly weaker than the messages insert
  // policy, so a sender who could post into this thread can always stamp its
  // read marker. A refusal is unreachable rather than merely unlikely.
  const { error: touchErr } = await supabase
    .from("conversations")
    .update({ [col]: new Date().toISOString() })
    .eq("id", conversationId);
  if (touchErr) throw new Error(touchErr.message);

  await notify({
    type: "message",
    to: [],
    subject: "New message on QUANTT Hub",
    body,
  });
  revalidatePath("/messages");
  revalidatePath("/company/messages");
}

export async function markRead(conversationId: string) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const col =
    profile.role === "company_user" ? "company_last_read_at" : "member_last_read_at";
  const q = supabase
    .from("conversations")
    .update({ [col]: new Date().toISOString() })
    .eq("id", conversationId)
    .select("id");
  const { data, error } =
    profile.role === "company_user"
      ? await q
      : await q.eq("member_id", profile.id);
  if (error) throw new Error("Could not update conversation");
  // Deliberately NOT a denyRedirect: markRead is invoked from after() while a
  // page renders, where redirect() has no request to unwind. A refused read
  // marker is cosmetic — the thread render itself is already RLS-scoped — so
  // it is logged for the server operator instead of shown to the user.
  if (!data?.length) {
    console.warn(
      `markRead: conversation ${conversationId} refused for profile ${profile.id}`,
    );
  }
}

function companyReturnPath(
  formData: FormData,
  role: string,
) {
  if (role !== "company_user") return "/feed";
  const dest = String(formData.get("return_to") ?? "");
  if (dest.startsWith("/company/") && !dest.includes("//") && !dest.includes("\\")) {
    return dest;
  }
  return "/company/applicants";
}
