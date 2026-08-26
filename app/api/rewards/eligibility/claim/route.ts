import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";
import { claimEligibleReward } from "@/lib/rewards/eligibility";

// POST /api/rewards/eligibility/claim — Phase 6.6.3.2's CLAIM step.
//
// Unlike GET /api/rewards/eligibility (any address, read-only), this is a
// privileged action: the wallet that receives ELS is ALWAYS the caller's
// own primary/verified wallet (lib/wallet/primary.ts — the exact same rule
// app/api/rewards/verify already enforces), never a client-supplied
// address. Any walletAddress in the body is UX-only (a fast client-side
// mismatch message) and is checked against, never trusted as, the
// recipient — otherwise a signed-in user could submit someone else's
// qualifying address and have the reward land in their own session.
//
// The reward amount is NEVER read from the request body — claimEligibleReward()
// recalculates eligibility and the total reward from scratch, server-side.
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  let body: { walletAddress?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — walletAddress is optional UX-only input.
  }
  if (body.walletAddress !== undefined && !isAddress(body.walletAddress)) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
  }

  const wallet = await getPrimaryVerifiedWallet(supabase, user.id);
  if (!wallet) {
    return NextResponse.json({ error: "no_verified_wallet", message: "Link and verify a wallet first." }, { status: 400 });
  }
  if (body.walletAddress && body.walletAddress.toLowerCase() !== wallet.wallet_address.toLowerCase()) {
    return NextResponse.json(
      { error: "wallet_mismatch", message: "Your verified wallet doesn't match the address shown — refresh and try again." },
      { status: 409 }
    );
  }

  try {
    const result = await claimEligibleReward(user.id, wallet.wallet_address);

    switch (result.outcome) {
      case "CLAIMED":
        return NextResponse.json({ status: "CLAIMED", txHash: result.txHash, totalReward: result.totalReward });
      case "NOT_ELIGIBLE":
        return NextResponse.json({ status: "NOT_ELIGIBLE", reasons: result.reasons }, { status: 409 });
      case "ALREADY_CLAIMED":
        return NextResponse.json({ status: "ALREADY_CLAIMED" }, { status: 409 });
      case "CLAIM_IN_PROGRESS":
        return NextResponse.json({ status: "CLAIM_IN_PROGRESS" }, { status: 409 });
      case "DISTRIBUTOR_NOT_CONFIGURED":
        return NextResponse.json({ status: "DISTRIBUTOR_NOT_CONFIGURED", message: "Reward distribution is currently being configured." }, { status: 503 });
      case "CLAIM_ERROR":
        return NextResponse.json({ status: "CLAIM_ERROR", reason: result.reason, detail: result.detail }, { status: 500 });
    }
  } catch (err) {
    console.error("[eligibility/claim] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ status: "CLAIM_ERROR", reason: "internal_error" }, { status: 500 });
  }
}
