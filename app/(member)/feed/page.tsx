import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import PostCard from "@/components/PostCard";
import { createClient } from "@/lib/supabase/server";
import { kindLabel, roleTypeLabel, type Post, type PostKind, type RoleType } from "@/lib/types";
import Link from "next/link";
import { formatDate } from "./_time";

const PAGE_SIZE = 20;

type FeedSearchParams = {
  kind?: string;
  role_type?: string;
  term?: string;
  company?: string;
  location?: string;
  sponsor?: string;
  page?: string;
  denied?: string;
};

/** Rebuild the feed URL, keeping every active filter and swapping the page. */
function feedHref(sp: FeedSearchParams, page: number) {
  const qs = new URLSearchParams();
  for (const key of ["kind", "role_type", "term", "company", "location", "sponsor"] as const) {
    const value = sp[key];
    if (value) qs.set(key, value);
  }
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `/feed?${s}` : "/feed";
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const sponsorOnly = sp.sponsor === "1";
  const parsedPage = Number(sp.page);
  const page = Number.isFinite(parsedPage) && parsedPage > 1 ? Math.floor(parsedPage) : 1;
  const from = (page - 1) * PAGE_SIZE;

  // "Sponsor" lives on the joined company row, so push the filter into the
  // query with an inner join rather than fetching everything and filtering in
  // JS. An inner join is also the right semantics: a post with no company can
  // never be a sponsor post.
  let query = supabase
    .from("posts")
    .select(sponsorOnly ? "*, companies!inner(*)" : "*, companies(*)")
    .eq("published", true)
    .order("created_at", { ascending: false })
    // One extra row tells us whether a next page exists without a count query.
    .range(from, from + PAGE_SIZE);

  if (sponsorOnly) query = query.eq("companies.is_sponsor", true);
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

  const fetched = (posts ?? []) as unknown as Post[];
  const hasNext = fetched.length > PAGE_SIZE;
  const list = hasNext ? fetched.slice(0, PAGE_SIZE) : fetched;

  const kinds: PostKind[] = ["job", "job_link", "event", "announcement", "connection"];
  const roles: RoleType[] = ["full_time", "internship", "coop"];
  const hasFilters = Boolean(
    sp.kind || sp.role_type || sp.term || sp.company || sp.location || sp.sponsor,
  );

  return (
    <>
      <PageHeader kicker="Hub" title="Feed">
        Jobs, events, connections, and listings from QUANTT and partner firms.
      </PageHeader>
      <Notice message={sp.denied} />
      <form className="mb-8 grid gap-3 md:grid-cols-5">
        <select
          name="kind"
          aria-label="Post type"
          defaultValue={sp.kind ?? ""}
          className="rounded px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
        <select
          name="role_type"
          aria-label="Role type"
          defaultValue={sp.role_type ?? ""}
          className="rounded px-3 py-2 text-sm"
        >
          <option value="">Any role type</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleTypeLabel(r)}
            </option>
          ))}
        </select>
        <select
          name="company"
          aria-label="Company"
          defaultValue={sp.company ?? ""}
          className="rounded px-3 py-2 text-sm"
        >
          <option value="">All companies</option>
          {(companies ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          name="location"
          aria-label="Location"
          defaultValue={sp.location ?? ""}
          placeholder="Location"
          className="rounded px-3 py-2 text-sm"
        />
        {sp.term && <input type="hidden" name="term" value={sp.term} />}
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            name="sponsor"
            value="1"
            defaultChecked={sponsorOnly}
            className="h-4 w-4"
          />
          Sponsors only
        </label>
        <button
          type="submit"
          className="min-h-11 rounded bg-primary px-4 py-2 text-xs uppercase tracking-wider text-white"
        >
          Filter
        </button>
        {hasFilters && (
          <Link
            href="/feed"
            className="inline-flex min-h-11 items-center justify-center rounded border border-white/15 px-4 py-2 text-xs uppercase tracking-wider text-white/70 hover:border-white/30 hover:text-white"
          >
            Clear filters
          </Link>
        )}
      </form>
      <div>
        {list.length === 0 && (
          <p className="text-sm text-white/60">
            {hasFilters ? "No posts match these filters." : "No posts yet."}
          </p>
        )}
        {list.map((post) => (
          <div key={post.id}>
            <PostCard post={post} />
            <p className="-mt-4 pb-4 text-[11px] text-white/45">
              Posted <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
            </p>
          </div>
        ))}
      </div>

      {(page > 1 || hasNext) && (
        <nav aria-label="Feed pages" className="mt-8 flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={feedHref(sp, page - 1)} className="text-blue-light">
              ← Newer
            </Link>
          ) : (
            <span className="text-white/30">← Newer</span>
          )}
          <span className="text-white/50">Page {page}</span>
          {hasNext ? (
            <Link href={feedHref(sp, page + 1)} className="text-blue-light">
              Older →
            </Link>
          ) : (
            <span className="text-white/30">Older →</span>
          )}
        </nav>
      )}

      <p className="mt-10 text-sm text-white/60">
        Applied off-platform?{" "}
        <Link href="/applications" className="text-blue-light">
          Log it
        </Link>
      </p>
    </>
  );
}
