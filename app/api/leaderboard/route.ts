import { NextResponse } from "next/server";
import { getRankedContributors } from "@/lib/leaderboard";

// GET /api/leaderboard — Top Contributors.
//
// Ranking logic (source tables, tiebreak rule, "current balance not
// lifetime total" caveat) now lives in lib/leaderboard.ts's
// getRankedContributors() — extracted unchanged in Phase 6.6.3.2 so
// lib/rewards/eligibility.ts's TOP 10 check reuses the exact same
// computation instead of standing up a second leaderboard. This route is
// now just "compute the full ranking, return the top 10" — identical
// response shape to before.
export async function GET() {
  try {
    const contributors = await getRankedContributors();
    return NextResponse.json({ contributors: contributors.slice(0, 10), basis: "current_balance" as const });
  } catch (err) {
    console.error("[leaderboard] failed to aggregate:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "leaderboard_unavailable", contributors: [] }, { status: 500 });
  }
}
