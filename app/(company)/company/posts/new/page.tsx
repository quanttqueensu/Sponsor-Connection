import Notice from "@/components/Notice";
import PageHeader from "@/components/PageHeader";
import PostForm from "@/components/PostForm";

export default async function NewCompanyPost({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader kicker="Company" title="New post" />
      <Notice message={sp.denied} />
      <PostForm kinds={["job", "job_link", "event", "announcement"]} redirectTo="/company" />
    </>
  );
}
