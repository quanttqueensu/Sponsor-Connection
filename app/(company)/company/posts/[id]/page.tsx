import { startConversation } from "@/lib/actions/messages";
import { updateApplicationStage } from "@/lib/actions/applications";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPlatformJob, kindLabel, type Application, type Post } from "@/lib/types";
import { notFound, redirect } from "next/navigation";

const stages = ["submitted", "reviewing", "interviewing", "offer", "closed"] as const;

export default async function CompanyPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: cu } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const { data: post } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
  if (!post || post.company_id !== cu?.company_id) notFound();
  const p = post as Post;

  const { data: apps } = isPlatformJob(p)
    ? await supabase
        .from("applications")
        .select("*, profiles(id, full_name, program, grad_year, linkedin_url)")
        .eq("post_id", id)
        .eq("kind", "in_app")
    : { data: [] as Application[] };

  return (
    <>
      <p className="text-[11px] uppercase tracking-wider text-blue-light">{kindLabel(p.kind)}</p>
      <h1 className="mt-1 font-heading text-3xl font-bold text-white">{p.title}</h1>
      <p className="mt-4 whitespace-pre-wrap text-sm text-white/70">{p.body}</p>
      {isPlatformJob(p) && (
        <section className="mt-10">
          <h2 className="font-heading text-lg font-bold text-white">Applicants</h2>
          <ul className="mt-4 space-y-4">
            {(apps as Application[] | null)?.map((a) => (
              <li key={a.id} className="border-t border-white/10 py-4">
                <p className="text-white">{a.profiles?.full_name}</p>
                <p className="text-sm text-white/50">
                  {a.package_name} · {a.linkedin_url}
                </p>
                {a.cover_letter && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-white/60">{a.cover_letter}</p>
                )}
                <ResumeLink applicationId={a.id} path={a.resume_path} doc="resume" />
                <ResumeLink applicationId={a.id} path={a.cover_letter_path} doc="cover" />
                <div className="mt-2 flex gap-3">
                  <form action={updateApplicationStage}>
                    <input type="hidden" name="id" value={a.id} />
                    <select name="stage" defaultValue={a.stage} className="rounded px-2 py-1 text-sm">
                      {stages.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button className="ml-2 text-xs uppercase tracking-wider text-blue-light">
                      Save
                    </button>
                  </form>
                  {a.member_id && p.company_id && (
                    <form action={startConversation}>
                      <input type="hidden" name="company_id" value={p.company_id} />
                      <input type="hidden" name="member_id" value={a.member_id} />
                      <button className="text-xs uppercase tracking-wider text-white/50">
                        Message
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * Links to one applicant document, without signing anything up front.
 *
 * Two things used to go wrong here. The component accepted any path under
 * `snapshots/`, so an application row inserted straight through PostgREST
 * could name ANOTHER student's snapshot and this page would mint a
 * service-role signed URL for it. It also accepted `{member_id}/...`, the
 * member's own live package file, which they can re-upload at any time -- so
 * the "frozen at apply time" guarantee held only for applications created by
 * applyToJob's happy path.
 *
 * Both arms are gone: the only acceptable path is the snapshot copied for
 * THIS application. Anything else renders an explicit unavailable state, so a
 * malformed row looks broken to the recruiter instead of looking like a
 * student who attached nothing.
 *
 * The href points at a route handler that re-checks company ownership and
 * signs a short-lived URL per click, so no unauthenticated resume URL ever
 * sits in this page's payload.
 */
function ResumeLink({
  applicationId,
  path,
  doc,
}: {
  applicationId: string;
  path: string | null;
  doc: "resume" | "cover";
}) {
  const label = doc === "cover" ? "cover letter" : "resume";
  // A missing cover letter is ordinary -- most applicants write one inline or
  // skip it. A missing resume is not: applications_guard requires one.
  if (!path) {
    if (doc === "cover") return null;
    return <UnavailableDoc label={label} />;
  }
  if (!path.startsWith(`snapshots/${applicationId}/`)) {
    return <UnavailableDoc label={label} />;
  }
  return (
    <a
      href={`/company/applications/${applicationId}/resume?doc=${doc}`}
      className="mt-1 mr-3 inline-block text-xs text-blue-light"
      target="_blank"
      rel="noopener noreferrer"
    >
      Download {label}
    </a>
  );
}

function UnavailableDoc({ label }: { label: string }) {
  return (
    <span className="mt-1 mr-3 inline-block text-xs text-white/40">
      This applicant&rsquo;s {label} is unavailable.
    </span>
  );
}
