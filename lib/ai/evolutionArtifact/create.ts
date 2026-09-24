// ---------------------------------------------------------------------------
// ELVOID Intelligence — Controlled Change Artifact, pure construction (P4
// Step 2)
//
// Pure, deterministic, synchronous. Zero database/network/LLM/exec calls,
// zero Date.now()/randomness (generatedAt is supplied by the caller, same
// convention as every other WithoutTimestamp builder in this codebase).
//
// WHY AN INDEPENDENT RECHECK HERE, WHEN evaluateApprovalEligibility() (P0
// module, lib/ai/evolutionApproval/eligibility.ts) already requires
// allGatesPassed() && !regressionCheck.regressionDetected before a record
// can even be REQUESTED for approval: defense in depth. This layer never
// assumes upstream stayed correct — it re-derives artifactStatus from the
// SAME snapshot fields the eligibility check used, independently. If this
// module and eligibility.ts ever disagree, VALIDATION_FAILED wins (fail
// closed), never AWAITING_HUMAN_PATCH.
//
// AFFECTED FILES: extracted with one fixed regex over the proposal's own
// `hypothesis` + `proposedChange` text — never inferred, never guessed by an
// LLM. The 6 real Phase 8.6.4 templates (propose.ts) already name concrete
// `lib/ai/...` paths in their prose; this reads what is already there.
// ---------------------------------------------------------------------------

import type { EvolutionValidationRecordWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import { allGatesPassed } from "@/lib/ai/evolutionValidation/gates";
import type { ChangeArtifactWithoutTimestamp } from "./contracts";

/** One fixed pattern: a repo-relative path under app/ lib/ components/ scripts/, ending in a known source extension. Deterministic, no lookahead tricks, matches the actual path style used throughout this codebase's own prose. */
const FILE_PATH_PATTERN = /\b(?:app|lib|components|scripts)\/[A-Za-z0-9_\-./]+\.(?:ts|tsx|sql)\b/g;

/** Deterministic, sorted, de-duplicated. Empty array (never null) when the text names no file path. */
export function extractAffectedFiles(hypothesis: string, proposedChange: string): readonly string[] {
  const haystack = `${hypothesis} ${proposedChange}`;
  const matches = haystack.match(FILE_PATH_PATTERN) ?? [];
  return Array.from(new Set(matches)).sort();
}

export function artifactIdFor(recordHash: string): string {
  return `artifact:${recordHash}`;
}

/**
 * Builds the change artifact for one APPROVED record. Returns `null` only
 * when `record.result !== "VALID"` — this function refuses to build an
 * artifact for anything other than a validation-record the approval gate
 * itself would ever accept; the caller is expected to have already
 * confirmed HUMAN_APPROVED via the approvals store before calling this, but
 * this check exists so the function is never trusted to do the wrong thing
 * if called out of order.
 */
export function buildChangeArtifact(record: EvolutionValidationRecordWithoutTimestamp, approvalRecordHash: string): ChangeArtifactWithoutTimestamp | null {
  if (record.result !== "VALID") return null;
  if (approvalRecordHash !== record.recordHash) return null;

  const { validation, proposal } = record.snapshot;
  const gatesOk = allGatesPassed(validation.gates);
  const regressionOk = validation.regressionCheck.evaluated && !validation.regressionCheck.regressionDetected;

  const artifactStatus: ChangeArtifactWithoutTimestamp["artifactStatus"] = gatesOk && regressionOk ? "AWAITING_HUMAN_PATCH" : "VALIDATION_FAILED";
  const statusReason =
    artifactStatus === "AWAITING_HUMAN_PATCH"
      ? "Independent recheck passed: all validation gates passed and no regression was detected. Awaiting a human-authored patch."
      : !gatesOk
        ? "Independent recheck failed: not every validation gate passed."
        : !validation.regressionCheck.evaluated
          ? "Independent recheck failed: the regression axis was not evaluated for this record."
          : "Independent recheck failed: a regression was detected on the candidate window.";

  return {
    artifactId: artifactIdFor(record.recordHash),
    recordHash: record.recordHash,
    approvalRecordHash,
    proposalId: record.proposalId,
    candidateId: record.candidateId,
    source: record.source,
    symbol: record.symbol,
    gapCategory: record.gapCategory,
    affectedFiles: extractAffectedFiles(proposal.hypothesis, proposal.proposedChange),
    proposedChange: proposal.proposedChange,
    patchStatus: "NOT_EXECUTED",
    patchReference: null,
    regressionCheck: validation.regressionCheck,
    gates: validation.gates,
    artifactStatus,
    statusReason,
  };
}
