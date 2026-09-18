import type { ReactNode } from "react";
import AdminNav from "@/components/AdminNav";
import { requireCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireCurrentProfile();
  if (!profile.is_admin) redirect("/feed");

  return (
    <>
      <AdminNav />
      <div className="mx-auto max-w-6xl px-5 py-10">{children}</div>
    </>
  );
}
