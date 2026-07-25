import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { upsertUserProfile } from "@/lib/auth/profile";

// Google → Supabase redirects here with ?code=... after the consent screen.
// We exchange that code for a session (sets the sb-* cookies), upsert this
// account's users/profiles/ai_token/user_settings rows — creates them on a
// first-ever login, just refreshes last_login_at/name/avatar on every login
// after that (see lib/auth/profile.ts) — and continue on to wherever the
// user was headed, /dashboard by default.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const cookieStore = cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (url && anonKey) {
      const supabase = createServerClient(url, anonKey, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      });

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        // Best-effort — upsertUserProfile never throws, so a hiccup writing
        // the profile row doesn't block sign-in itself.
        await upsertUserProfile(supabase, data.user);
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
