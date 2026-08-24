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
    if (error) throw new Error(error.message);
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

export async function sendMessage(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const conversationId = String(formData.get("conversation_id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Message cannot be empty");
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: profile.id,
    body,
  });
  if (error) throw new Error(error.message);

  const col =
    profile.role === "company_user" ? "company_last_read_at" : "member_last_read_at";
  const { data: touched, error: touchErr } = await supabase
    .from("conversations")
    .update({ [col]: new Date().toISOString() })
    .eq("id", conversationId)
    .select("id");
  if (touchErr) throw new Error(touchErr.message);

  await notify({
    type: "message",
    to: [],
    subject: "New message on QUANTT Hub",
    body,
  });
  revalidatePath("/messages");
  revalidatePath("/company/messages");

  // The message itself is sent; only the read marker was refused. Say so on
  // the thread rather than reporting a clean send.
  if (!touched?.length) {
    const threadPath =
      profile.role === "company_user"
        ? `/company/messages/${conversationId}`
        : `/messages/${conversationId}`;
    denyRedirect(threadPath, "message_read_marker_failed");
  }
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
