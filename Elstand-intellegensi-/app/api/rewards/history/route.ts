import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getSupabase } from "@/lib/supabase";

// GET /api/rewards/history — claimed reward history (brief Section 7's
// route list). Reads through the service-role client and filters by the
// authenticated user's own submissions, since reward_claims itself is keyed
// by submission_id/wallet rather than user_id directly.
export async function GET() {
  const supabase = createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const service = getSupabase();
  if (!service) return NextResponse.json({ history: [] });

  const { data: submissions } = await service.from("reward_submissions").select("id, tx_hash, quest_id").eq("user_id", user.id);
  const submissionIds = (submissions ?? []).map((s) => s.id);
  if (submissionIds.length === 0) return NextResponse.json({ history: [] });

  const { data: claims, error } = await service
    .from("reward_claims")
    .select("id, submission_id, quest_id, reward_els, reward_ai_energy, status, claim_tx_hash, created_at, completed_at")
    .in("submission_id", submissionIds)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });

  const questIds = Array.from(new Set((claims ?? []).map((c) => c.quest_id)));
  const { data: quests } = await service.from("reward_quests").select("id, slug, name").in("id", questIds.length > 0 ? questIds : [""]);
  const questById = new Map((quests ?? []).map((q) => [q.id, q]));
  const submissionById = new Map((submissions ?? []).map((s) => [s.id, s]));

  const history = (claims ?? []).map((c) => ({
    id: c.id,
    questSlug: questById.get(c.quest_id)?.slug ?? "unknown",
    questName: questById.get(c.quest_id)?.name ?? "Unknown quest",
    rewardEls: c.reward_els,
    rewardAiEnergy: c.reward_ai_energy,
    status: c.status,
    txHash: submissionById.get(c.submission_id)?.tx_hash ?? null,
    createdAt: c.created_at,
    completedAt: c.completed_at,
  }));

  return NextResponse.json({ history });
}
