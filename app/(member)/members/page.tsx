import PageHeader from "@/components/PageHeader";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";

const PAGE_SIZE = 24;

type MemberCard = Pick<
  Profile,
  "id" | "full_name" | "program" | "grad_year" | "bio" | "linkedin_url" | "photo_path"
>;

/**
 * PostgREST applies its own max-rows ceiling and would silently truncate an
 * unbounded select, so the directory always asks for one explicit page and
 * reads the exact count to decide whether there is a next one.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  const sp = await searchParams;

  const q = String(sp.q ?? "").trim().slice(0, 80);
  const page = pageNumber(sp.page);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("id, full_name, program, grad_year, bio, linkedin_url, photo_path", {
      count: "exact",
    })
    .eq("role", "member");

  if (q) {
    // `or` takes a comma-separated filter list, so commas, parentheses and the
    // wildcard characters have to come out of the term before it is spliced in.
    const term = q.replace(/[,()*%\\]/g, " ").trim();
    if (term) query = query.or(`full_name.ilike.*${term}*,program.ilike.*${term}*`);
  }

  const { data: members, count, error: membersError } = await query
    .order("full_name")
    .range(from, from + PAGE_SIZE - 1);
  if (membersError) {
    console.error("members: query failed", membersError.message);
  }

  const rows = (members as MemberCard[] | null) ?? [];
  const total = count ?? 0;
  const hasPrev = page > 1;
  const hasNext = from + rows.length < total;
  const cards = rows.map((m) => ({
    ...m,
    photoUrl: m.photo_path ? `/members/${m.id}/photo` : null,
  }));

  return (
    <>
      <PageHeader kicker="Club" title="Members">
        {total > 0 && `${total} member${total === 1 ? "" : "s"}`}
      </PageHeader>

      <form method="get" className="mb-8 flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name or program"
          maxLength={80}
          className="w-full border border-white/10 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        <button className="border border-white/10 px-4 text-xs uppercase tracking-wider text-white/70 hover:text-white">
          Search
        </button>
      </form>

      {membersError ? (
        <p className="border border-white/10 p-6 text-sm text-white/60">
          Members could not be loaded. Try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="border border-white/10 p-6 text-sm text-white/60">
          {q
            ? `No members match “${q}”. Try a different name or program.`
            : "No members yet. Once an exec invites members, they will show up here."}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((m) => (
            <Link
              key={m.id}
              href={`/members/${m.id}`}
              className="border border-white/10 p-5 hover:border-white/20"
            >
              <div className="flex gap-4">
                {m.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photoUrl} alt="" className="h-12 w-12 object-cover" />
                ) : null}
                <div>
                  <p className="font-heading text-lg font-bold text-white">{m.full_name}</p>
                  <p className="mt-1 text-sm text-white/50">
                    {[m.program, m.grad_year].filter(Boolean).join(" · ")}
                  </p>
                  {m.bio && <p className="mt-2 line-clamp-2 text-sm text-white/65">{m.bio}</p>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {(hasPrev || hasNext) && (
        <nav className="mt-8 flex items-center justify-between text-xs uppercase tracking-wider">
          {hasPrev ? (
            <Link href={pageHref(q, page - 1)} className="text-white/70 hover:text-white">
              ← Previous
            </Link>
          ) : (
            <span className="text-white/25">← Previous</span>
          )}
          <span className="text-white/40">
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          {hasNext ? (
            <Link href={pageHref(q, page + 1)} className="text-white/70 hover:text-white">
              Next →
            </Link>
          ) : (
            <span className="text-white/25">Next →</span>
          )}
        </nav>
      )}
    </>
  );
}

function pageNumber(raw: string | undefined) {
  const n = Number(String(raw ?? "1").trim());
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 1;
}

function pageHref(q: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `/members?${s}` : "/members";
}
