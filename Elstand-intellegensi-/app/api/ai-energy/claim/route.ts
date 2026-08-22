import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { claimDailyEnergy } from "@/lib/energy";

// POST /api/ai-energy/claim — "Claim Daily Reward" (brief). +10 Energy,
// gated by 24h since the last claim (not a midnight reset — see
// lib/energy.ts's claimDailyEnergy). Safe to spam-click: the DB-level
// compare-and-swap in applyDelta() means only one claim within the same
// window can ever succeed, so this can't be used to farm free Energy.
export async function POST() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const result = await claimDailyEnergy(supabase, user.id);
  if (!result.ok) {
    if (result.error === "too_soon") {
      return NextResponse.json(
        {
          error: "too_soon",
          message: "Daily reward belum bisa diklaim — coba lagi nanti.",
          balance: result.balance,
          nextClaimAt: result.nextResetAt,
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: result.error ?? "claim_failed", message: "Gagal klaim AI Energy — coba lagi sebentar.", balance: result.balance },
      { status: 500 }
    );
  }

  return NextResponse.json({
    balance: result.balance,
    nextClaimAt: result.nextResetAt,
    canClaim: false,
    granted: 10,
  });
}
