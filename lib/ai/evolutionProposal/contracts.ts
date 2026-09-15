// ---------------------------------------------------------------------------
// ELVOID Intelligence — Evolution Proposal Engine (Phase 8.6.4 Part B)
//
// ARCHITECTURE / AUTHORITY:
//   - A proposal is a STRUCTURED OBJECT describing what should be
//     investigated or changed — it is NEVER code, NEVER an executable
//     instruction, and NEVER applied anywhere. Nothing in this
//     repository reads an `EvolutionProposal` back into qualification,
//     arbitration, execution, or risk. See propose.ts's header for the
//     exact BAD/GOOD phrasing rule this module follows.
//   - `proposalId` is a DETERMINISTIC composite key
//     (`${source}:${symbol}:${gapCategory}`), never a random UUID — the
//     SAME observed gap always identifies the SAME proposal, so
//     re-running detection updates (never duplicates) the existing
//     record. This is the "deterministic identity" the Phase 8.6.4 brief
//     asks for.
//   - `status` is CLOSED to exactly `DRAFT` | `AWAITING_VALIDATION` —
//     per the brief, `APPROVED`/`ACTIVE`/`DEPLOYED` do not exist as
//     values anywhere in this file, by design; a future, separately-
//     approved phase would need to extend this enum, not this one.
//   - `proposalVersion` is always `1` in this phase — genuine version
//     history (a proposal re-drafted as evidence changes) is out of
//     scope for 8.6.4; see this module's own repository.ts header and
//     the final report's "Known limitations" for why.
//   - A proposal is drafted ONLY when
//     `EvolutionNeedAssessment.need === "EVOLUTION_WARRANTED"` — see
//     propose.ts. It is never drafted from a single gap, never from
//     MONITOR, never from INSUFFICIENT_EVIDENCE.
// ---------------------------------------------------------------------------

import type { DecisionSource } from "@/lib/ai/decisionOutcome/contracts";
import type { GapCategory, GapSeverity, CognitiveGapEvidence } from "@/lib/ai/cognitiveGap/contracts";

export type { DecisionSource, GapCategory, GapSeverity, CognitiveGapEvidence };

/** Closed to exactly these two — see this file's header. */
export type ProposalStatus = "DRAFT" | "AWAITING_VALIDATION";

/**
 * The pure engine's output shape — deliberately WITHOUT `createdAt`; a
 * timestamp is added only by the repository/persistence layer, mirroring
 * every prior 8.1.x/8.6.x "pure function never generates its own
 * timestamp" convention (see decisionEvaluation/evaluate.ts,
 * failurePatterns/detect.ts, etc.).
 */
export interface EvolutionProposalWithoutTimestamp {
  readonly proposalId: string;
  readonly proposalVersion: number;
  readonly source: DecisionSource;
  readonly symbol: string;
  /** A static marker for which implementation phase produced this proposal — NOT a package/build version. Always `"phase-8.6.4"` in this pass. */
  readonly currentSystemVersion: string;
  readonly gapCategory: GapCategory;
  readonly gapSeverity: GapSeverity;
  readonly evidence: CognitiveGapEvidence;
  /** One sentence, deterministic, from a fixed per-category template — see propose.ts. Never LLM-generated. */
  readonly hypothesis: string;
  /** Describes what to INVESTIGATE, never an executable instruction — see propose.ts's header for the BAD/GOOD example this follows. */
  readonly proposedChange: string;
  /** Explicitly hedged — "if confirmed" / "not yet demonstrated" — never a claimed result. */
  readonly expectedEffect: string;
  readonly validationRequirements: readonly string[];
  readonly status: ProposalStatus;
}

export interface EvolutionProposal extends EvolutionProposalWithoutTimestamp {
  readonly createdAt: string;
}
