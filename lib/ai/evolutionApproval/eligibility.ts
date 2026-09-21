// ---------------------------------------------------------------------------
// ELVOID Intelligence — Human Approval Gate, eligibility (Phase 8.6.7)
//
// Pure, deterministic, synchronous. Zero database/network/LLM calls, zero
// clock or randomness. Takes ONE validation record (already fetched by
// `recordHash`) and decides whether a human may decide on it.
//
// The record's own stored integrity flag is NOT trusted: eligibility
// re-verifies the record itself (record.ts), so a store that misreports
// integrity — or a mutated one — cannot make an unverified record eligible.
//
// Checks, in order; the first failure wins and nothing is ever "partly
// eligible":
//   1. the record exists                                   RECORD_NOT_FOUND
//   2. its canonical integrity verifies                    INTEGRITY_CHECK_FAILED
//   3. result === VALID, in the column AND in the snapshot RESULT_NOT_VALID
//   4. proposal/candidate identity is consistent (and
//      matches the expected identity when one is given)    IDENTITY_MISMATCH
//   5. mode is OBSERVATIONAL_SPLIT_HISTORY and
//      counterfactualAvailable is false                    UNSUPPORTED_VALIDATION_MODE
//   6. every validation gate passed and the regression
//      check was evaluated and found nothing               GATES_NOT_ALL_PASSED
//
// ONLY `VALID` is ever a candidate. INVALID, INSUFFICIENT_EVIDENCE,
// INCONCLUSIVE and NOT_APPLICABLE are never eligible — there is nothing to
// approve. `VALID` still means only that every observational gate was met.
// ---------------------------------------------------------------------------

import { verifyEvolutionValidationRecord } from "@/lib/ai/evolutionValidation/record";
import { allGatesPassed } from "@/lib/ai/evolutionValidation/gates";
import type { EvolutionValidationRecordWithoutTimestamp } from "@/lib/ai/evolutionValidation/contracts";
import type { ApprovalEligibility, ApprovalRequestSummary } from "./contracts";

export interface ExpectedIdentity {
  readonly proposalId?: string;
  readonly candidateId?: string;
}

function summarize(record: EvolutionValidationRecordWithoutTimestamp): ApprovalRequestSummary {
  const { proposal, candidate, validation } = record.snapshot;
  const replay = candidate.replay;
  return {
    recordHash: record.recordHash,
    proposalId: record.proposalId,
    candidateId: record.candidateId,
    source: record.source,
    symbol: record.symbol,
    gapCategory: record.gapCategory,
    validationResult: "VALID",
    validationMode: validation.validationMode,
    counterfactualAvailable: false,
    hypothesis: proposal.hypothesis,
    proposedChange: proposal.proposedChange,
    gatesPassed: validation.gates.filter((g) => g.passed).length,
    gatesTotal: validation.gates.length,
    regressionEvaluated: validation.regressionCheck.evaluated,
    regressionDetected: validation.regressionCheck.regressionDetected,
    olderWindow: { eligible: replay?.baseline.sampleAccounting?.eligible ?? null, excluded: replay?.baseline.sampleAccounting?.excluded ?? null },
    newerWindow: { eligible: replay?.candidate.sampleAccounting?.eligible ?? null, excluded: replay?.candidate.sampleAccounting?.excluded ?? null },
  };
}

export function evaluateApprovalEligibility(record: EvolutionValidationRecordWithoutTimestamp | null, expected: ExpectedIdentity = {}): ApprovalEligibility {
  if (record === null || record === undefined) return { eligible: false, code: "RECORD_NOT_FOUND" };

  if (!verifyEvolutionValidationRecord(record).valid) return { eligible: false, code: "INTEGRITY_CHECK_FAILED" };

  if (record.result !== "VALID" || record.snapshot.validation.result !== "VALID") return { eligible: false, code: "RESULT_NOT_VALID" };

  const { proposal, candidate, validation } = record.snapshot;
  const identityConsistent =
    record.proposalId === proposal.proposalId &&
    record.candidateId === candidate.candidateId &&
    candidate.proposalId === proposal.proposalId &&
    validation.candidateId === candidate.candidateId &&
    validation.proposalId === proposal.proposalId &&
    (expected.proposalId === undefined || expected.proposalId === record.proposalId) &&
    (expected.candidateId === undefined || expected.candidateId === record.candidateId);
  if (!identityConsistent) return { eligible: false, code: "IDENTITY_MISMATCH" };

  if (record.validationMode !== "OBSERVATIONAL_SPLIT_HISTORY" || validation.validationMode !== "OBSERVATIONAL_SPLIT_HISTORY" || record.counterfactualAvailable !== false || validation.counterfactualAvailable !== false) {
    return { eligible: false, code: "UNSUPPORTED_VALIDATION_MODE" };
  }

  if (!allGatesPassed(validation.gates) || !validation.regressionCheck.evaluated || validation.regressionCheck.regressionDetected || validation.gateThresholds === null) {
    return { eligible: false, code: "GATES_NOT_ALL_PASSED" };
  }

  return { eligible: true, summary: summarize(record) };
}
