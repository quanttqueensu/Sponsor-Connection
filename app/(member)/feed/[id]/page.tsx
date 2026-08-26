import { applyToJob, logOffPlatform } from "@/lib/actions/applications";
import { addComment } from "@/lib/actions/posts";
import { startConversation } from "@/lib/actions/messages";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isInAppJob,
  isPlatformJob,
  kindLabel,
  one,
  roleTypeLabel,
  termLabel,
  type HiringPackage,
  type Post,
  type PostComment,
} from "@/lib/types";
import { Field, PrimaryButton, TextArea } from "@/components/Form";
import Notice from "@/components/Notice";
import TierBadge from "@/components/TierBadge";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/time";

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ denied?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select("*, companies(*, sponsor_tiers(id, name, rank, key))")
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();

  const { data: comments } = await supabase
    .from("post_comments")
    .select("*, profiles(id, full_name, photo_path)")
    .eq("post_id", id)
    .order("created_at");

  const { data: packages } =
    profile?.role === "member"
      ? await supabase
          .from("hiring_packages")
          .select("*")
          .eq("member_id", profile.id)
          .order("is_default", { ascending: false })
      : { data: [] as HiringPackage[] };

  const { data: existingApp } = profile
    ? await supabase
        .from("applications")
        .select("id")
        .eq("member_id", profile.id)
        .eq("post_id", id)
        .maybeSingle()
    : { data: null };

  const p = post as Post;
  const inApp = isInAppJob(p);
  const closed = p.status === "closed";
  const defaultPkg = (packages ?? []).find((x) => x.is_default) ?? packages?.[0];

  return (
    <article>
      <p className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[2px] text-blue-light">
        {kindLabel(p.kind)}
        <TierBadge tier={one(p.companies?.sponsor_tiers)} />
      </p>
      <Notice message={sp.denied} />
      <h1 className="mt-2 font-heading text-3xl font-bold text-white">{p.title}</h1>
      <p className="mt-2 text-sm text-white/55">
        {[
          p.companies?.name,
          roleTypeLabel(p.role_type),
          termLabel(p.term_season, p.term_year),
          p.location,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="mt-1 text-xs text-white/45">
        Posted <time dateTime={p.created_at}>{formatDate(p.created_at)}</time>
      </p>
      {closed && (
        <p
          role="status"
          className="mt-6 rounded border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/75"
        >
          <strong className="text-white">This posting is closed.</strong> It is no longer
          accepting applications.
        </p>
      )}

      <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-white/75">{p.body}</div>

      <div className="mt-8 flex flex-wrap gap-3">
        {p.company_id && (
          <form action={startConversation}>
            <input type="hidden" name="company_id" value={p.company_id} />
            <button className="rounded border border-white/15 px-4 py-2 text-xs uppercase tracking-wider text-white/70">
              Message
            </button>
          </form>
        )}
        {p.external_url && (
          <a
            href={p.external_url}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white"
          >
            Open listing
          </a>
        )}
      </div>

      {p.external_url && profile && !existingApp && (
        <form action={logOffPlatform} className="mt-6 max-w-md space-y-3">
          <input type="hidden" name="post_id" value={p.id} />
          <input type="hidden" name="company_id" value={p.company_id ?? ""} />
          <input type="hidden" name="company_name" value={p.companies?.name ?? "External"} />
          <p className="text-xs text-white/60">
            {closed
              ? "Applied on their site before this closed? You can still log it for execs."
              : "Applied on their site? Log it for execs."}
          </p>
          <PrimaryButton type="submit">Log that I applied</PrimaryButton>
        </form>
      )}

      {p.external_url && profile && existingApp && (
        <p className="mt-6 text-sm text-blue-light">
          Logged — this is in your applications.
        </p>
      )}

      {isPlatformJob(p) && profile && !inApp && (
        <section className="mt-10 max-w-lg border-t border-white/10 pt-8">
          <h2 className="font-heading text-lg font-bold text-white">Apply</h2>
          <p className="mt-3 text-sm text-white/60">
            This posting is closed, so applications are no longer being accepted here.
            {existingApp ? " Your application is still in your applications list." : ""}
          </p>
          <Link href="/feed" className="mt-4 inline-block text-sm text-blue-light">
            Browse open postings
          </Link>
        </section>
      )}

      {inApp && profile && (
        <section className="mt-10 max-w-lg border-t border-white/10 pt-8">
          <h2 className="font-heading text-lg font-bold text-white">Apply</h2>
          {existingApp ? (
            <p className="mt-3 text-sm text-blue-light">Already applied.</p>
          ) : !packages?.length ? (
            <div className="mt-3">
              <p className="text-sm text-white/60">
                A hiring package bundles your resume, LinkedIn, and an optional cover
                letter so you can apply in one click. You need one before applying.
              </p>
              <Link
                href="/packages"
                className="mt-4 inline-block rounded bg-primary px-5 py-2.5 text-xs uppercase tracking-wider text-white"
              >
                Create a hiring package
              </Link>
            </div>
          ) : (
            <form action={applyToJob} encType="multipart/form-data" className="mt-4 space-y-4">
              <input type="hidden" name="post_id" value={p.id} />
              <Field label="Hiring package">
                <select
                  name="package_id"
                  defaultValue={defaultPkg?.id}
                  className="w-full rounded px-3 py-2 text-sm"
                >
                  {(packages as HiringPackage[]).map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name}
                      {pkg.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cover letter">
                <select name="cover_mode" defaultValue="default" className="w-full rounded px-3 py-2 text-sm">
                  <option value="default">Use package default</option>
                  <option value="write">Write a new letter</option>
                  <option value="upload">Upload a PDF</option>
                  <option value="none">None</option>
                </select>
              </Field>
              <Field label="New letter (if writing)">
                <TextArea name="cover_letter" rows={5} maxLength={4000} />
              </Field>
              <Field label="PDF (if uploading)">
                <input type="file" name="cover_pdf" accept="application/pdf" />
              </Field>
              <PrimaryButton type="submit">Apply</PrimaryButton>
            </form>
          )}
        </section>
      )}

      <section className="mt-12 border-t border-white/10 pt-8">
        <h2 className="font-heading text-lg font-bold text-white">Comments</h2>
        <ul className="mt-4 space-y-4">
          {(comments as PostComment[] | null)?.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="text-white/80">{c.profiles?.full_name ?? "Member"}</span>
              <p className="mt-1 text-white/60">{c.body}</p>
            </li>
          ))}
        </ul>
        {profile?.role === "member" && (
          <form action={addComment} className="mt-6 max-w-lg space-y-3">
            <input type="hidden" name="post_id" value={p.id} />
            <TextArea name="body" rows={3} required placeholder="Add a comment" maxLength={4000} />
            <PrimaryButton type="submit">Comment</PrimaryButton>
          </form>
        )}
      </section>
    </article>
  );
}
