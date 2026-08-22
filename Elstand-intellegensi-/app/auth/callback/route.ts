import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { upsertUserProfile } from "@/lib/auth/profile";
import { activateReferral, REFERRAL_COOKIE_NAME } from "@/lib/referral";

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
        // Section 16: referral must reward only on a genuine onboarding
        // event, never merely because a referral URL was opened. Detect
        // "genuinely new user" by checking for an existing `users` row
        // BEFORE upsertUserProfile creates/refreshes it — this is the one
        // place in the whole app where that distinction is unambiguous
        // (every account, wallet-linked or not, is created here — see the
        // note in app/api/wallet/session/route.ts).
        const { data: existingUserRow } = await supabase.from("users").select("id").eq("id", data.user.id).maybeSingle();
        const isNewUser = !existingUserRow;

        await upsertUserProfile(supabase, data.user);

        if (isNewUser) {
          const referralCode = cookieStore.get(REFERRAL_COOKIE_NAME)?.value ?? null;
          try {
            await activateReferral({ referredUserId: data.user.id, referralCode });
          } catch (err) {
            // Best-effort: a referral-system hiccup must never block sign-in.
            console.error("[auth/callback] activateReferral failed:", err instanceof Error ? err.message : err);
          }
          cookieStore.delete(REFERRAL_COOKIE_NAME);
        }

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
