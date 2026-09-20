import { describe, expect, it } from "vitest";
import { DENIAL_MESSAGES } from "../lib/denials";
import { isInAppJob, isPlatformJob, one, type Post } from "../lib/types";

function post(overrides: Partial<Post>): Post {
  return {
    id: "p1",
    author_id: "a1",
    company_id: "c1",
    kind: "job",
    title: "Role",
    body: "Body",
    location: null,
    starts_at: null,
    published: true,
    status: "open",
    role_type: "internship",
    term_season: "summer",
    term_year: 2027,
    external_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("member apply invariants", () => {
  it("isInAppJob only for published open jobs without an external URL", () => {
    expect(isInAppJob(post({}))).toBe(true);
    expect(isPlatformJob(post({}))).toBe(true);

    expect(isInAppJob(post({ external_url: "https://jobs.example/x" }))).toBe(false);
    expect(isInAppJob(post({ kind: "job_link", external_url: "https://jobs.example/x" }))).toBe(
      false,
    );
    expect(isInAppJob(post({ status: "closed" }))).toBe(false);
    expect(isInAppJob(post({ published: false }))).toBe(false);
    expect(isInAppJob(post({ kind: "event" }))).toBe(false);
    expect(isInAppJob(post({ kind: "announcement" }))).toBe(false);
  });

  it("member denial codes used by DMs resolve to copy, and unknown codes do not", () => {
    expect(DENIAL_MESSAGES.message_invalid).toBeTruthy();
    expect(DENIAL_MESSAGES.message_send_failed).toBeTruthy();
    expect(DENIAL_MESSAGES.conversation_start_forbidden).toBeTruthy();
    expect(DENIAL_MESSAGES["Write this into the banner"]).toBeUndefined();
  });

  it("one() unwraps a one-element relation array or an object", () => {
    expect(one({ name: "Acme" })?.name).toBe("Acme");
    expect(one([{ name: "Acme" }])?.name).toBe("Acme");
    expect(one([])).toBeNull();
    expect(one(null)).toBeNull();
  });
});
