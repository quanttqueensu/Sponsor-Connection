import { describe, expect, it } from "vitest";
import { parseAuthHash, shouldForwardToAuthCallback } from "../lib/auth-session";

describe("invite / recovery links that miss /auth/callback", () => {
  it("forwards a PKCE code that landed on /login", () => {
    expect(
      shouldForwardToAuthCallback("/login", "?code=abc", ""),
    ).toBe(true);
  });

  it("forwards a token_hash invite that landed on /", () => {
    expect(
      shouldForwardToAuthCallback("/", "?token_hash=xyz&type=invite", ""),
    ).toBe(true);
  });

  it("forwards implicit-flow tokens in the hash", () => {
    expect(
      shouldForwardToAuthCallback(
        "/login",
        "",
        "#access_token=a&refresh_token=b&type=invite",
      ),
    ).toBe(true);
  });

  it("forwards a hash error so the callback can show login_link_expired", () => {
    expect(
      shouldForwardToAuthCallback("/login", "", "#error=access_denied"),
    ).toBe(true);
  });

  it("does not steal a normal password-login error banner", () => {
    expect(
      shouldForwardToAuthCallback("/login", "?error=login_failed", ""),
    ).toBe(false);
  });

  it("does not loop on the callback page itself", () => {
    expect(
      shouldForwardToAuthCallback("/auth/callback", "?code=abc", ""),
    ).toBe(false);
  });

  it("parses invite hashes", () => {
    const parsed = parseAuthHash("#access_token=a&refresh_token=b&type=invite");
    expect(parsed.access_token).toBe("a");
    expect(parsed.refresh_token).toBe("b");
    expect(parsed.type).toBe("invite");
  });
});
