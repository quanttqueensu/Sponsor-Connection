import { beforeEach, describe, expect, it } from "vitest";
import { asService, resetDb, seedCompany, seedCompanyUser, seedMember } from "../helpers/db";

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
});
