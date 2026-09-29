// ---------------------------------------------------------------------------
// Phase 9 — evolution candidate MONITORING view (pure, read-only).
//
//   REAL EVIDENCE -> COGNITIVE GAP -> PROPOSAL -> CANDIDATE -> MONITORING
//     -> VALIDATION -> HUMAN APPROVAL
//
// Built ONLY from what /api/ai-performance/cognitive already derives from real
// rows (proposal.evidence.occurrenceCount, candidate, validation, approval).
// Nothing is seeded or fabricated. With no real candidate the status is
// NO_ACTIVE_CANDIDATE; with no Learning DB it is MONITORING_UNAVAILABLE —
// never a fake PASS and never an invented progress number.
// ---------------------------------------------------------------------------

export type CandidateMonitoringStatus = "ACTIVE_CANDIDATES" | "NO_ACTIVE_CANDIDATE" | "MONITORING_UNAVAILABLE";

export type CandidateNextGate =
  | "BLOCKED_VALIDATION_FAILED"
  | "MORE_EVIDENCE_REQUIRED"
  | "NOT_REPLAYABLE"
  | "HUMAN_APPROVAL_1"
  | "HUMAN_REJECTED_STOP"
  | "CHANGE_ARTIFACT_AND_PATCH";

export interface CandidateMonitorRow {
  readonly candidateId: string;
  readonly proposalId: string;
  readonly symbol: string;
  readonly gapPattern: string;
  readonly occurrenceCount: number | null;
  readonly evaluatedCount: number | null;
  /** Only when the source carries one; the proposal contract has no confidence field, so this is honestly null today. */
  readonly confidence: number | null;
  readonly status: string;
  readonly createdAt: string | null;
  readonly validationState: string;
  readonly gatesPassed: number;
  readonly gatesEvaluated: number;
  readonly approvalState: string | null;
  readonly nextGate: CandidateNextGate;
}

export interface CandidateMonitoringView {
  readonly status: CandidateMonitoringStatus;
  readonly candidates: readonly CandidateMonitorRow[];
}

// Structural inputs (subset of what the cognitive route already returns) so this file stays dependency-free.
interface EntryIn {
  readonly symbol: string;
  readonly proposals?: readonly { readonly proposalId: string; readonly evidence?: { readonly occurrenceCount?: number; readonly evaluatedCount?: number } }[];
  readonly candidates: readonly {
    readonly candidate: { readonly candidateId: string; readonly proposalId: string; readonly gapCategory: string; readonly status: string; readonly createdAt?: string };
    readonly validation: { readonly result: string; readonly gates?: readonly { readonly passed: boolean }[] };
    readonly approval?: { readonly status: string } | null;
  }[];
}

export function deriveNextGate(validationResult: string, approvalStatus: string | null): CandidateNextGate {
  if (approvalStatus === "HUMAN_APPROVED") return "CHANGE_ARTIFACT_AND_PATCH";
  if (approvalStatus === "HUMAN_REJECTED") return "HUMAN_REJECTED_STOP";
  if (validationResult === "VALID") return "HUMAN_APPROVAL_1";
  if (validationResult === "INVALID") return "BLOCKED_VALIDATION_FAILED";
  if (validationResult === "NOT_APPLICABLE") return "NOT_REPLAYABLE";
  return "MORE_EVIDENCE_REQUIRED";
}

export function buildCandidateMonitoring(evolution: readonly EntryIn[], learningDbConfigured: boolean): CandidateMonitoringView {
  if (!learningDbConfigured) return { status: "MONITORING_UNAVAILABLE", candidates: [] };
  const rows: CandidateMonitorRow[] = [];
  for (const entry of evolution) {
    for (const c of entry.candidates) {
      const proposal = entry.proposals?.find((p) => p.proposalId === c.candidate.proposalId);
      const gates = c.validation.gates ?? [];
      const approvalState = c.approval?.status ?? null;
      rows.push({
        candidateId: c.candidate.candidateId,
        proposalId: c.candidate.proposalId,
        symbol: entry.symbol,
        gapPattern: c.candidate.gapCategory,
        occurrenceCount: proposal?.evidence?.occurrenceCount ?? null,
        evaluatedCount: proposal?.evidence?.evaluatedCount ?? null,
        confidence: null,
        status: c.candidate.status,
        createdAt: c.candidate.createdAt ?? null,
        validationState: c.validation.result,
        gatesPassed: gates.filter((g) => g.passed).length,
        gatesEvaluated: gates.length,
        approvalState,
        nextGate: deriveNextGate(c.validation.result, approvalState),
      });
    }
  }
  return { status: rows.length > 0 ? "ACTIVE_CANDIDATES" : "NO_ACTIVE_CANDIDATE", candidates: rows };
}
