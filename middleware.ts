import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/ai-signal",
  "/ai-performance",
  "/ai-journal",
  "/scanner",
  "/portfolio",
  "/trading",
  "/settings",
  "/paper-trader",
  "/news",
  "/whale",
  "/economic-calendar",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const REFERRAL_COOKIE_NAME = "els_ref";
const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  // Referral capture (brief Section 16) — first-touch only: a link like
  // /earn?ref=CODE (or any page with that query param) stores the code in a
  // cookie so it survives through OAuth redirect and back, WITHOUT itself
  // granting anything — app/auth/callback/route.ts is what actually
  // activates/rewards it, and only for a genuinely new account. If a
  // cookie is already set, a later ?ref= link never overwrites it (the
  // first referrer a person's link came from is the one that counts).
  const refParam = request.nextUrl.searchParams.get("ref");
  if (refParam && !request.cookies.get(REFERRAL_COOKIE_NAME)) {
    response.cookies.set(REFERRAL_COOKIE_NAME, refParam.toUpperCase().slice(0, 16), {
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (user && pathname === "/login") {
    const redirect = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/ai-signal/:path*",
    "/ai-performance/:path*",
    "/ai-journal/:path*",
    "/scanner/:path*",
    "/portfolio/:path*",
    "/trading/:path*",
    "/settings/:path*",
    "/paper-trader/:path*",
    "/news/:path*",
    "/whale/:path*",
    "/economic-calendar/:path*",
    "/login",
    "/earn/:path*", // referral links point here (?ref=CODE) — added for referral-cookie capture, /earn itself is not auth-gated
    "/",
  ],
};
