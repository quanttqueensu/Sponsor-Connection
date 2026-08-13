import PageHeader from "@/components/PageHeader";
import { updateApplicationStage } from "@/lib/actions/applications";
import { createClient } from "@/lib/supabase/server";
import type { Application } from "@/lib/types";

const stages = ["submitted", "reviewing", "interviewing", "offer", "closed"] as const;

export default async function AdminApplicationsPage() {
  const supabase = await createClient();
  const { data: apps } = await supabase
    .from("applications")
    .select("*, posts(title), profiles(full_name)")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader kicker="Pipeline" title="All applications" />
      <ul>
        {(apps as Application[] | null)?.map((a) => (
          <li key={a.id} className="border-t border-white/10 py-3 text-sm">
            <span className="text-white">{a.profiles?.full_name}</span>
            <span className="text-white/45">
              {" "}
              · {a.kind === "in_app" ? a.posts?.title : a.company_name} · {a.kind}
            </span>
            <form action={updateApplicationStage} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="id" value={a.id} />
              <select name="stage" defaultValue={a.stage} className="rounded px-2 py-1 text-sm">
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button className="text-xs uppercase tracking-wider text-blue-light">Save</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
