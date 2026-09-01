// ---------------------------------------------------------------------------
// ELVOID Intelligence — Autonomous Runtime Batch Runner (Phase 8.2.9 §4-5)
//
// The orchestration boundary's outer layer: fetches the shared inputs one
// symbol's cycle needs from ANOTHER symbol's cycle too (economic
// calendar, news feed — both already-existing fetchers, reused verbatim,
// never re-fetched per symbol), then runs `runAutonomousCycle()`
// sequentially for every symbol in the user's EXISTING watchlist
// (`lib/elvoid/watchlist.ts::getWatchlistCoins()` — the same live,
// user-editable list "Scan Market" already scans; no new hardcoded
// symbol universe is introduced here).
//
// Sequential, not parallel, by design: this keeps outbound request
// volume (Binance candles, news, calendar) bounded and predictable per
// tick, and keeps one symbol's slow/failing cycle from head-of-line
// blocking is a non-issue since each symbol's cycle already fully
// isolates its own failures (see orchestrator.ts) — a slow cycle only
// delays the ones after it within the same tick, it can never corrupt
// them.
// ---------------------------------------------------------------------------

import { getWatchlistCoins } from "@/lib/elvoid/watchlist";
import { getEconomicCalendar } from "@/lib/economiccalendar";
import { getNews } from "@/lib/newsapi";
import { runAutonomousCycle } from "./orchestrator";
import { claimLock } from "./lock";
import type { AutonomousBatchResult, AutonomousCycleResult } from "./contracts";

const AUTONOMOUS_CYCLE_LOCK_ID = "elvoid_pro_oracle_autonomous_cycle";
const DEFAULT_INTERVAL = "15m";

export type AutonomousBatchOutcome = { ran: true; batch: AutonomousBatchResult } | { ran: false; reason: "already_running" | "lock_error"; error?: string };

/**
 * Runs one full batch — every current watchlist symbol, one
 * `runAutonomousCycle()` call each — guarded by the shared runtime lock
 * so two overlapping tick invocations (client-side ping landing mid-way
 * through a Vercel Cron tick, for example) never run two batches
 * concurrently. `lock.claimed === false` with reason `"already_running"`
 * is a normal, expected, non-error outcome — the caller (the tick route)
 * treats it as "nothing to do this call, a batch is already in flight".
 */
export async function runAutonomousBatch(interval: string = DEFAULT_INTERVAL): Promise<AutonomousBatchOutcome> {
  const lock = await claimLock(AUTONOMOUS_CYCLE_LOCK_ID);
  if (!lock.claimed) {
    if (lock.reason === "error") return { ran: false, reason: "lock_error", error: lock.error };
    if (lock.reason === "not_configured") {
      // Learning DB not configured -> no lock to enforce, but the batch
      // itself is still safe to run unlocked (every downstream
      // Learning-DB-backed step already degrades gracefully on its own
      // when unconfigured — see queryDecisionMemory/getConstraintValidations/
      // dedup.ts). Proceed rather than refusing to run autonomously at all
      // just because the optional Learning DB isn't set up yet.
    } else {
      return { ran: false, reason: "already_running" };
    }
  }

  const startedAt = new Date().toISOString();

  try {
    const [coins, calendar, news] = await Promise.all([
      getWatchlistCoins().catch(() => []),
      getEconomicCalendar().catch(() => []),
      getNews().catch(() => []),
    ]);

    const results: AutonomousCycleResult[] = [];
    for (const symbol of coins) {
      try {
        const result = await runAutonomousCycle(symbol, interval, calendar, news);
        results.push(result);
      } catch (err) {
        // Extra safety net — runAutonomousCycle is designed to never
        // throw, but one symbol's unexpected failure must never abort
        // the rest of the batch either way.
        results.push({
          version: 1,
          symbol,
          generatedAt: new Date().toISOString(),
          stage: "NO_ASSESSMENT",
          decision: null,
          dedupApplied: false,
          executionOutcome: null,
          paperTradeId: null,
          learningLifecycleStatus: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const finishedAt = new Date().toISOString();
    return { ran: true, batch: { version: 1, startedAt, finishedAt, symbolsAttempted: coins.length, results } };
  } finally {
    if (lock.claimed) await lock.release();
  }
}

/** Re-exported for direct single-symbol use (fixtures, a future manual-trigger UI action). */
export { runAutonomousCycle };
