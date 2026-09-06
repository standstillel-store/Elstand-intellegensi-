// ---------------------------------------------------------------------------
// ELVOID Intelligence — Causal Graph (Phase 8.3.8)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - PROVEN LINEAGE ONLY, NOT A SECOND TOPOLOGY GRAPH. This is a
//     different granularity from `lib/ai/cognitiveMap` (Phase
//     8.3.1/8.3.3): that graph classifies nine fixed MODULE-level pairs
//     (`market->macro`, `oracle->risk`, ...) once, from the orchestrator's
//     own call graph. This module classifies INSTANCE/GROUP-level lineage
//     — a specific `(source, symbol, evidenceTag)` learning-loop group, or
//     a specific paper trade's outcome/evaluation row — which the
//     module-level graph has no shape to represent. Nothing here
//     duplicates `STATIC_EDGE_CLASSIFICATION`/`deriveDynamicEdges`
//     (edgeIntelligence.ts); it answers a strictly narrower, complementary
//     question about REAL, ALREADY-PERSISTED rows.
//   - EVERY EDGE MUST BE PROVEN, NEVER INFERRED. An edge is only ever
//     produced when one of these holds, checked against REAL fetched
//     rows:
//       1. A verbatim COPY-FORWARD relationship (identical field values
//          across two tables' rows for the same group key) — e.g.
//          `AdaptiveConstraint.basis` vs. its originating
//          `FailurePatternCandidate`'s own fields.
//       2. A real JOIN on a shared, already-established identity key
//          (`source_signal_id` / `paperTradeId`, or `(source, symbol,
//          evidenceTag)`).
//       3. DIRECT, CITED CODE BEHAVIOR — a specific function/branch in an
//          existing, unmodified source file that reads one value and
//          produces another (e.g. `qualify.ts`'s
//          `cautionConstraintPresent` gating `CAUTION`, or
//          `decide.ts`'s `qualificationConflicted` gating `REJECT`).
//     Naming similarity, timestamp proximity alone, correlation, or UI
//     adjacency NEVER produce an edge. Every candidate edge that fails
//     this test is returned as a `CausalEdgeRejection` with an explicit,
//     checkable reason — never silently dropped, never guessed into an
//     edge anyway.
//   - `confidence` is `null` unless a REAL, ALREADY-COMPUTED number
//     naturally exists for that specific edge (e.g. a persisted
//     `FailurePatternCandidate.confidence`) — never a value this module
//     invents, averages, or estimates.
// ---------------------------------------------------------------------------

import type { FailurePatternSource, FailurePatternEvidenceTag } from "@/lib/ai/failurePatterns/contracts";

export type CausalNodeKind = "decision_experiences" | "decision_evaluations" | "failure_pattern_candidates" | "adaptive_constraints" | "constraint_validations" | "qualification" | "decision";

/** A real, addressable node identity — always built from real keys (signal id, or source/symbol/evidenceTag), never a free-text label. */
export interface CausalNodeRef {
  readonly kind: CausalNodeKind;
  /** Human-readable, built only from real identity fields — e.g. `decision_experiences:<sourceSignalId>` or `adaptive_constraints:ELVOID_PRO_ORACLE:BTCUSDT:HIGH_RISK_PRESENT`. */
  readonly id: string;
}

/**
 * Closed relationship-type enum for INSTANCE/GROUP-level lineage —
 * deliberately a different, smaller set than `cognitiveMap`'s
 * `SemanticEdgeType` (module-level topology), since this module answers a
 * different question. See each member's derivation site in derive.ts for
 * the exact check performed.
 */
export type CausalRelationshipType =
  | "DERIVATION" // a value is computed from another value by an existing, cited pure function (Outcome -> Evaluation)
  | "AGGREGATION" // many rows are grouped/recomputed into one aggregate by an existing, cited detector (Evaluation -> FailurePattern)
  | "COPY_FORWARD" // a later row's fields are verbatim copies of an earlier row's fields, proven by field equality (FailurePattern -> Constraint -> Validation)
  | "GATING_INFLUENCE"; // a boolean/status derived from one record structurally changes a later decision branch, proven by citing the exact branch (Validation -> Qualification -> Decision, Memory -> Qualification -> Decision)

export interface CausalEdgeEvidenceRef {
  readonly kind: "decision_experiences" | "decision_evaluations" | "failure_pattern_candidates" | "adaptive_constraints" | "constraint_validations" | "decision_memory_result" | "code_reference";
  /** Real row identifier (a signal id, or a source/symbol/evidenceTag group key) or an exact file::function citation — never a description of intent. */
  readonly ref: string;
  /** Verbatim fact this evidence shows — never paraphrased into a stronger claim than the data supports. */
  readonly detail: string;
}

export interface CausalEdge {
  readonly source: CausalNodeRef;
  readonly target: CausalNodeRef;
  /** One factual sentence describing HOW source influences target — never a narrative, never "may affect" hedging language dressed up as a claim. */
  readonly mechanism: string;
  readonly relationshipType: CausalRelationshipType;
  readonly evidence: readonly CausalEdgeEvidenceRef[];
  /** `null` unless a real, already-computed number naturally exists for this edge — see module header. Never fabricated. */
  readonly confidence: number | null;
  /** Honest scope caveats on what this specific edge does and does not prove — e.g. "proves group membership, not per-row trigger causation". Never empty prose padding; omit rather than pad. */
  readonly limitations: readonly string[];
}

/** A candidate edge that failed the proof test — recorded, never silently dropped. */
export interface CausalEdgeRejection {
  readonly source: CausalNodeRef;
  readonly target: CausalNodeRef;
  /** Exact, checkable reason this candidate could not be proven — cites the specific missing/mismatched real condition. */
  readonly reason: string;
}

export interface CausalChainResult {
  readonly proven: readonly CausalEdge[];
  readonly rejected: readonly CausalEdgeRejection[];
}

/** Key identifying one learning-loop group — the unit the Outcome->...->Decision chain is derived for. */
export interface LearningLineageGroupKey {
  readonly source: FailurePatternSource;
  readonly symbol: string;
  readonly evidenceTag: FailurePatternEvidenceTag;
}
