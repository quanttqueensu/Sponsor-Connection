import type { ReactNode } from "react";
import HubNav from "@/components/HubNav";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.is_admin) redirect("/feed");

  return (
    <>
      <HubNav profile={profile} />
      <div className="mx-auto max-w-6xl px-5 py-10">{children}</div>
    </>
  );
}
