import Notice from "@/components/Notice";
import { markRead, sendMessage } from "@/lib/actions/messages";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Conversation, Message } from "@/lib/types";
import { PrimaryButton, TextArea } from "@/components/Form";
import { after } from "next/server";
import { notFound, redirect } from "next/navigation";

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ denied?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: convo } = await supabase
    .from("conversations")
    .select("*, companies(name)")
    .eq("id", id)
    .eq("member_id", profile.id)
    .maybeSingle();
  if (!convo) notFound();
  after(() => {
    void markRead(id);
  });
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at");

  const c = convo as Conversation;
  return (
    <>
      <h1 className="font-heading text-2xl font-bold text-white">{c.companies?.name}</h1>
      <Notice message={sp.denied} />
      <ul className="mt-8 space-y-4">
        {(messages as Message[] | null)?.map((m) => (
          <li key={m.id} className={m.sender_id === profile.id ? "text-right" : ""}>
            <p className="inline-block max-w-lg rounded border border-white/10 px-4 py-2 text-sm text-white/80">
              {m.body}
            </p>
          </li>
        ))}
      </ul>
      <form action={sendMessage} className="mt-8 max-w-lg space-y-3">
        <input type="hidden" name="conversation_id" value={id} />
        <TextArea name="body" rows={3} required />
        <PrimaryButton type="submit">Send</PrimaryButton>
      </form>
    </>
  );
}
