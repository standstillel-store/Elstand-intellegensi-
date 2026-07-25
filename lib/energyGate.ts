import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { spendEnergy } from "@/lib/energy";

/**
 * Drop this at the top of any route that does real AI analysis work
 * ("Analisis AI mengurangi token sesuai fitur" — brief section 6):
 *
 *   const blocked = await chargeEnergy(1, "chat");
 *   if (blocked) return blocked;
 *
 * Returns null to mean "proceed" — either the charge succeeded, or Supabase
 * Auth isn't configured / no one is signed in, in which case metering is
 * skipped entirely rather than blocking the request. That matches every
 * other optional integration in this app (see lib/supabase.ts,
 * lib/alchemy.ts): local dev and not-yet-authenticated visitors keep
 * working, energy only actually gates once a real account is involved.
 * Returns a ready-to-return 402 NextResponse when a signed-in user is out
 * of AI Energy for the day.
 */
export async function chargeEnergy(amount: number, reason: string): Promise<NextResponse | null> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const result = await spendEnergy(supabase, user.id, amount, reason);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "insufficient_energy",
        message: "AI Energy kamu habis untuk hari ini — reset otomatis dalam 24 jam.",
        balance: result.balance,
      },
      { status: 402 }
    );
  }
  return null;
}
