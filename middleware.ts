import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { userNeedsPassword } from "@/lib/auth-session";

const PUBLIC_PATHS = ["/", "/login", "/auth", "/for-companies", "/join"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
