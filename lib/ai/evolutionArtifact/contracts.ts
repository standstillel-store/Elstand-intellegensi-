// ---------------------------------------------------------------------------
// ELVOID Intelligence — Controlled Change Artifact, contracts (P4 Step 2)
//
// TYPES ONLY. Zero logic.
//
// WHAT AN ARTIFACT IS: the ONE thing produced after a human APPROVES an
// evolution_validation_records row on Telegram. It is NOT a code change and
// NOT a deploy — it is a structured, auditable pointer saying "this approved
// proposal is now authorized to have a patch PREPARED for human review".
//
// "AUTHORIZED TO PREPARE" IS NOT "AUTHORIZED TO DEPLOY":
//   - patchStatus is closed to a single value today, "NOT_EXECUTED" — this
//     repository has no code-generation, branch/worktree or diff-execution
//     capability, and this type does not pretend otherwise. patchReference
//     is `null` for exactly the same reason: there is nothing to reference.
//   - artifactStatus can reach AWAITING_HUMAN_PATCH (safe to hand a human
//     for manual patch authoring) or VALIDATION_FAILED (an independent,
//     redundant re-check at THIS layer — never trusts the approval alone;
//     see create.ts's own header for why this recheck exists even though
//     evaluateApprovalEligibility() already enforces the same gates
//     upstream).
//   - Nothing anywhere reads artifactStatus to change runtime behavior.
//     Nothing here writes to any file, branch or deployment.
//
// LINEAGE: proposalId -> candidateId -> recordHash -> approvalRecordHash ->
// artifactId. artifactId is DETERMINISTIC (`artifact:<recordHash>`, see
// create.ts) — one artifact per approved record, never random/timestamp
// keyed, so re-deriving it twice never produces a duplicate row (upsert on
// artifact_id).
// ---------------------------------------------------------------------------

import type { DecisionSource, GapCategory } from "@/lib/ai/evolutionCandidate/contracts";
import type { RegressionCheck, ValidationGateOutcome } from "@/lib/ai/evolutionValidation/contracts";

export type { DecisionSource, GapCategory };

/** Only value that exists today. No exec/branch/patch-apply capability is wired — see this file's own header. */
export type PatchStatus = "NOT_EXECUTED";

/**
 * AWAITING_HUMAN_PATCH: independent recheck passed; a human may now author a
 * patch for the approved scope. VALIDATION_FAILED: the independent recheck
 * at this layer did not pass (gates not all passed, or a regression was
 * flagged) — no patch is offered even though the record was approved
 * upstream. There is deliberately no "APPLIED"/"DEPLOYED"/"MERGED" value:
 * this artifact never represents a completed change.
 */
export type ArtifactStatus = "AWAITING_HUMAN_PATCH" | "VALIDATION_FAILED";

export interface ChangeArtifactWithoutTimestamp {
  /** Deterministic: `artifact:<recordHash>`. UNIQUE key for upsert-not-duplicate. */
  readonly artifactId: string;
  readonly recordHash: string;
  readonly approvalRecordHash: string;
  readonly proposalId: string;
  readonly candidateId: string;
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly gapCategory: GapCategory;
  /**
   * File paths found VERBATIM inside the proposal's own `hypothesis` +
   * `proposedChange` text (deterministic regex extraction — never guessed,
   * never LLM-inferred). Empty when the proposal's fixed template text
   * names no file path; this is reported honestly rather than fabricated.
   */
  readonly affectedFiles: readonly string[];
  readonly proposedChange: string;
  readonly patchStatus: PatchStatus;
  readonly patchReference: null;
  /** Independent recheck outcome at THIS layer — see this file's own header. */
  readonly regressionCheck: RegressionCheck;
  readonly gates: readonly ValidationGateOutcome[];
  readonly artifactStatus: ArtifactStatus;
  /** Human-readable reason ArtifactStatus is what it is. Deterministic, never fabricated. */
  readonly statusReason: string;
}

export interface ChangeArtifact extends ChangeArtifactWithoutTimestamp {
  readonly generatedAt: string;
}
