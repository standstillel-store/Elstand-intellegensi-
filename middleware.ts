import { createServerClient, type CookieOptions } from "@supabase/ssr";
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
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: "", ...options });
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
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
