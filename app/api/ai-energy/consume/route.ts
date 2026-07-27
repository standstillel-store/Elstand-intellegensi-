import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { spendEnergy, FEATURE_COSTS, type EnergyFeature } from "@/lib/energy";

// POST /api/ai-energy/consume — "Digunakan internal" (brief): validates
// balance, deducts, updates the DB, returns the latest balance. A plain
// validate-then-spend primitive over HTTP, for anything that wants to debit
// Energy directly.
//
// The three actual gated features (Analyze Coin, Generate AI Signal, AI
// Agent Chat — app/api/token-analysis, app/api/ai-signals, app/api/chat)
// do NOT call this route over HTTP; they import reserveEnergy/settleEnergy
// from lib/energyGate.ts directly (a same-process function call, not a
// self-fetch back into this Next.js server) because their brief-mandated
// "kurangi hanya kalau berhasil" behavior needs a refund-on-failure step
// this plain endpoint doesn't have. Both paths share the same lib/energy.ts
// spend logic underneath, so balances stay consistent either way.
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { feature?: string };
  try {
    body = (await req.json()) as { feature?: string };
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const feature = body.feature as EnergyFeature | undefined;
  if (!feature || !(feature in FEATURE_COSTS)) {
    return NextResponse.json(
      { error: "invalid_feature", message: `feature harus salah satu dari: ${Object.keys(FEATURE_COSTS).join(", ")}.` },
      { status: 400 }
    );
  }

  const cost = FEATURE_COSTS[feature];
  const result = await spendEnergy(supabase, user.id, cost, feature);
  if (!result.ok) {
    return NextResponse.json(
      { error: "insufficient_energy", message: "AI Energy tidak mencukupi.", balance: result.balance },
      { status: 402 }
    );
  }

  return NextResponse.json({ balance: result.balance, feature, cost });
}
