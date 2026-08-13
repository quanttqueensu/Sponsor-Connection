"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

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
  await supabase
    .from("conversations")
    .update({ [col]: new Date().toISOString() })
    .eq("id", conversationId);

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
    .eq("id", conversationId);
  const { error } =
    profile.role === "company_user"
      ? await q
      : await q.eq("member_id", profile.id);
  if (error) throw new Error("Could not update conversation");
}
