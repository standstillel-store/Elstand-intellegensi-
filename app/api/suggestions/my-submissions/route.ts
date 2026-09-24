import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { listSuggestionsForUser } from "@/lib/suggestions/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const suggestions = await listSuggestionsForUser(user.id);
    return NextResponse.json({
      suggestions: suggestions.map((s) => ({
        id: s.id,
        publicId: s.public_id,
        title: s.title,
        category: s.category,
        status: s.status,
        rewardAmount: s.reward_amount,
        baseRewardEls: s.base_reward_els,
        adminBonusEls: s.admin_bonus_els,
        aiEnergyAmount: s.ai_energy_amount,
        aiEnergyGranted: Boolean(s.ai_energy_granted_at),
        rejectedReason: s.rejected_reason,
        txHash: s.tx_hash,
        createdAt: s.created_at,
      })),
    });
  } catch (err) {
    console.error("[suggestions] list failed:", err);
    return NextResponse.json({ error: "Gagal memuat daftar saran." }, { status: 500 });
  }
}
