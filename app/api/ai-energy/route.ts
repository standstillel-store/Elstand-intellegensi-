import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getEnergyBalance } from "@/lib/energy";

// GET /api/ai-energy — "Mengambil balance" (brief). The canonical read
// endpoint for Phase 3.2's AI Energy UI (Settings card, Dashboard widget
// both hit this). Also includes recent transactions, same as the older
// app/api/account/energy/route.ts (Phase 3.1) did — that route is left
// alone and still works for whatever already calls it, but nothing new
// added in Phase 3.2 calls it; this route is the one going forward.
// ProfileMenu reads from app/api/account/me/route.ts instead, since that
// endpoint already bundles profile + wallet + energy in one round trip.
export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const [state, { data: transactions }] = await Promise.all([
    getEnergyBalance(supabase, user.id),
    supabase
      .from("ai_token_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json({
    balance: state.balance,
    lastClaimAt: state.lastResetAt,
    nextClaimAt: state.nextResetAt,
    canClaim: state.canClaim,
    transactions: transactions ?? [],
  });
}
