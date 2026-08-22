import { NextResponse } from "next/server";
import { isAddress, isHash } from "viem";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getQuestBySlug, getOrCreateSubmission, runVerification, normalizeWallet, SubmissionOwnershipError } from "@/lib/rewards/store";
import { LIQUIDITY_QUEST_CHAIN_CONFIG, BUY_ELS_QUEST_CONFIG, LIQUIDITY_QUEST_CONFIGURED, BUY_ELS_QUEST_CONFIGURED } from "@/lib/rewards/config";

// POST /api/rewards/verify — brief Section 7. The ONLY thing the frontend
// contributes is { quest, txHash, walletAddress } (Section 2); everything
// else is re-derived server-side and independently checked against chain
// data (lib/rewards/verifier.ts) before any status is returned.
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  let body: { quest?: string; txHash?: string; walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { quest: questSlug, txHash, walletAddress } = body;
  if (!questSlug || !txHash || !walletAddress) {
    return NextResponse.json({ error: "missing_fields", message: "quest, txHash, and walletAddress are required." }, { status: 400 });
  }
  if (!isHash(txHash)) return NextResponse.json({ status: "INVALID", eligible: false, retryable: false, reason: "Malformed transaction hash." }, { status: 400 });
  if (!isAddress(walletAddress)) return NextResponse.json({ status: "INVALID", eligible: false, retryable: false, reason: "Malformed wallet address." }, { status: 400 });

  const quest = await getQuestBySlug(questSlug).catch(() => null);
  if (!quest) return NextResponse.json({ error: "unknown_quest" }, { status: 404 });
  if (questSlug === "referral") {
    return NextResponse.json({ error: "not_applicable", message: "The referral quest has no transaction to verify." }, { status: 400 });
  }

  // Section 18/20: an unconfigured quest (no deployed contract yet) must
  // never silently "pass" — fail closed as a non-retryable system state
  // distinct from a real verification failure, matching the "Coming Soon"
  // treatment the rest of this codebase already uses for null contracts.
  if (questSlug === "add_liquidity" && !LIQUIDITY_QUEST_CONFIGURED) {
    return NextResponse.json({ status: "SYSTEM_ERROR", eligible: false, retryable: false, reason: "This quest is not yet configured on this deployment." }, { status: 503 });
  }
  if (questSlug === "buy_els" && !BUY_ELS_QUEST_CONFIGURED) {
    return NextResponse.json({ status: "SYSTEM_ERROR", eligible: false, retryable: false, reason: "This quest is not yet configured on this deployment." }, { status: 503 });
  }

  const chainId = questSlug === "add_liquidity" ? LIQUIDITY_QUEST_CHAIN_CONFIG.chainId : BUY_ELS_QUEST_CONFIG.chainId;
  const wallet = normalizeWallet(walletAddress);

  try {
    const submission = await getOrCreateSubmission({ userId: user.id, walletAddress: wallet, questId: quest.id, txHash, chainId });

    if (submission.status === "CLAIMED") {
      return NextResponse.json({ status: "CLAIMED", eligible: false, retryable: false, reason: "This transaction has already been claimed for this quest." });
    }

    const updated = await runVerification(submission, quest);

    if (updated.status === "CLAIMABLE") {
      return NextResponse.json({
        status: "VALID",
        eligible: true,
        reward: { els: quest.reward_els, aiEnergy: quest.reward_ai_energy },
      });
    }
    if (updated.status === "SYSTEM_ERROR") {
      return NextResponse.json({ status: "SYSTEM_ERROR", eligible: false, retryable: true, reason: updated.last_error_message });
    }
    if (updated.status === "INVALID") {
      return NextResponse.json({ status: "INVALID", eligible: false, retryable: false, reason: updated.last_error_message });
    }
    return NextResponse.json({ status: updated.status, eligible: false, retryable: false });
  } catch (err) {
    if (err instanceof SubmissionOwnershipError) {
      // Section 3 — reject, non-retryable: this hash belongs to a
      // different account's submission for this quest.
      return NextResponse.json({ status: "INVALID", eligible: false, retryable: false, reason: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[api/rewards/verify]", message);
    return NextResponse.json({ status: "SYSTEM_ERROR", eligible: false, retryable: true, reason: "Verification service temporarily unavailable." }, { status: 500 });
  }
}
