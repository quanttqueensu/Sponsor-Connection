import Link from "next/link";
import TierBadge from "@/components/TierBadge";
import type { Post } from "@/lib/types";
import { isInAppJob, isPlatformJob, kindLabel, one, roleTypeLabel, termLabel } from "@/lib/types";
import { formatDate } from "@/lib/time";

export default function PostCard({ post }: { post: Post }) {
  const company = post.companies;
  const job = isInAppJob(post);
  const closed = isPlatformJob(post) && post.status === "closed";
  const logo = company?.logo_url;
  return (
    <Link
      href={`/feed/${post.id}`}
      className="block border-t border-white/10 py-6 transition-colors hover:border-white/20"
    >
      <div className="flex items-baseline gap-3">
        {logo && /^https?:\/\//i.test(logo) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-6 w-6 object-contain" />
        ) : null}
        <span className="font-heading text-xs text-blue-light">{kindLabel(post.kind)}</span>
        <TierBadge tier={one(company?.sponsor_tiers)} />
        {closed && (
          <span className="text-[10px] uppercase tracking-wider text-white/40">Closed</span>
        )}
      </div>
      <h2 className="mt-1 font-heading text-xl font-bold text-white">{post.title}</h2>
      <p className="mt-1 text-sm text-white/55">
        {[
          company?.name,
          roleTypeLabel(post.role_type),
          termLabel(post.term_season, post.term_year),
          post.location,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-white/65">{post.body}</p>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-white/60">
        {job ? "Apply in hub" : closed ? "Closed" : post.external_url ? "External listing" : "Post"}
      </p>
      <p className="mt-1 text-[11px] text-white/45">
        Posted <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
      </p>
    </Link>
  );
}
