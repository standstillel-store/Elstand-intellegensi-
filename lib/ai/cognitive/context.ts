// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Cognitive Decision Context (Phase 8.0.5)
//
// ARCHITECTURE / AUTHORITY:
//   - ASSEMBLY BOUNDARY, NOT A THINKING LAYER. buildDecisionContext() never
//     recomputes confidence, never regenerates/re-ranks/re-counts/filters
//     hypotheses, never recomputes or reclassifies conflict state, never
//     calculates new risk, never generates a BUY/SELL/execution decision,
//     and performs zero LLM/network/database calls. It answers "what is
//     the structured cognitive state of the system right now" — never
//     "what should we trade."
//   - Observation anchors the context: `observation === null` means the
//     whole function returns `null` — no fabricated empty observation, no
//     fake defaults for anything else either.
//   - Hypotheses and conflict are carried through by REFERENCE, unchanged
//     — both are already immutable-by-contract Cognitive Layer outputs
//     (8.0.3/8.0.4), so there is nothing to clone and nothing to
//     reinterpret. The exact internal CognitiveConflictState (not the
//     route's trimmed `{state, reasons}` public shape) is what this module
//     expects to receive and pass through.
//   - Risk is narrowed to a fresh `{overall, contextQuality}` object —
//     `riskIntelligence.factors` never crosses this boundary.
//   - Working Memory is deliberately NOT a field here — it is pure
//     transport/context infrastructure that introduces no canonical
//     intelligence beyond what `observation` already carries (see the
//     Phase 8.0.5 audit). This object stays minimal, not a "dump
//     everything here" container.
//   - Pure, synchronous, deterministic. No timestamps, no Date.now(), no
//     randomness, no module-level state, no mutation of any input. Same
//     inputs -> deep-equal output.
//   - Downstream-only: no Phase 7 or existing Phase 8 module imports this
//     file. This is a leaf assembly layer.
// ---------------------------------------------------------------------------

import type { RiskIntelligence, RiskSeverity, RiskContextQuality } from "@/lib/ai/oracle/riskIntelligence";
import type { CognitiveObservation } from "./contracts";
import type { CognitiveHypothesisSet } from "./hypothesis";
import type { CognitiveConflictState } from "./conflict";

export interface CognitiveDecisionContext {
  readonly observation: CognitiveObservation;
  readonly hypotheses: CognitiveHypothesisSet | null;
  readonly conflict: CognitiveConflictState | null;
  readonly risk: {
    readonly overall: RiskSeverity;
    readonly contextQuality: RiskContextQuality;
  } | null;
}

/**
 * Pure, deterministic assembly of already-computed Cognitive Layer outputs
 * into one structured internal object. ASSEMBLE, DO NOT THINK AGAIN — every
 * field is either a direct reference to an existing immutable output or a
 * narrow, named copy of two specific RiskIntelligence fields.
 *
 * `observation` anchors the context: if it is `null`, the whole function
 * returns `null` rather than fabricating an empty context. Every other
 * input is independently optional — `hypotheses`/`conflict` being `null`
 * only means that particular upstream cognitive step didn't run or failed
 * defensively upstream, not that the whole context is invalid.
 */
export function buildDecisionContext(observation: CognitiveObservation | null, hypotheses: CognitiveHypothesisSet | null, conflict: CognitiveConflictState | null, riskIntelligence: RiskIntelligence | null): CognitiveDecisionContext | null {
  if (observation === null) return null;

  return {
    observation, // reference — already immutable-by-contract (8.0.1)
    hypotheses, // reference — already immutable-by-contract, bounded <=3 (8.0.3); never re-ranked/re-counted/filtered here
    conflict, // reference — already immutable-by-contract (8.0.4); never recomputed or reclassified here
    risk: riskIntelligence === null ? null : { overall: riskIntelligence.overall, contextQuality: riskIntelligence.contextQuality }, // narrow copy — .factors never crosses this boundary
  };
}
