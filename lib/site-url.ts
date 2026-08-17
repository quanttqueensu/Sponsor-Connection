/** Canonical site URL for auth redirects (Netlify sets URL; override with NEXT_PUBLIC_SITE_URL). */
export function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const netlify = process.env.URL?.replace(/\/$/, "");
  if (netlify) return netlify;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function authCallbackUrl(next = "/auth/set-password") {
  return `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}
