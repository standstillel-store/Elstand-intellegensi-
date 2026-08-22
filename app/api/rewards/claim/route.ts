import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getSupabase } from "@/lib/supabase";
import { getQuestBySlug, claimReward, type RewardSubmissionRow } from "@/lib/rewards/store";

// POST /api/rewards/claim — brief Section 9/11/12/13. Requires the caller
// to already own a CLAIMABLE (or CLAIM_ERROR, for a retry) submission row —
// there is deliberately no path here that skips verify/claims off of a
// bare txHash the client asserts is valid.
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  let body: { quest?: string; txHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { quest: questSlug, txHash } = body;
  if (!questSlug || !txHash) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const quest = await getQuestBySlug(questSlug).catch(() => null);
  if (!quest) return NextResponse.json({ error: "unknown_quest" }, { status: 404 });

  const service = getSupabase();
  if (!service) return NextResponse.json({ error: "service_not_configured" }, { status: 503 });

  // Ownership check: the submission row must belong to the AUTHENTICATED
  // user — never trust a client-supplied userId/walletAddress for this.
  const { data: submissionData, error: findError } = await service
    .from("reward_submissions")
    .select("*")
    .eq("user_id", user.id)
    .eq("quest_id", quest.id)
    .eq("tx_hash", txHash.toLowerCase())
    .maybeSingle();
  if (findError) return NextResponse.json({ error: "lookup_failed", message: findError.message }, { status: 500 });
  if (!submissionData) return NextResponse.json({ status: "NOT_CLAIMABLE", error: "no_verified_submission", message: "Verify this transaction before claiming." }, { status: 404 });

  const submission = submissionData as RewardSubmissionRow;

  try {
    const result = await claimReward(submission, quest);
    switch (result.outcome) {
      case "CLAIMED":
        return NextResponse.json({ status: "CLAIMED", reward: result.reward });
      case "ALREADY_CLAIMED":
        return NextResponse.json({ status: "ALREADY_CLAIMED", eligible: false, retryable: false }, { status: 409 });
      case "CLAIM_IN_PROGRESS":
        return NextResponse.json({ status: "CLAIM_IN_PROGRESS", eligible: false, retryable: true }, { status: 409 });
      case "NOT_CLAIMABLE":
        return NextResponse.json({ status: result.submission.status, eligible: false, retryable: false, message: "This submission is not currently claimable." }, { status: 409 });
      case "CLAIM_ERROR":
        return NextResponse.json({ status: "CLAIM_ERROR", eligible: true, retryable: true, message: "Your transaction was verified, but the reward transfer failed. Your eligibility is preserved. Retry claim." }, { status: 500 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[api/rewards/claim]", message);
    return NextResponse.json({ status: "CLAIM_ERROR", eligible: true, retryable: true, message: "Claim service temporarily unavailable." }, { status: 500 });
  }
}
