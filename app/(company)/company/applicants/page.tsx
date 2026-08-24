import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Application } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: cu } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!cu) redirect("/company");
  const { data: apps } = await supabase
    .from("applications")
    .select("*, posts(title), profiles(full_name)")
    .eq("kind", "in_app")
    .eq("company_id", cu.company_id)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader kicker="Hiring" title="Applicants" />
      <Notice message={sp.denied} />
      <ul>
        {(apps as Application[] | null)?.map((a) => (
          <li key={a.id} className="border-t border-white/10 py-4">
            <p className="text-white">{a.profiles?.full_name}</p>
            <p className="text-sm text-white/45">
              {a.posts?.title} · {a.stage}
            </p>
            {a.post_id && (
              <Link href={`/company/posts/${a.post_id}`} className="text-xs text-blue-light">
                Open posting
              </Link>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
