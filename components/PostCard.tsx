import Link from "next/link";
import type { Post } from "@/lib/types";
import { isInAppJob, kindLabel, roleTypeLabel, termLabel } from "@/lib/types";

export default function PostCard({ post }: { post: Post }) {
  const company = post.companies;
  const job = isInAppJob(post);
  return (
    <Link
      href={`/feed/${post.id}`}
      className="block border-t border-white/10 py-6 transition-colors hover:border-white/20"
    >
      <div className="flex items-baseline gap-3">
        <span className="font-heading text-xs text-blue-light/70">{kindLabel(post.kind)}</span>
        {company?.is_sponsor && (
          <span className="text-[10px] uppercase tracking-wider text-blue-light/50">Sponsor</span>
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
        {job ? "Apply in hub" : post.external_url ? "External listing" : "Post"}
      </p>
    </Link>
  );
}
