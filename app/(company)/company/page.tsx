import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import { closePost } from "@/lib/actions/posts";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Company, Post } from "@/lib/types";
import { kindLabel, one } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function CompanyHome({
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
    .select("company_id, companies(*)")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!cu) {
    return <p className="text-white/60">This account is not attached to a company.</p>;
  }
  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .eq("company_id", cu.company_id)
    .order("created_at", { ascending: false });

  const company = one(cu.companies as Company | Company[] | null);

  return (
    <>
      <PageHeader kicker="Company" title={company?.name ?? "Your posts"}>
        You only see posts from your firm. Members see these on the global feed.
      </PageHeader>
      <Notice message={sp.denied} />
      <Link
        href="/company/posts/new"
        className="inline-block rounded bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white"
      >
        New post
      </Link>
      <ul className="mt-8">
        {(posts as Post[] | null)?.map((p) => (
          <li key={p.id} className="border-t border-white/10 py-4">
            <Link href={`/company/posts/${p.id}`} className="text-white hover:text-blue-light">
              {p.title}{" "}
              <span className="text-xs text-white/40">
                {kindLabel(p.kind)} · {p.status}
              </span>
            </Link>
            {p.status === "open" && (
              <form action={closePost} className="mt-1">
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs uppercase tracking-wider text-white/35">Close</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
