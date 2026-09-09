// ---------------------------------------------------------------------------
// ELVOID Autonomous Runtime — Evaluation Backlog Retry (Phase 8.5)
//
// Wires the ALREADY-BUILT, already-tested evaluateAndPersistDecision()
// (Phase 8.1.1, lib/ai/decisionEvaluation/repository.ts) to an automatic
// trigger — the piece that file's own header used to defer as "a future,
// separately-approved change." Approved 2026-09 as part of Phase 8.5
// finalization (see CHANGES.md), specifically because the backlog it
// exists to clear was empirically measured in production: 106/146
// (72.6%) closed decision_experiences had never received a
// decision_evaluations row. Root cause traced in full before this file
// was written — NOT the automatic post-close INSUFFICIENT_EVIDENCE guard
// in decisionLearning/lifecycle.ts working as designed (that guard exists
// only to avoid a race with in-flight outcome capture, and is correct);
// simply that nothing had ever retried a closed-but-unevaluated
// experience afterward.
//
// Introduces ZERO new evaluation semantics, ZERO new ML, ZERO change to
// grade/outcome/evaluationClass rules or learning thresholds:
// evaluateDecision() and persistDecisionEvaluation() are both completely
// untouched. This file only decides WHICH already-closed,
// already-unevaluated experiences to call the existing, unconditional
// evaluateAndPersistDecision() for (see its own updated docstring for why
// "unconditional" is correct and safe here), on a schedule, using a
// dedicated lock so it can never overlap itself or block the autonomous
// trading cycle.
// ---------------------------------------------------------------------------

import { claimLock } from "./lock";
import { getUnevaluatedClosedExperienceIds, evaluateAndPersistDecision } from "@/lib/ai/decisionEvaluation/repository";

const LOCK_ID = "elvoid_pro_oracle_evaluation_backlog";

// Bounded — never an unbounded full-backlog sweep in one tick. At 25/tick
// and one trigger per trade close (see paperTrader.ts), a 106-item
// backlog clears within a handful of closes, not one giant batch.
const BATCH_LIMIT = 25;

export interface EvaluationBacklogResult {
  ran: boolean;
  reason?: "already_running" | "not_configured" | "error";
  candidates: number;
  persisted: number;
  alreadyExisted: number;
  failed: number;
}

/**
 * Claims a dedicated lock, evaluates up to BATCH_LIMIT of the oldest
 * closed-but-unevaluated decision_experiences (via the existing,
 * unconditional evaluateAndPersistDecision() — see its docstring), and
 * releases the lock. Never throws — every failure mode (lock already
 * held, Learning DB unconfigured, a per-item write error) resolves to a
 * typed result.
 */
export async function runEvaluationBacklogRetry(): Promise<EvaluationBacklogResult> {
  const lock = await claimLock(LOCK_ID);
  if (!lock.claimed) return { ran: false, reason: lock.reason, candidates: 0, persisted: 0, alreadyExisted: 0, failed: 0 };

  try {
    const candidateIds = await getUnevaluatedClosedExperienceIds(BATCH_LIMIT);

    let persisted = 0;
    let alreadyExisted = 0;
    let failed = 0;

    for (const id of candidateIds) {
      const result = await evaluateAndPersistDecision(id);
      if (result.persisted) {
        if (result.alreadyExisted) alreadyExisted++;
        else persisted++;
      } else {
        failed++;
      }
    }

    return { ran: true, candidates: candidateIds.length, persisted, alreadyExisted, failed };
  } finally {
    await lock.release();
  }
}

/**
 * Fire-and-forget wrapper — same convention as
 * lib/ai/autonomousRuntime/learningRefresh.ts::triggerLearningRefreshBestEffort()
 * and Phase 8.5's logPersistenceFailure()/logPersistenceThrew() in
 * orchestrator.ts. Never awaited by the trading lifecycle, never throws
 * into it — but never silently discarded either.
 */
export function triggerEvaluationBacklogBestEffort(): void {
  runEvaluationBacklogRetry()
    .then((result) => {
      if (result.ran && result.failed > 0) {
        console.error(`[ElVoid AI] Evaluation backlog retry: ${result.failed}/${result.candidates} candidate(s) failed to persist (non-fatal) — persisted=${result.persisted}, alreadyExisted=${result.alreadyExisted}`);
      }
    })
    .catch((err) => {
      console.error("[ElVoid AI] Evaluation backlog retry threw unexpectedly (non-fatal):", err instanceof Error ? err.message : String(err));
    });
}
