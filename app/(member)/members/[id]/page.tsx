import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, ProfileSection } from "@/lib/types";
import { notFound } from "next/navigation";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getCurrentProfile();
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .eq("role", "member")
    .maybeSingle();
  if (!member) notFound();
  const m = member as Profile;
  const { data: sections } = await supabase
    .from("profile_sections")
    .select("*")
    .eq("member_id", id)
    .order("sort_order");

  const fields = [
    ["Bio", m.bio],
    ["Interests", m.interests],
    ["LinkedIn", m.linkedin_url],
    ["GitHub", m.github_url],
    ["Website", m.website_url],
  ].filter(([, v]) => v);

  return (
    <article>
      <h1 className="font-heading text-3xl font-bold text-white">{m.full_name}</h1>
      <p className="mt-2 text-sm text-white/50">
        {[m.program, m.grad_year].filter(Boolean).join(" · ")}
      </p>
      <dl className="mt-8 space-y-4">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-wider text-white/40">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-white/75">{value}</dd>
          </div>
        ))}
      </dl>
      {(sections as ProfileSection[] | null)?.map((s) => (
        <section key={s.id} className="mt-8 border-t border-white/10 pt-6">
          <h2 className="text-[11px] uppercase tracking-wider text-white/40">{s.label}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-white/75">{s.body}</p>
        </section>
      ))}
    </article>
  );
}
