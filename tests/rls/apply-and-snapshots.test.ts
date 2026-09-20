import { beforeEach, describe, expect, it } from "vitest";
import {
  asService,
  asUser,
  resetDb,
  seedCompany,
  seedCompanyUser,
  seedDefaultPackage,
  seedInAppJob,
  seedMember,
} from "../helpers/db";

async function applyInApp(
  email: string,
  memberId: string,
  postId: string,
  opts: {
    resumePath?: string;
    coverPath?: string | null;
    packageId?: string | null;
    companyId?: string;
  } = {},
) {
  const appId = crypto.randomUUID();
  const member = await asUser(email);
  const result = await member.from("applications").insert({
    id: appId,
    member_id: memberId,
    kind: "in_app",
    post_id: postId,
    company_id: opts.companyId,
    resume_path: opts.resumePath ?? `snapshots/${appId}/resume.pdf`,
    cover_letter_path: opts.coverPath === undefined ? null : opts.coverPath,
    package_id: opts.packageId,
    stage: "submitted",
  });
  return { appId, ...result };
}

describe("in-app apply guard and snapshot immutability", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("accepts an in-app apply to an open published job with a snapshot path", async () => {
    const firm = await seedCompany("Acme Capital", { tierKey: "partner" });
    const author = await seedCompanyUser("recruiter@acme.dev", firm);
    const memberId = await seedMember("member@test.dev");
    const postId = await seedInAppJob(author, firm);
    const { error } = await applyInApp("member@test.dev", memberId, postId);
    expect(error).toBeNull();
  });

  it("rejects in-app apply to a job_link, closed job, unpublished job, and external job", async () => {
    const firm = await seedCompany("Acme Capital", { tierKey: "partner" });
    const author = await seedCompanyUser("recruiter@acme.dev", firm);
    const memberId = await seedMember("member@test.dev");

    const linkId = await seedInAppJob(author, firm, { kind: "job_link" });
    const closedId = await seedInAppJob(author, firm, { status: "closed" });
    const hiddenId = await seedInAppJob(author, firm, { published: false });
    const externalId = await seedInAppJob(author, firm, {
      externalUrl: "https://acme.example/careers",
    });

    for (const postId of [linkId, closedId, hiddenId, externalId]) {
      const { error } = await applyInApp("member@test.dev", memberId, postId);
      expect(error?.message).toMatch(/Apply is only allowed on open in-app jobs/);
    }
  });

  it("rejects a live package path and a snapshots/ path that names another application", async () => {
    const firm = await seedCompany("Acme Capital", { tierKey: "partner" });
    const author = await seedCompanyUser("recruiter@acme.dev", firm);
    const memberId = await seedMember("member@test.dev");
    const postId = await seedInAppJob(author, firm);

    const live = await applyInApp("member@test.dev", memberId, postId, {
      resumePath: `${memberId}/packages/x/resume.pdf`,
    });
    expect(live.error?.message).toMatch(/Invalid resume path/);

    const otherApp = crypto.randomUUID();
    const stolen = await applyInApp("member@test.dev", memberId, postId, {
      resumePath: `snapshots/${otherApp}/resume.pdf`,
    });
    expect(stolen.error?.message).toMatch(/Invalid resume path/);
  });

  it("rejects a snapshot path with .. traversal", async () => {
    const firm = await seedCompany("Acme Capital", { tierKey: "partner" });
    const author = await seedCompanyUser("recruiter@acme.dev", firm);
    const memberId = await seedMember("member@test.dev");
    const postId = await seedInAppJob(author, firm);
    const appId = crypto.randomUUID();
    const member = await asUser("member@test.dev");
    const { error } = await member.from("applications").insert({
      id: appId,
      member_id: memberId,
      kind: "in_app",
      post_id: postId,
      resume_path: `snapshots/${appId}/../other/resume.pdf`,
      stage: "submitted",
    });
    expect(error?.message).toMatch(/Invalid resume path/);
  });

  it("rejects a package_id that belongs to another member", async () => {
    const firm = await seedCompany("Acme Capital", { tierKey: "partner" });
    const author = await seedCompanyUser("recruiter@acme.dev", firm);
    const aId = await seedMember("a@test.dev");
    const bId = await seedMember("b@test.dev");
    await seedDefaultPackage("a@test.dev", aId);
    const { data: pack } = await asService()
      .from("hiring_packages")
      .select("id")
      .eq("member_id", aId)
      .single();
    const postId = await seedInAppJob(author, firm);
    const { error } = await applyInApp("b@test.dev", bId, postId, {
      packageId: pack!.id,
    });
    expect(error?.message).toMatch(/Invalid package/);
  });

  it("freezes snapshot columns after submit for the member, the firm, and service role", async () => {
    const firm = await seedCompany("Acme Capital", { tierKey: "principal" });
    const author = await seedCompanyUser("recruiter@acme.dev", firm);
    const memberId = await seedMember("member@test.dev");
    const postId = await seedInAppJob(author, firm);
    const { appId, error } = await applyInApp("member@test.dev", memberId, postId);
    expect(error).toBeNull();

    const member = await asUser("member@test.dev");
    const memberPatch = await member
      .from("applications")
      .update({ resume_path: `${memberId}/packages/x/resume.pdf` })
      .eq("id", appId)
      .select("id");
    expect(memberPatch.error).toBeNull();
    expect(memberPatch.data ?? []).toHaveLength(0);

    const recruiter = await asUser("recruiter@acme.dev");
    const firmPatch = await recruiter
      .from("applications")
      .update({ resume_path: `snapshots/${appId}/rewritten.pdf` })
      .eq("id", appId)
      .select("id");
    expect(firmPatch.error?.message ?? "").toMatch(/Application snapshot cannot be changed/);

    const svcPatch = await asService()
      .from("applications")
      .update({ resume_path: `snapshots/${appId}/rewritten.pdf` })
      .eq("id", appId);
    expect(svcPatch.error?.message).toMatch(/Application snapshot cannot be changed/);
  });

  it("rejects in-app apply when the firm cannot read applicants", async () => {
    const firm = await seedCompany("None Co", { tierKey: "none" });
    const author = await seedCompanyUser("none@firm.dev", firm);
    const memberId = await seedMember("member@test.dev");
    const postId = await seedInAppJob(author, firm);
    const { error } = await applyInApp("member@test.dev", memberId, postId);
    expect(error?.message).toMatch(/not accepting hub applications/i);
  });

  it("overwrites a client-supplied company_id with the post's firm", async () => {
    const acme = await seedCompany("Acme Capital", { tierKey: "partner" });
    const rival = await seedCompany("Rival Partners", { tierKey: "partner" });
    const author = await seedCompanyUser("recruiter@acme.dev", acme);
    const memberId = await seedMember("member@test.dev");
    const postId = await seedInAppJob(author, acme);
    const { appId, error } = await applyInApp("member@test.dev", memberId, postId, {
      companyId: rival,
    });
    expect(error).toBeNull();
    const { data } = await asService()
      .from("applications")
      .select("company_id")
      .eq("id", appId)
      .single();
    expect(data!.company_id).toBe(acme);
  });
});
