import { startConversation } from "@/lib/actions/messages";
import { updateApplicationStage } from "@/lib/actions/applications";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
      <p className="text-[11px] uppercase tracking-wider text-blue-light/70">{kindLabel(p.kind)}</p>
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
                <ResumeLink path={a.resume_path} memberId={a.member_id} />
                <ResumeLink path={a.cover_letter_path} memberId={a.member_id} label="Download cover letter" />
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

async function ResumeLink({
  path,
  memberId,
  label = "Download resume",
}: {
  path: string | null;
  memberId: string;
  label?: string;
}) {
  if (!path) return null;
  if (!path.startsWith(`${memberId}/`) && !path.startsWith("snapshots/")) return null;
  let signedUrl: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.storage.from("resumes").createSignedUrl(path, 3600);
    signedUrl = data?.signedUrl ?? null;
  } catch {
    return null;
  }
  if (!signedUrl) return null;
  return (
    <a href={signedUrl} className="mt-1 mr-3 inline-block text-xs text-blue-light" target="_blank">
      {label}
    </a>
  );
}
