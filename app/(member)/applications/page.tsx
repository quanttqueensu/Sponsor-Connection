import PageHeader from "@/components/PageHeader";
import { Field, PrimaryButton, TextInput } from "@/components/Form";
import { logOffPlatform, updateApplicationStage } from "@/lib/actions/applications";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Application } from "@/lib/types";
import { redirect } from "next/navigation";

const stages = ["submitted", "reviewing", "interviewing", "offer", "closed"] as const;

export default async function ApplicationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: apps } = await supabase
    .from("applications")
    .select("*, posts(title, kind)")
    .eq("member_id", profile.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader kicker="Pipeline" title="My applications" />
      <ul className="space-y-4">
        {(apps as Application[] | null)?.map((a) => (
          <li key={a.id} className="border-t border-white/10 py-4">
            <p className="text-white">
              {a.kind === "in_app" ? a.posts?.title : a.company_name}{" "}
              <span className="text-xs text-white/40">
                {a.kind === "in_app" ? a.package_name : "off-platform"} · {a.stage}
              </span>
            </p>
            {a.kind === "off_platform" && (
              <form action={updateApplicationStage} className="mt-2 flex items-center gap-2">
                <input type="hidden" name="id" value={a.id} />
                <select name="stage" defaultValue={a.stage} className="rounded px-2 py-1 text-sm">
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="text-xs uppercase tracking-wider text-blue-light">Update</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <form action={logOffPlatform} className="mt-12 max-w-md space-y-3">
        <h2 className="font-heading text-lg font-bold text-white">Log an external application</h2>
        <Field label="Company name">
          <TextInput name="company_name" required />
        </Field>
        <Field label="Notes">
          <TextInput name="notes" />
        </Field>
        <PrimaryButton type="submit">Log application</PrimaryButton>
      </form>
    </>
  );
}
