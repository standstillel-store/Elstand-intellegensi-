// ---------------------------------------------------------------------------
// ELVOID Intelligence — Learning Loop Chain (Phase 8.3.6)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - PRESENTATION-ONLY COMPOSITION OF TWO ALREADY-EXISTING READ PATHS.
//     This module computes nothing new: it takes the output of
//     `getConstraintValidations()` (Phase 8.1.5, `constraint_validations`
//     — itself a verbatim-copied-forward chain: pattern basis stats ->
//     AdaptiveConstraint.basis (8.1.4) -> ConstraintValidation.basis
//     (8.1.5), never recomputed at any hop — see each phase's own
//     contracts.ts header) and `queryDecisionMemory()` (Phase 8.1.3,
//     joining `decision_experiences`/`decision_evaluations`/
//     `failure_pattern_candidates`), and JOINS them by `evidenceTag`
//     (both already carry the same closed `evidenceTag` enum). No new
//     table, no new persistence, no new score.
//   - `currentlyInfluencesDecisions` is NOT this module's own judgment —
//     it is a literal restatement of
//     `lib/ai/decisionQualification/qualify.ts`'s real, already-shipped
//     rule: `cautionConstraintPresent = context.validConstraints.length >
//     0` -> `selectQualificationStatus()` returns `"CAUTION"` -> (see
//     `lib/ai/autonomousDecision/decide.ts`) blocks the
//     `preEntryValid && qualificationQualified` condition EXECUTE
//     requires, falling through toward `WAIT`. This module does not
//     re-derive or reinterpret that rule; it only reports whether a given
//     validation's `status` meets the one condition
//     (`status === "VALID"`) that rule already checks — a documentation
//     citation, not a second decision authority. This module has no path
//     into `decideAutonomous`/`executeAutonomousPaperTrade` and changes
//     no live behavior by itself.
//   - FAILS SAFE: a constraint's proven behavioral effect (when it does
//     have one) is exactly what the real pipeline already does — downgrade
//     toward `CAUTION`/`WAIT`. This module cannot represent a constraint
//     as *strengthening* execution authority, because no such code path
//     exists anywhere in `qualify.ts`/`decide.ts` to cite.
// ---------------------------------------------------------------------------

import type { ConstraintValidation } from "@/lib/ai/learningValidation/contracts";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";
import { NEGATIVE_EVALUATION_CLASSES } from "@/lib/ai/failurePatterns/detect";

export interface LearningLoopMemoryEvidence {
  readonly matchedEvaluationCount: number;
  readonly matchedNegativeEvaluationCount: number;
  readonly matchedPatternConfidence: number | null;
}

export interface LearningLoopChainEntry {
  readonly source: ConstraintValidation["source"];
  readonly symbol: string;
  readonly evidenceTag: ConstraintValidation["evidenceTag"];
  readonly constraintType: ConstraintValidation["constraintType"];

  /** Verbatim `ConstraintValidation.basis` — see this module's header for the full copy-forward chain this traces back through. */
  readonly basis: ConstraintValidation["basis"];
  readonly status: ConstraintValidation["status"];
  readonly validatedAt: string;

  /** `null` when no `memory` result was supplied to `buildLearningLoopChains()`, or when memory carried no row for this evidenceTag at all — never a fabricated zero-evidence object. */
  readonly memoryEvidence: LearningLoopMemoryEvidence | null;

  /** Literal restatement of `qualify.ts`'s real `status === "VALID"` check — see module header. Never `true` for any other status. */
  readonly currentlyInfluencesDecisions: boolean;
  /** Non-null exactly when `currentlyInfluencesDecisions` is `true` — the real citation, not a generic claim. */
  readonly influenceCitation: string | null;
}

const INFLUENCE_CITATION =
  'lib/ai/decisionQualification/qualify.ts::selectQualificationStatus() — signals.cautionConstraintPresent (this VALID validation) -> status="CAUTION"; lib/ai/autonomousDecision/decide.ts::deriveAutonomousDecision() then requires qualification.status==="QUALIFIED" for EXECUTE, so a CAUTION-qualified cycle cannot EXECUTE this cycle and falls through toward WAIT.';

/**
 * One entry per supplied `ConstraintValidation`, in the same order. Memory
 * evidence for a validation is every `memory.matchedEvaluations`/
 * `matchedPatterns` row whose own `evidence`/`evidenceTag` overlaps this
 * validation's `evidenceTag` — the same overlap concept
 * `retrieveDecisionMemory()` itself already ranks by (Phase 8.1.3), read
 * here rather than recomputed.
 */
export function buildLearningLoopChains(validations: readonly ConstraintValidation[], memory: DecisionMemoryResult | null): readonly LearningLoopChainEntry[] {
  return validations.map((v) => {
    let memoryEvidence: LearningLoopMemoryEvidence | null = null;
    if (memory !== null) {
      const matchedEvaluations = memory.matchedEvaluations.filter((e) => e.evidence.includes(v.evidenceTag));
      const matchedPattern = memory.matchedPatterns.find((p) => p.evidenceTag === v.evidenceTag) ?? null;
      if (matchedEvaluations.length > 0 || matchedPattern !== null) {
        memoryEvidence = {
          matchedEvaluationCount: matchedEvaluations.length,
          matchedNegativeEvaluationCount: matchedEvaluations.filter((e) => NEGATIVE_EVALUATION_CLASSES.includes(e.evaluationClass)).length,
          matchedPatternConfidence: matchedPattern?.confidence ?? null,
        };
      }
    }

    const currentlyInfluencesDecisions = v.status === "VALID";
    return {
      source: v.source,
      symbol: v.symbol,
      evidenceTag: v.evidenceTag,
      constraintType: v.constraintType,
      basis: v.basis,
      status: v.status,
      validatedAt: v.validatedAt,
      memoryEvidence,
      currentlyInfluencesDecisions,
      influenceCitation: currentlyInfluencesDecisions ? INFLUENCE_CITATION : null,
    };
  });
}
