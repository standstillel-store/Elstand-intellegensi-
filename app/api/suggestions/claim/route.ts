import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getSupabase } from "@/lib/supabase";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";
import { claimSuggestionReward } from "@/lib/suggestions/claim";
import { checkSuggestionClaimRateLimit } from "@/lib/suggestions/rateLimit";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";

// ---------------------------------------------------------------------------
// Phase 6.6.4 — POST /api/suggestions/claim.
//
// Same rule as app/api/rewards/eligibility/claim/route.ts: the wallet that
// receives ELS is ALWAYS the caller's own primary/verified wallet, never a
// client-supplied address. The reward amount is never read from the request
// body — claimSuggestionReward() reads it from the suggestion row the admin
// already approved.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request);
  const rateLimit = checkSuggestionClaimRateLimit(hashIp(ip));
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti.", retryAfterSeconds: rateLimit.retryAfterSeconds }, { status: 429 });
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  let body: { suggestionId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  const suggestionId = typeof body.suggestionId === "string" ? body.suggestionId : "";
  if (!suggestionId) return NextResponse.json({ error: "suggestionId wajib diisi." }, { status: 400 });

  const sb = getSupabase();
  const wallet = sb ? await getPrimaryVerifiedWallet(sb, user.id) : null;
  if (!wallet) {
    return NextResponse.json({ error: "no_verified_wallet", message: "Link and verify a wallet first." }, { status: 400 });
  }

  try {
    const result = await claimSuggestionReward({ suggestionId, userId: user.id, walletAddress: wallet.wallet_address });

    switch (result.outcome) {
      case "CLAIMED":
        return NextResponse.json({ status: "CLAIMED", txHash: result.txHash, rewardAmount: result.rewardAmount });
      case "NOT_FOUND":
        return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
      case "FORBIDDEN":
        return NextResponse.json({ status: "FORBIDDEN" }, { status: 403 });
      case "NOT_APPROVED":
        return NextResponse.json({ status: "NOT_APPROVED" }, { status: 409 });
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
    console.error("[suggestions/claim] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ status: "CLAIM_ERROR", reason: "internal_error" }, { status: 500 });
  }
}
