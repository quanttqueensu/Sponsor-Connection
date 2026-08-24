import { beforeEach, describe, expect, it } from "vitest";
import {
  asService,
  asUser,
  resetDb,
  seedCompany,
  seedCompanyUser,
  seedMember,
} from "../helpers/db";

describe("applications_one_per_job", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects a second application against the same post", async () => {
    const acme = await seedCompany("Acme Capital");
    const author = await seedCompanyUser("recruiter@acme.dev", acme);
    const memberId = await seedMember("member@test.dev");

    const { data: post } = await asService()
      .from("posts")
      .insert({
        author_id: author,
        company_id: acme,
        kind: "job",
        title: "External role",
        external_url: "https://acme.example/careers",
      })
      .select("id")
      .single();

    const row = {
      member_id: memberId,
      kind: "off_platform" as const,
      post_id: post!.id,
      company_id: acme,
      company_name: "Acme Capital",
    };

    const first = await asService().from("applications").insert(row);
    expect(first.error).toBeNull();

    const second = await asService().from("applications").insert(row);
    expect(second.error?.code).toBe("23505");
  });

  /**
   * The post page (app/(member)/feed/[id]/page.tsx) decides whether to show
   * "Already applied." from exactly this query. applyToJob therefore has to
   * revalidate /feed/[id], not just /feed and /applications — otherwise the
   * cached page keeps the Apply button live and the member clicks twice,
   * which is what produced the 23505 above in the first place.
   */
  it("the post page's already-applied lookup sees the row an apply inserts", async () => {
    const acme = await seedCompany("Acme Capital");
    const author = await seedCompanyUser("recruiter@acme.dev", acme);
    const memberId = await seedMember("member@test.dev");

    const { data: post } = await asService()
      .from("posts")
      .insert({
        author_id: author,
        company_id: acme,
        kind: "job",
        title: "Quant Intern",
        external_url: null,
        role_type: "internship",
        term_season: "summer",
        term_year: 2027,
      })
      .select("id")
      .single();

    const member = await asUser("member@test.dev");
    const before = await member
      .from("applications")
      .select("id")
      .eq("member_id", memberId)
      .eq("post_id", post!.id)
      .maybeSingle();
    expect(before.data).toBeNull();

    const { error } = await asService().from("applications").insert({
      member_id: memberId,
      kind: "off_platform" as const,
      post_id: post!.id,
      company_id: acme,
      company_name: "Acme Capital",
    });
    expect(error).toBeNull();

    const after = await member
      .from("applications")
      .select("id")
      .eq("member_id", memberId)
      .eq("post_id", post!.id)
      .maybeSingle();
    expect(after.data).not.toBeNull();
  });
});
