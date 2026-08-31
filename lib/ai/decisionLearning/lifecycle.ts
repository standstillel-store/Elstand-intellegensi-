// ---------------------------------------------------------------------------
// ELVOID Intelligence — Decision Learning Lifecycle Orchestrator (Phase 8.1.1.1)
//
// This is the ONLY module allowed to know about both the Decision Outcome
// domain (lib/ai/decisionOutcome/*) and the Decision Evaluation domain
// (lib/ai/decisionEvaluation/*). Neither domain imports the other or
// imports this file — dependency direction is strictly:
//
//   decisionOutcome ─┐
//                    ├──> decisionLearning/lifecycle (HERE)
//   decisionEvaluation┘
//
// PURPOSE: guarantee correct ordering — outcome capture must fully
// complete before evaluation ever reads `decision_experiences` — which
// two independent fire-and-forget calls from lib/elvoid/paperTrader.ts
// could not guarantee (evaluation could race ahead and see
// `outcome_result` still null, producing a permanently-locked incorrect
// `INSUFFICIENT_EVIDENCE` row, since `decision_evaluations` uses
// `UNIQUE(source_signal_id)` + `upsert(..., ignoreDuplicates: true)`,
// which can never later overwrite a wrong early insert).
//
// This file is the ONLY intended call-site change in
// lib/elvoid/paperTrader.ts (one line, same fire-and-forget shape as
// before). It introduces no new database schema, no retry queue, no
// cron/polling, no LLM, and no change to trading/execution logic.
// ---------------------------------------------------------------------------

import { captureAndPersistOutcome } from "@/lib/ai/decisionOutcome/repository";
import { getDecisionExperienceForEvaluation, persistDecisionEvaluation } from "@/lib/ai/decisionEvaluation/repository";
import { evaluateDecision } from "@/lib/ai/decisionEvaluation/evaluate";
import type { DecisionEvaluation } from "@/lib/ai/decisionEvaluation/contracts";

export type CompleteDecisionLearningLifecycleResult =
  | { outcome: "persisted"; evaluation: "persisted"; evaluationClass: DecisionEvaluation["evaluationClass"] }
  | { outcome: "persisted"; evaluation: "skipped_insufficient_evidence" }
  | { outcome: "persisted"; evaluation: "experience_not_found" };

/**
 * Sequences the two existing, unmodified Phase 8.1.0/8.1.1 pipelines in
 * the only safe order:
 *
 *   1. `captureAndPersistOutcome(sourceSignalId)` — AWAITED. Its actual
 *      return type (verified by direct inspection, not assumed) is
 *      `Promise<{persisted: true; updated: boolean} | {persisted: false;
 *      reason: "not_configured" | "error" | "no_outcome_yet"; error?:
 *      string}>` — it NEVER throws/rejects; every failure mode is a typed
 *      result. The correctness condition this function cares about is
 *      simply `persisted === true` — `updated` (true vs false) does NOT
 *      matter for whether it's now safe to evaluate: `updated: false`
 *      means the outcome was already present before this call (a safe,
 *      idempotent no-op), which is just as valid a "canonical outcome
 *      exists now" state as `updated: true` (this call just wrote it).
 *      A `persisted: false` result of ANY reason means the canonical
 *      Learning DB row does not yet reliably contain an outcome — this
 *      function converts that into a thrown Error (see Case 1 below),
 *      since the underlying function itself won't throw one for us.
 *
 *   2. Only once step 1 resolves with `persisted: true`: read the
 *      experience, run the pure `evaluateDecision()`, and — UNLESS the
 *      result is `"INSUFFICIENT_EVIDENCE"` (see the guard below) —
 *      persist it. This deliberately does NOT call the coarser
 *      `evaluateAndPersistDecision()` convenience wrapper (which always
 *      persists unconditionally) — that function remains fully untouched
 *      and available for manual/historical evaluation, where an honest
 *      `INSUFFICIENT_EVIDENCE` result IS valid and should be persisted.
 *      The automatic-lifecycle guard below is implemented HERE, at the
 *      composition boundary, not inside evaluate.ts or
 *      decisionEvaluation's persistence rules, exactly as required.
 *
 * FAILURE ISOLATION (both cases below propagate — see file-level error
 * handling requirement: the caller, lib/elvoid/paperTrader.ts, attaches
 * the single `.catch()` that logs and isolates this from trading):
 *
 *   Case 1 — outcome capture does not confirm success: this function
 *   THROWS immediately. Evaluation never runs. No decision_evaluations
 *   write is attempted.
 *
 *   Case 2 — outcome succeeds but evaluation throws (e.g. Learning DB
 *   becomes unreachable between the two steps): the outcome write already
 *   completed and independently remains persisted (nothing here can or
 *   does roll it back — there is no cross-database transaction). The
 *   thrown/rejected error propagates to the caller's `.catch()`. No
 *   retry is attempted; a future manual `evaluateAndPersistDecision()`
 *   call remains fully valid and safe (idempotent) if invoked later.
 */
