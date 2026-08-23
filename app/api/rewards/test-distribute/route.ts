import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getPrimaryVerifiedWallet } from "@/lib/wallet/primary";
import { TEST_DISTRIBUTE_ENABLED, TEST_DISTRIBUTE_AMOUNT_ELS, REWARD_DISTRIBUTOR_CONFIGURED } from "@/lib/rewards/config";
import { attemptDistributorTransfer } from "@/lib/rewards/distributor";

/**
 * TEMPORARY — see TEST_DISTRIBUTE_ENABLED in lib/rewards/config.ts for why
 * this exists and when to remove it. Sends a fixed TEST_DISTRIBUTE_AMOUNT_ELS
 * (1 ELS) to the caller's own PRIMARY VERIFIED wallet — never a
 * client-supplied address, same rule as every other reward path in this
 * codebase — with no quest/verification step in between. Gated on:
 *   1. ENABLE_TEST_DISTRIBUTE=true (explicit opt-in, off by default)
 *   2. a real signed-in session (no anonymous calls)
 *   3. the caller having an actual verified primary wallet on file
 * This is NOT rate-limited beyond the distributor contract's own
 * `claimed[claimId]` replay guard (a fresh random claimId every call means
 * this CAN be called repeatedly) — acceptable for a temporary test-only
 * route gated behind an env flag, not acceptable as a permanent feature.
 */
export async function POST() {
  if (!TEST_DISTRIBUTE_ENABLED) {
    return NextResponse.json({ error: "Test distribute is disabled." }, { status: 404 });
  }
  if (!REWARD_DISTRIBUTOR_CONFIGURED) {
    return NextResponse.json({ error: "Reward distributor is not configured yet." }, { status: 503 });
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Auth belum dikonfigurasi." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const wallet = await getPrimaryVerifiedWallet(supabase, user.id);
  if (!wallet) {
    return NextResponse.json({ error: "No verified primary wallet on file. Connect + verify a wallet first." }, { status: 400 });
  }

  const result = await attemptDistributorTransfer({
    walletAddress: wallet.wallet_address,
    amountElsTestnet: TEST_DISTRIBUTE_AMOUNT_ELS,
    submissionId: `test-distribute:${user.id}:${randomUUID()}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: `Distribute failed: ${result.reason}${result.detail ? ` — ${result.detail}` : ""}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, txHash: result.txHash, amount: TEST_DISTRIBUTE_AMOUNT_ELS, to: wallet.wallet_address });
}
