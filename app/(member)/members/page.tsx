import PageHeader from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function MembersPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, program, grad_year, bio, linkedin_url, photo_path")
    .eq("role", "member")
    .order("full_name");

  return (
    <>
      <PageHeader kicker="Club" title="Members" />
      <div className="grid gap-4 md:grid-cols-2">
        {(members as Profile[] | null)?.map((m) => (
          <Link
            key={m.id}
            href={`/members/${m.id}`}
            className="border border-white/10 p-5 hover:border-white/20"
          >
            <p className="font-heading text-lg font-bold text-white">{m.full_name}</p>
            <p className="mt-1 text-sm text-white/50">
              {[m.program, m.grad_year].filter(Boolean).join(" · ")}
            </p>
            {m.bio && <p className="mt-2 line-clamp-2 text-sm text-white/65">{m.bio}</p>}
          </Link>
        ))}
      </div>
    </>
  );
}
