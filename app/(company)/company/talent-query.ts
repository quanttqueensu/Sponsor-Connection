/** Shared search/filter parsing for resume book and candidate search. */

export function cleanSearchTerm(raw: string | undefined) {
  return String(raw ?? "")
    .replace(/[%_\\]/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Grad-year query param. An unparseable value must not be treated as
 * "no filter" — that would list every opted-in member while the form
 * still shows the bad year.
 */
export function parseGradYearParam(raw: string | undefined): {
  yearRaw: string;
  year: number | null;
  invalid: boolean;
} {
  const yearRaw = String(raw ?? "").trim();
  if (yearRaw === "") return { yearRaw, year: null, invalid: false };
  const year = Number(yearRaw);
  const ok = Number.isInteger(year) && year >= 1900 && year <= 2100;
  if (!ok) return { yearRaw, year: null, invalid: true };
  return { yearRaw, year, invalid: false };
}

/** http(s) only — never javascript:, data:, or protocol-relative URLs. */
export function isSafeHttpUrl(href: string | null | undefined) {
  return Boolean(href && /^https?:\/\//i.test(href));
}
