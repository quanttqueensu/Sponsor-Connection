// Rendered on the server, so pin locale and zone: production runs in UTC and
// the club is based in Kingston, Ontario.
const ZONE = "America/Toronto";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: ZONE,
});

const timeFmt = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: ZONE,
});

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: ZONE,
});

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ZONE,
});

/** "Aug 24, 2026" — how old a listing is, at a glance. */
export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

/** "2:05 p.m." — the time of day a message was sent. */
export function formatTime(iso: string) {
  return timeFmt.format(new Date(iso));
}

/** "Tue, Aug 24, 2026" — the heading above a day's messages. */
export function formatDay(iso: string) {
  return dayFmt.format(new Date(iso));
}

/** Stable per-day key used to decide where a date separator goes. */
export function dayKey(iso: string) {
  return dayKeyFmt.format(new Date(iso));
}
