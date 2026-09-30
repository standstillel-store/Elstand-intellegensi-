import { NextResponse } from "next/server";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { distributeSuggestionRewardServerSide } from "@/lib/suggestions/distribute";
import { logAdminAction } from "@/lib/admin/auditLog";
import { getRequestIp } from "@/lib/admin/requestIp";
import { hashIp } from "@/lib/admin/crypto";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Phase 6.6.4b — retry-distribution.
//
// Only relevant for a Suggestion that is APPROVED with a failed prior
// distribution attempt (last_error_message set) — e.g. the distributor
// contract was temporarily out of ELS. Calls the exact same
// distributeSuggestionRewardServerSide() the approve route already calls;
// idempotent by construction (see lib/suggestions/distribute.ts), so this
// can safely be hit multiple times, including concurrently, without ever
// producing a second on-chain transfer for the same suggestion.
// ---------------------------------------------------------------------------

export async function POST(request: Request, { params }: { params: { adminEntry: string; id: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!requireAdminSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const distribution = await distributeSuggestionRewardServerSide(params.id);

    const ip = getRequestIp(request as unknown as import("next/server").NextRequest);
    await logAdminAction("SUGGESTION_DISTRIBUTION_RETRIED", {
      ipHash: hashIp(ip),
      metadata: {
        suggestionId: params.id,
        outcome: distribution.outcome,
        txHash: distribution.outcome === "REWARDED" ? distribution.txHash : undefined,
      },
    }).catch(() => {});

    switch (distribution.outcome) {
      case "REWARDED":
        return NextResponse.json({ status: "REWARDED", txHash: distribution.txHash, rewardAmount: distribution.rewardAmount });
      case "ALREADY_REWARDED":
        return NextResponse.json({ status: "ALREADY_REWARDED" });
      case "IN_PROGRESS":
        return NextResponse.json({ status: "IN_PROGRESS" }, { status: 409 });
      case "NOT_APPROVED":
        return NextResponse.json({ status: "NOT_APPROVED" }, { status: 409 });
      case "DISTRIBUTOR_NOT_CONFIGURED":
        return NextResponse.json({ status: "DISTRIBUTOR_NOT_CONFIGURED" }, { status: 503 });
      case "DISTRIBUTE_ERROR":
        return NextResponse.json({ status: "DISTRIBUTE_ERROR", reason: distribution.reason, detail: distribution.detail }, { status: 500 });
    }
  } catch (err) {
    console.error("[suggestions admin] retry-distribution failed:", err);
    return NextResponse.json({ status: "DISTRIBUTE_ERROR", reason: "internal_error" }, { status: 500 });
  }
}
