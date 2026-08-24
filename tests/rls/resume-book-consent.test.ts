import { beforeEach, describe, expect, it } from "vitest";
import { asUser, resetDb, seedMember } from "../helpers/db";

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
});
