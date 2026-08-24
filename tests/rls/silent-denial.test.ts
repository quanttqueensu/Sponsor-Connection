import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, resetDb, seedCompany, seedCompanyUser } from "../helpers/db";

describe("RLS denial is observable", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a company cannot close another firm's post, and the update returns zero rows", async () => {
    const acme = await seedCompany("Acme Capital");
    const rival = await seedCompany("Rival Partners");
    await seedCompanyUser("recruiter@acme.dev", acme);
    const rivalOwner = await seedCompanyUser("owner@rival.dev", rival);

    const { data: post } = await asService()
      .from("posts")
      .insert({
        author_id: rivalOwner,
        company_id: rival,
        kind: "announcement",
        title: "Rival announcement",
        status: "open",
      })
      .select("id")
      .single();

    const recruiter = await asUser("recruiter@acme.dev");
    const { data, error } = await recruiter
      .from("posts")
      .update({ status: "closed" })
      .eq("id", post!.id)
      .select("id");

    // This is the trap: RLS filters the row, so there is no error at all.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
