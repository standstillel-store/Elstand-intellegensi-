import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { checkEligibility } from "@/lib/rewards/eligibility";

// GET /api/rewards/eligibility?wallet=0x... — Phase 6.6.3.2 Eligible Reward
// Center's CHECK step. Read-only: computes eligibility fresh from
// leaderboard rank, verified Buy ELS history, and rewarded bug bounty
// records for whatever address is passed in. This is intentionally
// wallet-address-scoped rather than session-scoped (unlike /claim below) —
// checking eligibility for an address is not a privileged action (the
// leaderboard itself is already public), it just answers "would this
// address currently qualify". No reward is ever granted here.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: "invalid_wallet", message: "A valid wallet address is required." }, { status: 400 });
  }

  try {
    const result = await checkEligibility(wallet);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[eligibility/check] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "eligibility_check_failed" }, { status: 500 });
  }
}
