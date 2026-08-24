// Rendered on the server, so pin locale and zone: production runs in UTC and
// the club is based in Kingston, Ontario.
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Toronto",
});

/** "Aug 24, 2026" — how old a listing is, at a glance. */
export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso));
}
