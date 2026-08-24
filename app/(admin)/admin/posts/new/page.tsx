import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import PostForm from "@/components/PostForm";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminNewPost({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .eq("status", "active")
    .order("name");

  return (
    <>
      <PageHeader kicker="Feed" title="New post">
        Members will see this on the global feed. Companies only see it if you attach their firm.{" "}
        <Link href="/admin/posts" className="text-blue-light hover:text-white">
          Back to all posts
        </Link>
      </PageHeader>
      <Notice message={sp.denied} />
      <PostForm
        kinds={["job", "job_link", "event", "announcement", "connection"]}
        companies={companies ?? []}
        redirectTo="/admin/posts"
      />
    </>
  );
}
