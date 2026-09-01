// ---------------------------------------------------------------------------
// ELVOID Intelligence — Learning Refresh Orchestration (Phase 8.2.9 §7)
//
// Sequences three ALREADY-BUILT, ALREADY-CALLABLE recompute functions in
// the one required order:
//
//   recomputeFailurePatterns()      (lib/ai/failurePatterns/repository.ts, 8.1.2)
//   -> recomputeAdaptiveConstraints() (lib/ai/adaptiveConstraint/repository.ts, 8.1.4)
//   -> recomputeConstraintValidations() (lib/ai/learningValidation/repository.ts, 8.1.5)
//
// This file introduces ZERO new pattern-detection/constraint-generation/
// validation logic — it only calls the three functions above, in order,
// guarded by lib/ai/autonomousRuntime/lock.ts so overlapping triggers
// (a trade closing while a previous refresh is still running) can never
// run this sequence concurrently or duplicate work. A refresh failure at
// any step stops the sequence for that run but never deletes/invalidates
// whatever `constraint_validations` rows already exist from the previous
// successful refresh — each recompute function is its own full
// recompute-and-upsert, so the previous snapshot simply remains in place
// until the next successful run overwrites it.
// ---------------------------------------------------------------------------

import { recomputeFailurePatterns } from "@/lib/ai/failurePatterns/repository";
import { recomputeAdaptiveConstraints } from "@/lib/ai/adaptiveConstraint/repository";
import { recomputeConstraintValidations } from "@/lib/ai/learningValidation/repository";
import { claimLock } from "./lock";

const LEARNING_REFRESH_LOCK_ID = "elvoid_pro_oracle_learning_refresh";

export type LearningRefreshResult =
  | { ran: true; failurePatterns: number; adaptiveConstraints: number; constraintValidations: number }
  | { ran: false; reason: "not_configured" | "already_running" | "lock_error" | "failure_patterns_failed" | "adaptive_constraints_failed" | "constraint_validations_failed"; error?: string };

/**
 * Runs the full ordered refresh sequence exactly once, guarded by the
 * shared runtime lock. Never throws — every failure mode resolves to a
 * typed, non-throwing `LearningRefreshResult`, matching the three
 * recompute functions' own non-throwing contracts.
 */
export async function runLearningRefresh(): Promise<LearningRefreshResult> {
  const lock = await claimLock(LEARNING_REFRESH_LOCK_ID);
  if (!lock.claimed) {
    if (lock.reason === "error") return { ran: false, reason: "lock_error", error: lock.error };
    return { ran: false, reason: lock.reason };
  }

  try {
    const failurePatterns = await recomputeFailurePatterns();
    if (!failurePatterns.persisted) {
      return failurePatterns.reason === "not_configured" ? { ran: false, reason: "not_configured" } : { ran: false, reason: "failure_patterns_failed", error: failurePatterns.reason === "error" ? failurePatterns.error : undefined };
    }

    const adaptiveConstraints = await recomputeAdaptiveConstraints();
    if (!adaptiveConstraints.persisted) {
      return adaptiveConstraints.reason === "not_configured" ? { ran: false, reason: "not_configured" } : { ran: false, reason: "adaptive_constraints_failed", error: adaptiveConstraints.reason === "error" ? adaptiveConstraints.error : undefined };
    }

    const constraintValidations = await recomputeConstraintValidations();
    if (!constraintValidations.persisted) {
      return constraintValidations.reason === "not_configured" ? { ran: false, reason: "not_configured" } : { ran: false, reason: "constraint_validations_failed", error: constraintValidations.reason === "error" ? constraintValidations.error : undefined };
    }

    return { ran: true, failurePatterns: failurePatterns.count, adaptiveConstraints: adaptiveConstraints.count, constraintValidations: constraintValidations.count };
  } finally {
    await lock.release();
  }
}

/**
 * Fire-and-forget wrapper for call-sites that must never await or throw —
 * e.g. `lib/elvoid/paperTrader.ts::writeClose()`, immediately after its
 * existing `completeDecisionLearningLifecycle()` call. Swallows and logs
 * any unexpected rejection (the function above already shouldn't throw,
 * but this stays defensive, same convention as every other best-effort
 * call-site in this repo).
 */
export function triggerLearningRefreshBestEffort(): void {
  runLearningRefresh()
    .then((result) => {
      if (!result.ran && result.reason !== "not_configured" && result.reason !== "already_running") {
        console.error(`[ElVoid AI] Learning refresh did not complete (non-fatal): ${result.reason}${result.error ? ` — ${result.error}` : ""}`);
      }
    })
    .catch((err) => {
      console.error("[ElVoid AI] Learning refresh threw unexpectedly (non-fatal):", err instanceof Error ? err.message : String(err));
    });
}
