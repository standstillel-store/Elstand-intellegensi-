import { NextResponse } from "next/server";
import { isAddress, isHash } from "viem";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getQuestBySlug, getOrCreateSubmission, runVerification, normalizeWallet, SubmissionOwnershipError } from "@/lib/rewards/store";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";
import { LIQUIDITY_QUEST_CHAIN_CONFIG, BUY_ELS_QUEST_CONFIG, LIQUIDITY_QUEST_CONFIGURED, BUY_ELS_QUEST_CONFIGURED } from "@/lib/rewards/config";

// POST /api/rewards/verify — brief Section 7 + Phase 6.6 Section 11. The
// frontend sends { quest, txHash, walletAddress }, but walletAddress is
// UX-only from here on — a hint for a fast client-side mismatch message,
// never itself a source of identity. The wallet actually used for
// verification, storage, and reward eligibility is always re-derived
// server-side from the caller's linked-and-VERIFIED primary wallet
// (lib/wallet/primary.ts). A request whose walletAddress doesn't match
// that wallet is rejected before any submission row is created — otherwise
// a signed-in user could submit an address they never proved ownership of
// (any address that happens to have a qualifying on-chain tx) and collect
// a reward for it.
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

  const { quest: questSlug, txHash, walletAddress: claimedWalletAddress } = body;
  if (!questSlug || !txHash) {
    return NextResponse.json({ error: "missing_fields", message: "quest and txHash are required." }, { status: 400 });
  }
  if (!isHash(txHash)) return NextResponse.json({ status: "INVALID", eligible: false, retryable: false, reason: "Malformed transaction hash." }, { status: 400 });
  if (claimedWalletAddress !== undefined && !isAddress(claimedWalletAddress)) {
    return NextResponse.json({ status: "INVALID", eligible: false, retryable: false, reason: "Malformed wallet address." }, { status: 400 });
  }

  // Section 11 — the ONLY wallet identity this route trusts. Must be
  // linked to this authenticated user AND signature-verified; an
  // unverified `wallets` row (address merely seen, ownership never
  // signed) does not count.
  const linkedWallet = await getPrimaryVerifiedWallet(supabase, user.id);
  if (!linkedWallet) {
    return NextResponse.json(
      {
        status: "INVALID",
        eligible: false,
        retryable: false,
        reason: "No verified wallet is linked to your account. Connect and verify a wallet in Settings before submitting a quest.",
      },
      { status: 409 }
    );
  }
  if (claimedWalletAddress && normalizeWallet(claimedWalletAddress) !== normalizeWallet(linkedWallet.wallet_address)) {
    return NextResponse.json(
      {
        status: "INVALID",
        eligible: false,
        retryable: false,
        reason: "Your connected wallet doesn't match your verified linked wallet. Switch wallets, or update your primary wallet in Settings.",
      },
      { status: 409 }
    );
  }
  const walletAddress = linkedWallet.wallet_address;

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
