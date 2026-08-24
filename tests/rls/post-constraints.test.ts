import { beforeEach, describe, expect, it } from "vitest";
import { asService, resetDb, seedCompany, seedCompanyUser } from "../helpers/db";

describe("in_app_job_fields", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects an in-app job missing term fields", async () => {
    const acme = await seedCompany("Acme Capital");
    const author = await seedCompanyUser("recruiter@acme.dev", acme);

    const { error } = await asService().from("posts").insert({
      author_id: author,
      company_id: acme,
      kind: "job",
      title: "Quant Intern",
      external_url: null,
      role_type: null,
      term_season: null,
      term_year: null,
    });

    expect(error?.message).toMatch(/in_app_job_fields/);
  });

  it("accepts an in-app job with all three term fields", async () => {
    const acme = await seedCompany("Acme Capital");
    const author = await seedCompanyUser("recruiter@acme.dev", acme);

    const { error } = await asService().from("posts").insert({
      author_id: author,
      company_id: acme,
      kind: "job",
      title: "Quant Intern",
      external_url: null,
      role_type: "internship",
      term_season: "summer",
      term_year: 2027,
    });

    expect(error).toBeNull();
  });
});
