import type { ReactNode } from "react";
import HubNav from "@/components/HubNav";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function CompanyLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "company_user") redirect("/feed");

  const supabase = await createClient();
  const { data: cu } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  let unread = 0;
  if (cu) {
    const { data: convos } = await supabase
      .from("conversations")
      .select("id, company_last_read_at, messages(created_at)")
      .eq("company_id", cu.company_id);
    unread = (convos ?? []).filter((c) => {
      const last = (c.messages as { created_at: string }[] | null)?.at(-1)?.created_at;
      if (!last) return false;
      return !c.company_last_read_at || last > c.company_last_read_at;
    }).length;
  }

  return (
    <>
      <HubNav profile={profile} unread={unread} />
      <div className="mx-auto max-w-6xl px-5 py-10">{children}</div>
    </>
  );
}
