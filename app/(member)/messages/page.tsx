import PageHeader from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function MessagesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: convos } = await supabase
    .from("conversations")
    .select("*, companies(name)")
    .eq("member_id", profile.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader kicker="Inbox" title="Messages" />
      <ul>
        {(convos as Conversation[] | null)?.map((c) => (
          <li key={c.id} className="border-t border-white/10">
            <Link href={`/messages/${c.id}`} className="block py-4 text-white hover:text-blue-light">
              {c.companies?.name ?? "Company"}
            </Link>
          </li>
        ))}
      </ul>
      {!(convos ?? []).length && (
        <p className="text-sm text-white/45">No threads yet. Message a company from a post.</p>
      )}
    </>
  );
}
