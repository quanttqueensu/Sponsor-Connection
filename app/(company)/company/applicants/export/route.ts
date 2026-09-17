import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { can, loadMyCompanyTier } from "@/lib/tiers";
import type { Application } from "@/lib/types";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "company_user") {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data: cu } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!cu) return new NextResponse("Not found", { status: 404 });

  const { effective } = await loadMyCompanyTier(cu.company_id);
  if (!can(effective, "read_applicants")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: apps } = await supabase
    .from("applications")
    .select("created_at, stage, package_name, linkedin_url, posts(title), profiles(full_name, program, grad_year, email)")
    .eq("kind", "in_app")
    .eq("company_id", cu.company_id)
    .order("created_at", { ascending: false });

  const rows = (apps as Application[] | null) ?? [];
  const header = ["submitted_at", "name", "email", "program", "grad_year", "post", "stage", "package", "linkedin"];
  const lines = [header.join(",")];
  for (const a of rows) {
    const cells = [
      a.created_at,
      a.profiles?.full_name ?? "",
      a.profiles?.email ?? "",
      a.profiles?.program ?? "",
      a.profiles?.grad_year ?? "",
      a.posts?.title ?? "",
      a.stage,
      a.package_name ?? "",
      a.linkedin_url ?? "",
    ].map(csvCell);
    lines.push(cells.join(","));
  }

  return new NextResponse(lines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="applicants.csv"',
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(value: string | number | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
