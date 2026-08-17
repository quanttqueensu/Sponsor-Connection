import { redirect } from "next/navigation";

export default async function ForCompaniesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  const params = new URLSearchParams();
  if (sent) params.set("sent", sent);
  if (error) params.set("error", error);
  const query = params.toString();
  redirect(query ? `/join?${query}` : "/join");
}
