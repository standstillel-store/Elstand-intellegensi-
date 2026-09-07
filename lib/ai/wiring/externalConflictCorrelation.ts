// ---------------------------------------------------------------------------
// ELVOID Intelligence — 8.3 × 8.4 Wiring: External Conflict Correlation
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - THE ONLY ONE OF FIVE REQUESTED WIRINGS THAT HAD A REAL SOCKET. See
//     the Phase 8.3×8.4 final wiring report for the full audit of all
//     five requested connections (Cognitive Trace, Conflict Engine,
//     Neural Edge Intelligence, Cognitive Replay, Causal Graph). This
//     file wires exactly one: Phase 8.4's external conflict signals
//     (`CommunityClaimConflict` from `lib/ai/externalIntelligence/community`,
//     and opposing `direction` values across `NormalizedExternalEvidence`
//     from `lib/ai/externalIntelligence/evidence`) alongside Phase 8.3.5's
//     `AxisConflictReport` (`lib/ai/cognitiveConflict/axisAnalysis.ts`) —
//     because both are keyed by the same real, comparable identity: a
//     trading `symbol`. No other requested connection had a matching key,
//     a persisted join point, or a citable code path without modifying a
//     CLOSED Phase 8.3 contract/enum or a persisted DB schema — see the
//     report for exactly why each of those four was left standalone.
//   - PURE, READ-ONLY, NEVER PERSISTED. This module computes nothing new
//     about internal conflict (it takes an already-computed
//     `AxisConflictReport` verbatim) and computes nothing new about
//     external conflict beyond a MECHANICAL comparison of already-real
//     fields (`CommunityClaimConflict`, already-normalized `direction`
//     values). There is no repository/write function anywhere in this
//     file, and nothing here is called from `lib/ai/autonomousRuntime`,
//     `autonomousDecision`, or `autonomousExecution` — it has no decision
//     authority and produces no BUY/SELL/EXECUTE/WAIT/REJECT.
//   - NEVER MERGED, NEVER RECONCILED. `internalAxisReport` and the
//     external conflict arrays are placed SIDE BY SIDE. This module never
//     claims one supersedes the other, never averages a "combined
//     conflict score", and never resolves which (if any) is correct —
//     see `note` on the output, always present, stating this explicitly.
//   - ZERO MODIFICATION TO EITHER PHASE. `AxisConflictReport`/
//     `ConflictAxis` (Phase 8.3.5), `CommunityIntelligenceContext`/
//     `CommunityClaimConflict` (Phase 8.4.4), and `NormalizedExternalEvidence`
//     (Phase 8.4.3) are all imported READ-ONLY. No existing file in either
//     phase changed to make this wiring possible.
//   - SYMBOL ISOLATION PRESERVED. Every array below is filtered to the
//     one `symbol` this correlation was requested for — evidence or
//     claims about a different symbol never leak in.
//   - HONEST WHEN NOTHING WAS SUPPLIED. `communityContext: null` or
//     `externalEvidence: []` are real, expected inputs (Phase 8.4 has no
//     live caller yet — see the report) — they produce empty conflict
//     arrays and `communityStatus: "NOT_SUPPLIED"`, never a fabricated
//     "no conflict found" reading dressed up as a positive result.
// ---------------------------------------------------------------------------

import type { AxisConflictReport } from "@/lib/ai/cognitiveConflict/axisAnalysis";
import type { CommunityClaimConflict, CommunityIntelligenceContext, CommunityIntelligenceStatus } from "@/lib/ai/externalIntelligence/community/contracts";
import type { NormalizedExternalEvidence, EvidenceDirection } from "@/lib/ai/externalIntelligence/evidence/contracts";
import type { SourceCapability } from "@/lib/ai/externalIntelligence/contracts";

/** Same closed vocabulary as Phase 8.4.3's `EvidenceDirection` — this module invents no new direction value, it only checks for opposing PAIRS already within that closed set. */
const OPPOSITE_DIRECTION_PAIRS: ReadonlyArray<readonly [EvidenceDirection, EvidenceDirection]> = [
  ["POSITIVE", "NEGATIVE"],
  ["INCREASING", "DECREASING"],
];

export interface ExternalDirectionConflict {
  readonly capability: SourceCapability;
  readonly symbol: string;
  /** Real, distinct `NormalizedExternalEvidence.id`s — never fabricated identifiers. */
  readonly evidenceIds: readonly [string, string];
  readonly directions: readonly [EvidenceDirection, EvidenceDirection];
}

