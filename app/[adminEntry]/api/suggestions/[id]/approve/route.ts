import { NextResponse } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { approveSuggestion } from "@/lib/suggestions/store";
import { grantSuggestionAiEnergy } from "@/lib/suggestions/claim";
import { SUGGESTION_BASE_ELS_REWARD, SUGGESTION_AI_ENERGY_REWARD } from "@/lib/suggestions/config";
import { logAdminAction } from "@/lib/admin/auditLog";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Phase 6.6.4 — approve.
//
// Reward model (fixed, server-side — the request body can influence ONLY
// adminBonusEls, and even that is clamped to >= 0 both here and again in
// approveSuggestion()):
//
//   totalElsReward = SUGGESTION_BASE_ELS_REWARD (40) + adminBonusEls
//   aiEnergyReward = SUGGESTION_AI_ENERGY_REWARD (10), always — not
//                    accepted from the request body at all.
//
// ELS is NOT paid out here — it only becomes claimable (status ->
// APPROVED, reward_amount persisted). AI Energy IS granted here,
// immediately, since it has no separate on-chain claim step (brief:
// "AI Energy must only be granted after the Suggestion is approved").
// ---------------------------------------------------------------------------

export async function POST(request: Request, { params }: { params: { adminEntry: string; id: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { adminBonusEls?: unknown };
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — adminBonusEls defaults to 0 (base reward only).
    body = {};
  }

  const adminBonusElsRaw = body.adminBonusEls === undefined ? 0 : Number(body.adminBonusEls);
  if (!Number.isFinite(adminBonusElsRaw) || adminBonusElsRaw < 0) {
    return NextResponse.json({ error: "Admin bonus (ELS) harus angka >= 0." }, { status: 400 });
  }
  const adminBonusEls = adminBonusElsRaw;

  try {
    const suggestion = await approveSuggestion(params.id, { adminBonusEls, approvedBy: "admin" });
    if (!suggestion) {
      return NextResponse.json({ error: "Saran tidak ditemukan atau sudah diproses sebelumnya." }, { status: 409 });
    }

    // AI Energy grant failing must never fail the approval itself — the
    // suggestion is already APPROVED/claimable for ELS; a failed AI Energy
    // grant can be retried later (ai_energy_granted_at stays null, and
    // grantSuggestionAiEnergy is idempotent via that same column) rather
    // than silently dropped.
    const energyResult = await grantSuggestionAiEnergy(suggestion);
    if (!energyResult.ok) {
      console.error("[suggestions admin] AI Energy grant failed:", energyResult.error);
    }

    const ip = getRequestIp(request as unknown as import("next/server").NextRequest);
    await logAdminAction("SUGGESTION_APPROVED", {
      ipHash: hashIp(ip),
      metadata: {
        suggestionId: suggestion.id,
        publicId: suggestion.public_id,
        baseRewardEls: SUGGESTION_BASE_ELS_REWARD,
        adminBonusEls,
        totalRewardEls: SUGGESTION_BASE_ELS_REWARD + adminBonusEls,
        aiEnergyReward: SUGGESTION_AI_ENERGY_REWARD,
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      publicId: suggestion.public_id,
      baseRewardEls: suggestion.base_reward_els,
      adminBonusEls: suggestion.admin_bonus_els,
      totalRewardEls: suggestion.reward_amount,
      aiEnergyReward: suggestion.ai_energy_amount,
      aiEnergyGranted: energyResult.ok,
    });
  } catch (err) {
    console.error("[suggestions admin] approve failed:", err);
    return NextResponse.json({ error: "Gagal menyetujui saran." }, { status: 500 });
  }
}
