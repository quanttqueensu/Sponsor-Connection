import { describe, expect, it } from "vitest";
import {
  cleanSearchTerm,
  isSafeHttpUrl,
  parseGradYearParam,
} from "../app/(company)/company/talent-query";

describe("parseGradYearParam", () => {
  it("treats blank as no filter", () => {
    expect(parseGradYearParam("")).toEqual({ yearRaw: "", year: null, invalid: false });
    expect(parseGradYearParam("  ")).toEqual({ yearRaw: "", year: null, invalid: false });
    expect(parseGradYearParam(undefined)).toEqual({
      yearRaw: "",
      year: null,
      invalid: false,
    });
  });

  it("accepts a four-digit year in range", () => {
    expect(parseGradYearParam("2027")).toEqual({
      yearRaw: "2027",
      year: 2027,
      invalid: false,
    });
  });

  it("does not drop a bad year into an unfiltered list", () => {
    expect(parseGradYearParam("99").invalid).toBe(true);
    expect(parseGradYearParam("2026.5").invalid).toBe(true);
    expect(parseGradYearParam("abcd").invalid).toBe(true);
    expect(parseGradYearParam("1899").invalid).toBe(true);
    expect(parseGradYearParam("2101").invalid).toBe(true);
  });
});

describe("cleanSearchTerm", () => {
  it("strips ILIKE wildcards", () => {
    expect(cleanSearchTerm("%quant_\\")).toBe("quant");
  });
});

describe("isSafeHttpUrl", () => {
  it("allows http(s) listing and profile links", () => {
    expect(isSafeHttpUrl("https://example.com/jobs")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
  });

  it("rejects javascript, data, and protocol-relative URLs", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,hi")).toBe(false);
    expect(isSafeHttpUrl("//evil.example")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
  });
});
