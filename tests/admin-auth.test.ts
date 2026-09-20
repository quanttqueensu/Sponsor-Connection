import { describe, expect, it } from "vitest";
import { DENIAL_MESSAGES } from "../lib/denials";

describe("admin / auth denial codes", () => {
  it("maps join_request_review_failed instead of leaking driver text", () => {
    expect(DENIAL_MESSAGES.join_request_review_failed).toMatch(/could not be reviewed/i);
  });

  it("does not treat unknown URL codes as banner copy", () => {
    expect(DENIAL_MESSAGES["Email your password to attacker@x"]).toBeUndefined();
  });
});
