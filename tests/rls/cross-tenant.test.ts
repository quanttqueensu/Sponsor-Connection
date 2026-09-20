import { beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  resetDb,
  seedCompany,
  seedCompanyUser,
  seedDefaultPackage,
  seedInAppJob,
  seedMember,
} from "../helpers/db";

describe("cross-tenant isolation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a company user cannot list the member feed, directory, packages, or comments", async () => {
    const acme = await seedCompany("Acme Capital", { tierKey: "partner" });
    const rival = await seedCompany("Rival Partners", { tierKey: "partner" });
    await seedCompanyUser("recruiter@acme.dev", acme);
    const rivalOwner = await seedCompanyUser("owner@rival.dev", rival);
    const memberId = await seedMember("member@test.dev");
    await seedDefaultPackage("member@test.dev", memberId);

    const rivalPost = await seedInAppJob(rivalOwner, rival, {
      kind: "announcement",
      title: "Rival news",
    });
    const member = await asUser("member@test.dev");
    await member.from("post_comments").insert({
      post_id: rivalPost,
      author_id: memberId,
      body: "hello",
    });
    await member.from("profile_sections").insert({
      member_id: memberId,
      label: "About",
      body: "quant",
    });

    const recruiter = await asUser("recruiter@acme.dev");
    const posts = await recruiter.from("posts").select("id");
    expect((posts.data ?? []).map((r) => r.id)).not.toContain(rivalPost);

    const profiles = await recruiter.from("profiles").select("id");
    expect((profiles.data ?? []).map((r) => r.id)).not.toContain(memberId);

    const packages = await recruiter.from("hiring_packages").select("id");
    expect(packages.data ?? []).toHaveLength(0);

    const comments = await recruiter.from("post_comments").select("id");
    expect(comments.data ?? []).toHaveLength(0);

    const sections = await recruiter.from("profile_sections").select("id");
    expect(sections.data ?? []).toHaveLength(0);
  });

  it("a company user cannot read another firm's in-app applications", async () => {
    const acme = await seedCompany("Acme Capital", { tierKey: "partner" });
    const rival = await seedCompany("Rival Partners", { tierKey: "partner" });
    await seedCompanyUser("recruiter@acme.dev", acme);
    const rivalOwner = await seedCompanyUser("owner@rival.dev", rival);
    const memberId = await seedMember("member@test.dev");
    const postId = await seedInAppJob(rivalOwner, rival);
    const appId = crypto.randomUUID();
    const member = await asUser("member@test.dev");
    const inserted = await member.from("applications").insert({
      id: appId,
      member_id: memberId,
      kind: "in_app",
      post_id: postId,
      resume_path: `snapshots/${appId}/resume.pdf`,
      stage: "submitted",
    });
    expect(inserted.error).toBeNull();

    const recruiter = await asUser("recruiter@acme.dev");
    const { data } = await recruiter.from("applications").select("id").eq("id", appId);
    expect(data ?? []).toHaveLength(0);
  });

  it("a member cannot read another member's applications or hiring packages", async () => {
    const aId = await seedMember("a@test.dev");
    const bId = await seedMember("b@test.dev");
    await seedDefaultPackage("b@test.dev", bId);
    const a = await asUser("a@test.dev");

    const packages = await a.from("hiring_packages").select("id").eq("member_id", bId);
    expect(packages.data ?? []).toHaveLength(0);

    const apps = await a.from("applications").select("id").eq("member_id", bId);
    expect(apps.data ?? []).toHaveLength(0);

    const self = await a.from("profiles").select("id").eq("id", aId);
    expect(self.data ?? []).toHaveLength(1);
  });

  it("a company user cannot insert an application or a post for another firm", async () => {
    const acme = await seedCompany("Acme Capital", { tierKey: "partner" });
    const rival = await seedCompany("Rival Partners", { tierKey: "partner" });
    await seedCompanyUser("recruiter@acme.dev", acme);
    const rivalOwner = await seedCompanyUser("owner@rival.dev", rival);
    const memberId = await seedMember("member@test.dev");
    const postId = await seedInAppJob(rivalOwner, rival);

    const recruiter = await asUser("recruiter@acme.dev");
    const app = await recruiter.from("applications").insert({
      member_id: memberId,
      kind: "in_app",
      post_id: postId,
      resume_path: `snapshots/${crypto.randomUUID()}/resume.pdf`,
    });
    expect(app.error).toBeTruthy();

    const post = await recruiter.from("posts").insert({
      author_id: rivalOwner,
      company_id: rival,
      kind: "announcement",
      title: "Hijack",
    });
    expect(post.error).toBeTruthy();
  });
});
