// ---------------------------------------------------------------------------
// ELVOID Intelligence — Reasoning Gap Observation (Phase 8.6.3 Part A)
//
// ARCHITECTURE / AUTHORITY:
//   - A "reasoning gap" distinguishes "ELVOID performed poorly" from
//     "ELVOID has identified a genuine reasoning weakness" — per the
//     Phase 8.6.3 brief, this distinction is mandatory. It is deliberately
//     NOT a second detector: this module is a pure, narrative-framing
//     transform over 8.6.2's already-detected `CognitiveGap`s, filtered
//     to the 4 categories that represent a REASONING concern specifically
//     (as opposed to PATTERN_GAP, which is about recurring OUTCOMES —
//     "ELVOID performed poorly" territory the brief explicitly wants kept
//     separate). Zero new evidence is gathered; zero new database
//     read happens here.
//   - Every `ReasoningGapObservation` inherits its source gap's
//     >=MIN_OCCURRENCE_COUNT gate — a reasoning gap can never be raised
//     from a single decision, by construction (see cognitiveGap/detect.ts).
//   - Language is deliberately hedged, matching the Phase 8.6.3 brief's
//     own required vocabulary: "observed reasoning gap", "repeated
//     inconsistency", "candidate reasoning weakness". Never "this caused
//     the loss" or any other causal claim — see `statement` below.
// ---------------------------------------------------------------------------

import type { DecisionSource, GapCategory, GapSeverity, CognitiveGap } from "@/lib/ai/cognitiveGap/contracts";

export type { DecisionSource, GapCategory, GapSeverity, CognitiveGap };

/** The 4 of 8.6.2's 6 categories that represent a reasoning concern, not an outcome/pattern concern. PATTERN_GAP and CONFIDENCE_ALIGNMENT_GAP are handled elsewhere: PATTERN_GAP is explicitly about recurring OUTCOMES, and CONFIDENCE_ALIGNMENT_GAP is already its own well-named, self-explanatory category — narrating it further would not add information. */
export const REASONING_GAP_CATEGORIES: readonly GapCategory[] = ["CONTRADICTION_GAP", "CONTEXT_GAP", "REASONING_CONSISTENCY_GAP", "EVIDENCE_GAP"];

export interface ReasoningGapObservation {
  readonly source: DecisionSource;
  readonly symbol: string;
  readonly category: GapCategory;
  readonly severity: GapSeverity;
  /** Deterministic, from a fixed per-category template — never LLM-generated, never a causal claim. Always begins with "Observed reasoning gap:" per the Phase 8.6.3 brief's required vocabulary. */
  readonly statement: string;
  /** Carried through verbatim from the originating `CognitiveGap` — the same occurrence counts, never re-derived. */
  readonly sourceGap: CognitiveGap;
}