export async function completeDecisionLearningLifecycle(sourceSignalId: string): Promise<CompleteDecisionLearningLifecycleResult> {
  const outcomeResult = await captureAndPersistOutcome(sourceSignalId);

  if (!outcomeResult.persisted) {
    const detail = outcomeResult.reason === "error" ? `${outcomeResult.reason}: ${outcomeResult.error}` : outcomeResult.reason;
    throw new Error(`Decision learning lifecycle: outcome capture did not confirm success for ${sourceSignalId} (${detail}) — evaluation skipped`);
  }

  // outcomeResult.persisted === true here — decision_experiences.outcome_*
  // is now guaranteed populated for this signal (either just written by
  // the call above, or already present before it). Safe to evaluate.

  const experience = await getDecisionExperienceForEvaluation(sourceSignalId);
  if (!experience) {
    // Should not occur in practice immediately after a successful outcome
    // capture (the same row was just confirmed to exist), but handled
    // defensively rather than assumed impossible.
    return { outcome: "persisted", evaluation: "experience_not_found" };
  }

  const evaluation = evaluateDecision(experience);

  // Automatic post-close INSUFFICIENT_EVIDENCE guard (composition
  // boundary only — evaluate.ts and decisionEvaluation's persistence
  // rules are untouched). At this point in the AUTOMATIC lifecycle,
  // outcome capture has already confirmed success, so a fresh
  // INSUFFICIENT_EVIDENCE reading indicates a lifecycle-consistency
  // artifact (e.g. a malformed/partial experience), not a legitimate,
  // permanent "no evidence exists" state — persisting it would be
  // irreversible under decision_evaluations' UNIQUE(source_signal_id) +
  // ignoreDuplicates upsert. Skip persistence and log defensively;
  // manual/historical evaluateAndPersistDecision() calls are completely
  // unaffected by this guard and retain their original, unrestricted
  // semantics.
  if (evaluation.evaluationClass === "INSUFFICIENT_EVIDENCE") {
    console.log(`[ElVoid AI] Decision learning lifecycle: automatic evaluation for ${sourceSignalId} resolved INSUFFICIENT_EVIDENCE immediately after successful outcome capture — skipping automatic persistence to avoid a permanently-locked incorrect record. Manual re-evaluation remains available.`);
    return { outcome: "persisted", evaluation: "skipped_insufficient_evidence" };
  }

  const withTimestamp: DecisionEvaluation = { ...evaluation, evaluatedAt: new Date().toISOString() };
  const persistResult = await persistDecisionEvaluation(withTimestamp);
  if (!persistResult.persisted) {
    const detail = persistResult.reason === "error" ? `${persistResult.reason}: ${persistResult.error}` : persistResult.reason;
    throw new Error(`Decision learning lifecycle: evaluation persistence did not confirm success for ${sourceSignalId} (${detail})`);
  }

  return { outcome: "persisted", evaluation: "persisted", evaluationClass: evaluation.evaluationClass };
}
