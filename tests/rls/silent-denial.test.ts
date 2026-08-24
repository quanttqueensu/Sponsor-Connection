import { beforeEach, describe, expect, it } from "vitest";
import {
  asService,
  asUser,
  resetDb,
  seedCompany,
  seedCompanyUser,
  seedMember,
} from "../helpers/db";
import { DENIAL_MESSAGES } from "../../lib/denials";

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

  /**
   * posts_admin_write is `for all`, so an admin is never filtered by owner.
   * Zero rows for an admin can only mean the post is gone — which is why
   * closePost sends an admin to /admin/posts with `post_close_missing`
   * rather than the company-only "belongs to another firm" wording.
   */
  it("an admin closing a post that exists gets a row back, so zero rows means it is gone", async () => {
    const acme = await seedCompany("Acme Capital");
    const author = await seedCompanyUser("recruiter@acme.dev", acme);
    await seedMember("exec@quantt.dev", { isAdmin: true });

    const { data: post } = await asService()
      .from("posts")
      .insert({
        author_id: author,
        company_id: acme,
        kind: "announcement",
        title: "Acme announcement",
        status: "open",
      })
      .select("id")
      .single();

    const admin = await asUser("exec@quantt.dev");
    const closed = await admin
      .from("posts")
      .update({ status: "closed" })
      .eq("id", post!.id)
      .select("id");
    expect(closed.error).toBeNull();
    expect(closed.data ?? []).toHaveLength(1);

    const missing = await admin
      .from("posts")
      .update({ status: "closed" })
      .eq("id", crypto.randomUUID())
      .select("id");
    expect(missing.error).toBeNull();
    expect(missing.data ?? []).toHaveLength(0);
  });

  /**
   * updateApplicationStage refuses an invalid stage and a zero-row update
   * through one shared target, so an admin or a recruiter is never dropped on
   * the member-only /applications page. These are the three targets it picks
   * between, and every denial code it can emit must resolve to real copy.
   */
  it("every denial code an action emits resolves, and unknown codes render nothing", () => {
    const targetFor = (role: string, isAdmin: boolean) =>
      role === "company_user"
        ? "/company/applicants"
        : isAdmin
          ? "/admin/applications"
          : "/applications";

    expect(targetFor("company_user", false)).toBe("/company/applicants");
    expect(targetFor("member", true)).toBe("/admin/applications");
    expect(targetFor("member", false)).toBe("/applications");

    for (const code of [
      "stage_invalid",
      "application_update_failed",
      "application_duplicate",
      "application_log_duplicate",
      "post_url_invalid",
      "post_close_missing",
      "post_close_not_yours",
      "post_close_forbidden",
      "join_request_reject_failed",
    ]) {
      expect(DENIAL_MESSAGES[code]).toBeTruthy();
    }

    // The phishing case: free text in ?denied= is not a code, so it is dropped.
    expect(
      DENIAL_MESSAGES["Consent verification required. Email your resume to attacker@x"],
    ).toBeUndefined();
  });
});