export interface ExternalConflictCorrelation {
  readonly version: 1;
  readonly symbol: string;
  /** = the caller's `asOf`, copied verbatim — never a fresh `Date.now()` read. */
  readonly correlatedAt: string;
  /** Verbatim passthrough of the Phase 8.3.5 Conflict Engine's own report — never recomputed, never narrowed. */
  readonly internalAxisReport: AxisConflictReport;
  /** `"NOT_SUPPLIED"` when the caller passed `communityContext: null` — distinct from any real `CommunityIntelligenceStatus`, since "not supplied to this correlation" and "genuinely unavailable" are different facts. */
  readonly communityStatus: CommunityIntelligenceStatus | "NOT_SUPPLIED";
  /** `CommunityClaimConflict` entries from Phase 8.4.4, filtered to this symbol — verbatim, never reworded. */
  readonly externalClaimConflicts: readonly CommunityClaimConflict[];
  /** Mechanical opposing-`direction` pairs found within the supplied, AVAILABLE, non-malformed evidence for this symbol — see `findExternalDirectionConflicts()`. */
  readonly externalDirectionConflicts: readonly ExternalDirectionConflict[];
  readonly hasExternalConflict: boolean;
  /** Read of `internalAxisReport.axes` — informational only, never combined with the external flag into one score. */
  readonly hasInternalConflict: boolean;
  readonly note: string;
}

/**
 * Finds opposing-direction evidence pairs for one symbol. Deterministic:
 * within each capability group, at most one representative pair per
 * opposite-direction combination is reported (the first matching each
 * side, in the array's own order) — never every possible combination,
 * which would explode combinatorially without adding information.
 */
export function findExternalDirectionConflicts(evidence: readonly NormalizedExternalEvidence[], symbol: string): ExternalDirectionConflict[] {
  const relevant = evidence.filter((e) => e.symbol === symbol && e.availability === "AVAILABLE" && !e.malformed && e.direction !== null);

  const byCapability = new Map<SourceCapability, NormalizedExternalEvidence[]>();
  for (const e of relevant) {
    const list = byCapability.get(e.capability) ?? [];
    list.push(e);
    byCapability.set(e.capability, list);
  }

  const conflicts: ExternalDirectionConflict[] = [];
  for (const [capability, list] of byCapability) {
    for (const [a, b] of OPPOSITE_DIRECTION_PAIRS) {
      const first = list.find((e) => e.direction === a);
      const second = list.find((e) => e.direction === b);
      if (first && second && first.id !== second.id) {
        conflicts.push({ capability, symbol, evidenceIds: [first.id, second.id], directions: [a, b] });
      }
    }
  }
  return conflicts;
}

/**
 * The single exported entry point. Pure, synchronous, deterministic —
 * identical input always produces a deep-equal output.
 */
export function correlateExternalConflict(params: {
  readonly symbol: string;
  readonly asOf: string;
  readonly internalAxisReport: AxisConflictReport;
  readonly communityContext: CommunityIntelligenceContext | null;
  readonly externalEvidence: readonly NormalizedExternalEvidence[];
}): ExternalConflictCorrelation {
  const { symbol, asOf, internalAxisReport, communityContext, externalEvidence } = params;

  const externalClaimConflicts = communityContext ? communityContext.claimConflicts.filter((c) => c.symbol === symbol) : [];
  const externalDirectionConflicts = findExternalDirectionConflicts(externalEvidence, symbol);
  const hasExternalConflict = externalClaimConflicts.length > 0 || externalDirectionConflicts.length > 0;
  const hasInternalConflict = internalAxisReport.axes.some((a) => a.status === "CONFLICTED");

  return {
    version: 1,
    symbol,
    correlatedAt: asOf,
    internalAxisReport,
    communityStatus: communityContext ? communityContext.status : "NOT_SUPPLIED",
    externalClaimConflicts,
    externalDirectionConflicts,
    hasExternalConflict,
    hasInternalConflict,
    note:
      "Internal (Phase 8.3.5 Conflict Engine, per-axis) and external (Phase 8.4.3/8.4.4) conflict signals are presented side by side for the same symbol only — never merged, averaged, or reconciled into one verdict. A symbol may show internal conflict with no external conflict, external conflict with no internal conflict, both, or neither; this correlation does not decide which signal (if any) is more correct, and has no decision authority of its own.",
  };
}
