import PageHeader from "@/components/PageHeader";
import PostCard from "@/components/PostCard";
import { createClient } from "@/lib/supabase/server";
import type { Post, PostKind, RoleType } from "@/lib/types";
import Link from "next/link";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    role_type?: string;
    term?: string;
    company?: string;
    location?: string;
    sponsor?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("posts")
    .select("*, companies(*)")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (sp.kind) query = query.eq("kind", sp.kind);
  if (sp.role_type) query = query.eq("role_type", sp.role_type);
  if (sp.location) query = query.ilike("location", `%${sp.location}%`);
  if (sp.company) query = query.eq("company_id", sp.company);
  if (sp.term) {
    const [season, year] = sp.term.split("-");
    if (season && year) {
      query = query.eq("term_season", season).eq("term_year", Number(year));
    }
  }

  const { data: posts } = await query;
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, is_sponsor")
    .eq("status", "active")
    .order("name");

  let list = (posts ?? []) as Post[];
  if (sp.sponsor === "1") {
    list = list.filter((p) => p.companies?.is_sponsor);
  }

  const kinds: PostKind[] = ["job", "job_link", "event", "announcement", "connection"];
  const roles: RoleType[] = ["full_time", "internship", "coop"];

  return (
    <>
      <PageHeader kicker="Hub" title="Feed">
        Jobs, events, connections, and listings from QUANTT and partner firms.
      </PageHeader>
      <form className="mb-8 grid gap-3 md:grid-cols-5">
        <select name="kind" defaultValue={sp.kind ?? ""} className="rounded px-3 py-2 text-sm">
          <option value="">All types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          name="role_type"
          defaultValue={sp.role_type ?? ""}
          className="rounded px-3 py-2 text-sm"
        >
          <option value="">Any role type</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", "-")}
            </option>
          ))}
        </select>
        <select name="company" defaultValue={sp.company ?? ""} className="rounded px-3 py-2 text-sm">
          <option value="">All companies</option>
          {(companies ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          name="location"
          defaultValue={sp.location ?? ""}
          placeholder="Location"
          className="rounded px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-xs uppercase tracking-wider text-white"
        >
          Filter
        </button>
      </form>
      <div>
        {list.length === 0 && <p className="text-sm text-white/45">No posts yet.</p>}
        {list.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      <p className="mt-10 text-sm text-white/35">
        Applied off-platform?{" "}
        <Link href="/applications" className="text-blue-light">
          Log it
        </Link>
      </p>
    </>
  );
}
