import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { activateReferral, REFERRAL_COOKIE_NAME } from "@/lib/referral";

// POST /api/referral/activate — brief Section 7's route list. Primary
// activation happens server-side in app/auth/callback/route.ts, right after
// a genuinely new `users` row is created (Section 16's "real onboarding
// event"). This route exists as an idempotent fallback for the same flow —
// e.g. a client-side retry after a transient failure — NOT as a new way to
// grant a referral: referredUserId always comes from the current session,
// never from the request body, and activateReferral() itself is guarded by
// UNIQUE(referred_user_id) so calling this twice can never grant twice.
export async function POST() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const cookieStore = cookies();
  const referralCode = cookieStore.get(REFERRAL_COOKIE_NAME)?.value ?? null;

  try {
    const result = await activateReferral({ referredUserId: user.id, referralCode });
    if (referralCode) cookieStore.delete(REFERRAL_COOKIE_NAME);
    if (!result.ok) return NextResponse.json({ error: "activation_failed", message: result.reason }, { status: 500 });
    return NextResponse.json({ status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: "internal_error", message }, { status: 500 });
  }
}
