import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Everything a signed-in user reaches after Google login. The marketing
// pages (/, /privacy-policy, /terms, /contact, /methodology) stay public on
// purpose — they're what Google Ads and search crawlers see.
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

export async function middleware(request: NextRequest) {
  // Reassigned inside setAll below every time Supabase refreshes the
  // session, so it always carries the newest cookies. This exact object —
  // not a freshly-constructed NextResponse — is what every return path
  // below must send back, redirects included. Building a plain
  // `NextResponse.redirect(...)` instead would silently drop a
  // just-refreshed session cookie, which is a classic way to end up in a
  // login loop (browser and server disagree about the session on the very
  // next request).
  let response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase auth isn't wired up yet (env vars not set) — let requests
  // through rather than locking the app out of its own dashboard during
  // local setup. Add the two env vars to enable the real gate.
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

  // getUser() (not getSession()) — it revalidates the token against the
  // Auth server on every request instead of just trusting what's in the
  // cookie, and it's what actually triggers the auto-refresh above when the
  // access token is close to expiring.
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
  ],
};
