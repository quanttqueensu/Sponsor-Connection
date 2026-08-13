import PageHeader from "@/components/PageHeader";
import PostForm from "@/components/PostForm";

export default function NewCompanyPost() {
  return (
    <>
      <PageHeader kicker="Company" title="New post" />
      <PostForm kinds={["job", "job_link", "event", "announcement"]} redirectTo="/company" />
    </>
  );
}
