import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, resetDb, seedMember } from "../helpers/db";

describe("resume book consent", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("defaults to false with no timestamp", async () => {
    const id = await seedMember("member@test.dev");
    const member = await asUser("member@test.dev");

    const { data } = await member
      .from("profiles")
      .select("resume_book_opt_in, resume_book_opt_in_at")
      .eq("id", id)
      .single();

    expect(data!.resume_book_opt_in).toBe(false);
    expect(data!.resume_book_opt_in_at).toBeNull();
  });

  it("stamps a timestamp when a member opts in, and clears it on withdrawal", async () => {
    const id = await seedMember("member@test.dev");
    const member = await asUser("member@test.dev");

    await member.from("profiles").update({ resume_book_opt_in: true }).eq("id", id);
    const { data: onData } = await member
      .from("profiles")
      .select("resume_book_opt_in_at")
      .eq("id", id)
      .single();
    expect(onData!.resume_book_opt_in_at).not.toBeNull();

    await member.from("profiles").update({ resume_book_opt_in: false }).eq("id", id);
    const { data: offData } = await member
      .from("profiles")
      .select("resume_book_opt_in_at")
      .eq("id", id)
      .single();
    expect(offData!.resume_book_opt_in_at).toBeNull();
  });

  it("a member cannot set another member's consent", async () => {
    await seedMember("a@test.dev");
    const bId = await seedMember("b@test.dev");
    const a = await asUser("a@test.dev");

    const { data } = await a
      .from("profiles")
      .update({ resume_book_opt_in: true })
      .eq("id", bId)
      .select("id");

    expect(data ?? []).toHaveLength(0);
  });

  it("rejects a client-supplied opt-in timestamp once consent is already granted", async () => {
    const id = await seedMember("member@test.dev");
    const member = await asUser("member@test.dev");

    await member.from("profiles").update({ resume_book_opt_in: true }).eq("id", id);
    const { data: original } = await member
      .from("profiles")
      .select("resume_book_opt_in_at")
      .eq("id", id)
      .single();

    const forged = "2000-01-01T00:00:00.000Z";
    await member
      .from("profiles")
      .update({ resume_book_opt_in: true, resume_book_opt_in_at: forged })
      .eq("id", id);

    const { data: after } = await member
      .from("profiles")
      .select("resume_book_opt_in_at")
      .eq("id", id)
      .single();

    expect(after!.resume_book_opt_in_at).toBe(original!.resume_book_opt_in_at);
    expect(after!.resume_book_opt_in_at).not.toBe(forged);
  });

  it("an admin cannot grant consent on another member's behalf", async () => {
    const memberId = await seedMember("member@test.dev");
    const adminId = await seedMember("admin@test.dev");
    await asService().from("profiles").update({ is_admin: true }).eq("id", adminId);
    const admin = await asUser("admin@test.dev");

    const { error } = await admin
      .from("profiles")
      .update({ resume_book_opt_in: true })
      .eq("id", memberId);
    expect(error?.message).toMatch(/Only the member can grant resume book consent/);

    const { data } = await asService()
      .from("profiles")
      .select("resume_book_opt_in, resume_book_opt_in_at, resume_book_opt_in_by")
      .eq("id", memberId)
      .single();
    expect(data!.resume_book_opt_in).toBe(false);
    expect(data!.resume_book_opt_in_at).toBeNull();
    expect(data!.resume_book_opt_in_by).toBeNull();
  });

  it("an admin can withdraw a member's consent", async () => {
    const memberId = await seedMember("member@test.dev");
    const adminId = await seedMember("admin@test.dev");
    await asService().from("profiles").update({ is_admin: true }).eq("id", adminId);
    const admin = await asUser("admin@test.dev");
    const member = await asUser("member@test.dev");

    await member.from("profiles").update({ resume_book_opt_in: true }).eq("id", memberId);

    const { error } = await admin
      .from("profiles")
      .update({ resume_book_opt_in: false })
      .eq("id", memberId);
    expect(error).toBeNull();

    const { data } = await asService()
      .from("profiles")
      .select("resume_book_opt_in, resume_book_opt_in_at, resume_book_opt_in_by")
      .eq("id", memberId)
      .single();
    expect(data!.resume_book_opt_in).toBe(false);
    expect(data!.resume_book_opt_in_at).toBeNull();
    expect(data!.resume_book_opt_in_by).toBeNull();
  });
});
