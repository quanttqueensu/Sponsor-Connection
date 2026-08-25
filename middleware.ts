import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { userNeedsPassword } from "@/lib/auth-session";

/**
 * Routes reachable without a session.
 *
 * These are listed one by one on purpose. The bare prefix `/auth` used to be
 * here, which made every future `/auth/*` route public by accident rather than
 * by decision. **A new auth route is private until someone adds it here
 * deliberately** — and if you add one, say why in a comment.
 *
 *  - `/`, `/for-companies` — public brochure pages.
 *  - `/login`              — the sign-in form itself.
 *  - `/join`               — public sponsor access-request form.
 *  - `/auth/callback`      — lands the invite/recovery link. The tokens arrive
 *                            in the URL hash and are exchanged client-side, so
 *                            there is no session yet when this route loads.
 *  - `/auth/set-password`  — an invited user may land here before the client
 *                            has finished establishing the session; the page
 *                            renders <AwaitInviteSession /> in that window.
 */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/for-companies",
  "/join",
  "/auth/callback",
  "/auth/set-password",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Fail closed in production: without these the rest of this function
    // cannot authenticate, and returning next() would make every route public.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Service unavailable", { status: 503 });
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (user && userNeedsPassword(user) && !pathname.startsWith("/auth/")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/auth/set-password";
    const res = NextResponse.redirect(redirect);
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  }

  if (!user && !isPublic(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    return NextResponse.redirect(redirect);
  }

  if (user && (pathname === "/login" || pathname === "/")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (pathname === "/login" && profile && !userNeedsPassword(user)) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = profile.role === "company_user" ? "/company" : "/feed";
      const res = NextResponse.redirect(redirect);
      supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
      return res;
    }
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "company_user") {
      const blocked =
        pathname.startsWith("/feed") ||
        pathname.startsWith("/members") ||
        pathname.startsWith("/packages") ||
        pathname.startsWith("/applications") ||
        pathname.startsWith("/profile") ||
        pathname.startsWith("/messages") ||
        pathname.startsWith("/admin") ||
        pathname === "/";
      if (blocked) {
        const redirect = request.nextUrl.clone();
        redirect.pathname = "/company";
        const res = NextResponse.redirect(redirect);
        supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
        return res;
      }
    }

    if (profile?.role === "member") {
      if (pathname.startsWith("/company")) {
        const redirect = request.nextUrl.clone();
        redirect.pathname = "/feed";
        const res = NextResponse.redirect(redirect);
        supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
        return res;
      }
      if (pathname.startsWith("/admin") && !profile.is_admin) {
        const redirect = request.nextUrl.clone();
        redirect.pathname = "/feed";
        const res = NextResponse.redirect(redirect);
        supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
        return res;
      }
      if (pathname === "/") {
        const redirect = request.nextUrl.clone();
        redirect.pathname = "/feed";
        const res = NextResponse.redirect(redirect);
        supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
        return res;
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on everything except real static-asset locations.
     *
     * The exclusions are anchored to the start of the path. The previous
     * pattern excluded *any* path ending in an image extension, so application
     * routes such as `/members/<id>.png` or `/admin/<id>.png` skipped the
     * middleware entirely. Asset paths are a property of where a file lives,
     * not of how its URL happens to end.
     */
    "/((?!_next/|favicon\\.ico|favicon\\.png|images/|robots\\.txt|sitemap\\.xml).*)",
  ],
};
