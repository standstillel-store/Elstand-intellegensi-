import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { upsertUserProfile } from "@/lib/auth/profile";

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
        await upsertUserProfile(supabase, data.user);
        return NextResponse.redirect(`${origin}${next}`);
      }

      // "flow_state_already_used" fires when this exact code was already
      // exchanged — almost always a duplicate callback hit (a second tab, a
      // browser/messaging-app link prefetch, bfcache replaying an old
      // navigation), not a genuine sign-in failure. If an earlier hit
      // already succeeded, a valid session is already sitting in cookies
      // from that first exchange — check before showing an error for what
      // would otherwise look like "it worked, then it randomly failed."
      const isFlowStateReplay = error?.code === "flow_state_already_used" || /flow.?state/i.test(error?.message ?? "");
      if (isFlowStateReplay) {
        const { data: existing } = await supabase.auth.getUser();
        if (existing.user) {
          return NextResponse.redirect(`${origin}${next}`);
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
