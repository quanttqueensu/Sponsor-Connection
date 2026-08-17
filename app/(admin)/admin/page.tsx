import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminHome() {
  const supabase = await createClient();
  const [{ count: members }, { count: pending }, { count: apps }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "member"),
    supabase
      .from("company_join_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("applications").select("*", { count: "exact", head: true }),
  ]);

  const links = [
    { href: "/admin/invite", label: "Invite", hint: "Members, execs, and company contacts" },
    { href: "/admin/people", label: "People", hint: `${members ?? 0} members` },
    { href: "/admin/companies", label: "Companies", hint: "Sponsors, firms, and the /join link" },
    { href: "/admin/requests", label: "Join requests", hint: `${pending ?? 0} pending` },
    { href: "/admin/applications", label: "Applications", hint: `${apps ?? 0} total` },
    { href: "/admin/posts", label: "New post", hint: "Event, connection, job link" },
  ];

  return (
    <>
      <PageHeader kicker="Exec" title="Admin">
        This panel is only for execs. Invite people, approve firms, and post to the club feed.
        Use Club in the nav to go back to the member hub.
      </PageHeader>
      <ul className="grid gap-4 md:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block border border-white/10 p-5 hover:border-white/20">
              <p className="font-heading text-lg font-bold text-white">{l.label}</p>
              <p className="mt-1 text-sm text-white/45">{l.hint}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
