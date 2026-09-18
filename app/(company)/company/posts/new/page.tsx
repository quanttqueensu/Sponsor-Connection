import LockedCard from "@/components/LockedCard";
import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import PostForm from "@/components/PostForm";
import { getCurrentProfile } from "@/lib/auth";
import { can, loadMyCompanyTier, loadTiers } from "@/lib/tiers";
import { createClient } from "@/lib/supabase/server";
import type { PostKind } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function NewCompanyPost({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const { data: cu } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!cu) redirect("/company");

  const [{ access }, tiers] = await Promise.all([
    loadMyCompanyTier(cu.company_id),
    loadTiers(),
  ]);

  const kinds: PostKind[] = ["job", "job_link", "announcement"];
  if (can(access, "post_event")) kinds.splice(2, 0, "event");

  return (
    <>
      <PageHeader kicker="Company" title="New post" />
      <Notice message={sp.denied} />
      {!can(access, "post_in_app_job") && (
        <div className="mb-8">
          <LockedCard
            capability="post_in_app_job"
            tier={access}
            tiers={tiers}
            title="In-app applications"
            description="Your current access does not include jobs that take applications in the hub. You can still publish a listing with an external URL."
          />
        </div>
      )}
      <PostForm kinds={kinds} redirectTo="/company" />
    </>
  );
}
