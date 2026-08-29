// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Cognitive Hypothesis Engine (Phase 8.0.3)
//
// ARCHITECTURE / AUTHORITY:
//   - THIN REFRAMING LAYER over already-computed Scenario (7.5), Contradiction
//     (7.6), and Arbitration (7.7) output — not a second confluence/grading/
//     signal/execution/LLM engine. It never re-derives supporting/opposing
//     evidence, contradiction severity, scenario direction, regime/MTF
//     compatibility, or confidence — every field below is either copied
//     verbatim from an existing Phase 7 object or a pure derivation over
//     already-computed values (deriveHypothesisStatus/deriveUncertainty).
//   - Canonical Oracle authority (assessment.side/grade/confidence/
//     riskStatus/invalidation) is never read directly here at all — this
//     module doesn't even import OracleAssessment. It consumes only
//     CognitiveWorkingMemory (for the evidence pool) and the Scenario/
//     Contradiction/Arbitration objects, none of which this file mutates or
//     recomputes.
//   - No cognitiveSide/cognitiveGrade/hypothesisSignal/recommendedTrade/
//     alternativeSignal/hypothesisConfidence, and no entry/stopLoss/
//     takeProfit/order/positionSize anywhere in this file's output — the
//     Hypothesis Engine never generates execution instructions.
//   - Pure, synchronous, deterministic. Zero network/database/LLM calls,
//     zero module-level state, zero mutation of any input (memory,
//     observation, notes, Scenario, ContradictionReport, DecisionArbitration,
//     or any evidence array).
//   - Bounded: at most 3 hypotheses, from exactly 3 possible generation
//     paths (scenario_primary, scenario_alternative, contradiction) — never
//     one-per-evidence-item, never one-per-cluster, never a ranked-then-
//     truncated pool.
// ---------------------------------------------------------------------------

import type { Scenario, ScenarioContext, ScenarioDirection, ScenarioEvidenceRef } from "@/lib/ai/oracle/scenario";
import type { ClassifiedContradiction, ContradictionOrigin, ContradictionReport, ContradictionSeverity } from "@/lib/ai/oracle/contradiction";
import type { DecisionAlignment, DecisionArbitration } from "@/lib/ai/oracle/arbitration";
import { firingClustersFor } from "@/lib/ai/oracle/evidence";
import type { CognitiveWorkingMemory } from "./memory";
import type { CognitiveEvidenceRef } from "./types";

export type HypothesisStatus = "ACTIVE" | "SUPPORTED" | "CHALLENGED" | "REJECTED";
export type HypothesisUncertainty = "LOW" | "MEDIUM" | "HIGH";
export type HypothesisOrigin = "scenario_primary" | "scenario_alternative" | "contradiction";

export interface CognitiveHypothesis {
  readonly id: string;
  readonly statement: string;
  readonly hypothesisDirection: "LONG" | "SHORT" | null;
  readonly supportingEvidence: readonly ScenarioEvidenceRef[];
  readonly opposingEvidence: readonly ScenarioEvidenceRef[];
  readonly status: HypothesisStatus;
  readonly uncertainty: HypothesisUncertainty;
  readonly origin: HypothesisOrigin;
}

export interface CognitiveHypothesisSet {
  readonly hypotheses: readonly CognitiveHypothesis[];
  readonly generatedFrom: {
    readonly hasScenarios: boolean;
    readonly hasContradictions: boolean;
    readonly hasArbitration: boolean;
  };
}

// ---------------------------------------------------------------------------
// Status derivation — pure, reuses arbitration.alignment (7.7) directly.
// No second support/opposition scoring algorithm. REJECTED is deliberately
// the narrowest branch: it only fires for the ALTERNATIVE hypothesis, and
// only when arbitration itself already says (a) the primary decision is
// STRONGLY_SUPPORTED (clean, uncautioned) AND (b) arbitration already
// classified the alternative as NOT active opposition (a mere within-
// structure contingency, per arbitration.ts's own isActiveOpposition()).
// Both facts are read straight off DecisionArbitration — nothing new is
// computed to reach REJECTED. It is fine, and expected, for REJECTED to be
// rare or absent in a given response.
// ---------------------------------------------------------------------------

function derivePrimaryStatus(alignment: DecisionAlignment, hasOpposingEvidence: boolean): HypothesisStatus {
  switch (alignment) {
    case "STRONGLY_SUPPORTED":
      return "SUPPORTED";
    case "SUPPORTED_WITH_CAUTION":
      // Meaningful existing opposition = the primary scenario's OWN
      // opposingEvidence is non-empty (already collected by scenario.ts) —
      // not a new opposition detector, just reading what's already there.
      return hasOpposingEvidence ? "CHALLENGED" : "SUPPORTED";
    case "CONFLICTED":
      return "CHALLENGED";
    case "UNSUPPORTED_CONTEXT":
    case "NOT_APPLICABLE":
      return "ACTIVE";
  }
}

function deriveAlternativeStatus(arbitration: DecisionArbitration): HypothesisStatus {
  if (arbitration.alignment === "NOT_APPLICABLE") return "ACTIVE";
  if (arbitration.alternativeIsActiveOpposition) return "CHALLENGED";
  if (arbitration.alignment === "STRONGLY_SUPPORTED") return "REJECTED"; // narrow, deterministic invalidation — see comment above
  return "ACTIVE";
}

// ---------------------------------------------------------------------------
// Uncertainty derivation — pure, quality-aware, reuses firingClustersFor()
// (evidence.ts) for cluster-independence and contradictions.
// hasUnresolvedGenuineContradiction (already-aggregated by contradiction.ts)
// for contradiction-severity awareness. No numeric scoring invented.
//
// Proxy/unavailable backing data (or a meaningful unresolved genuine
// contradiction) can only ever push uncertainty toward HIGH — never toward
// LOW. LOW requires clean evidence quality AND sufficient independent
// cluster support (>=2, same convention OracleAssessment.
// independentConfirmationClusters already uses elsewhere in this pipeline)
// AND no meaningful unresolved genuine contradiction.
// ---------------------------------------------------------------------------

const MIN_INDEPENDENT_CLUSTERS_FOR_LOW_UNCERTAINTY = 2;

function deriveDirectionalUncertainty(pool: readonly CognitiveEvidenceRef[], direction: ScenarioDirection, contradictionMeaningful: boolean): HypothesisUncertainty {
  const relevant = pool.filter((e) => e.direction === direction);
  const hasProxyOrUnavailable = relevant.length === 0 || relevant.some((e) => e.quality !== "real");
  const clusterCount = firingClustersFor([...pool], direction).size;
  const insufficientClusters = clusterCount < MIN_INDEPENDENT_CLUSTERS_FOR_LOW_UNCERTAINTY;

  if (hasProxyOrUnavailable || contradictionMeaningful) return "HIGH";
  if (insufficientClusters) return "MEDIUM";
  return "LOW";
}

/**
 * A contradiction-origin hypothesis's own backing IS the contradiction it
 * represents — by generation-gating (see pickContradictionSource below) it
 * only ever exists for a GENUINE, non-LOW-severity contradiction, so it can
 * never be LOW uncertainty: HIGH severity -> HIGH uncertainty, MODERATE
 * severity -> MEDIUM uncertainty.
 */
function deriveContradictionUncertainty(severity: ContradictionSeverity): HypothesisUncertainty {
  return severity === "HIGH" ? "HIGH" : "MEDIUM";
}

// ---------------------------------------------------------------------------
// Generation path A/B — scenario_primary / scenario_alternative. Reuses
// Scenario.thesis/direction/supportingEvidence/opposingEvidence verbatim —
// no rebuilding, no re-detection. `id` is deterministic (derived from the
// existing Scenario.id, never random/timestamp-based).
// ---------------------------------------------------------------------------

function buildScenarioHypothesis(scenario: Scenario, origin: "scenario_primary" | "scenario_alternative", status: HypothesisStatus, uncertainty: HypothesisUncertainty): CognitiveHypothesis {
  return {
    id: `hyp-${scenario.id}`,
    statement: scenario.thesis,
    hypothesisDirection: scenario.direction,
    supportingEvidence: scenario.supportingEvidence,
    opposingEvidence: scenario.opposingEvidence,
    status,
    uncertainty,
    origin,
  };
}

// ---------------------------------------------------------------------------
// Generation path C — contradiction (optional, at most one). Only fires for
// a GENUINE, non-LOW-severity contradiction that contradictions.ts's own
// aggregate (hasUnresolvedGenuineContradiction) already flagged, and only
// when it is not already represented by the alternative hypothesis (text-
// identity dedup against that hypothesis's own supporting/opposing
// `.detail` strings — the same description-text identity contradiction.ts
// itself already relies on for its own dedup). hypothesisDirection is
// always null here: nothing in ClassifiedContradiction carries a directional
// claim, and none is invented.
// ---------------------------------------------------------------------------

/** Best-effort mapping from ContradictionOrigin to the closest ScenarioEvidenceRef["source"] tag — never a new evidence shape, just picking the existing union member that already matches where that contradiction's description text actually traces back to. */
function mapContradictionOriginToScenarioSource(origin: ContradictionOrigin): ScenarioEvidenceRef["source"] {
  if (origin === "mtf_thesis_threatened") return "mtf";
  return "confluence"; // "confluence" and "scenario_opposing_evidence" both trace back to confluence-sourced data per contradiction.ts's own comments
}

function pickContradictionSource(contradictions: ContradictionReport | null, alternativeHypothesis: CognitiveHypothesis | null): ClassifiedContradiction | null {
  if (!contradictions || !contradictions.hasUnresolvedGenuineContradiction) return null;

  const alreadyRepresented = new Set<string>();
  if (alternativeHypothesis) {
    for (const ref of [...alternativeHypothesis.supportingEvidence, ...alternativeHypothesis.opposingEvidence]) {
      alreadyRepresented.add(ref.detail);
    }
  }

  const candidates = contradictions.contradictions.filter((c) => c.genuineness === "GENUINE" && c.severity !== "LOW" && !alreadyRepresented.has(c.description));
  if (candidates.length === 0) return null;

  return candidates.find((c) => c.severity === "HIGH") ?? candidates[0];
}

function buildContradictionHypothesis(chosen: ClassifiedContradiction): CognitiveHypothesis {
  const mappedSource = mapContradictionOriginToScenarioSource(chosen.origin);
  const sourcesKey = [...chosen.sources].sort().join("-") || "none";
  return {
    id: `hyp-contradiction-${mappedSource}-${sourcesKey}`,
    statement: `Unresolved genuine disagreement remains in the underlying evidence: ${chosen.description}`,
    hypothesisDirection: null,
    supportingEvidence: [{ source: mappedSource, detail: chosen.description }],
    opposingEvidence: [],
    status: "CHALLENGED", // exists only because it IS an unresolved, non-LOW-severity genuine contradiction — never derived any other way
    uncertainty: deriveContradictionUncertainty(chosen.severity),
    origin: "contradiction",
  };
}

// ---------------------------------------------------------------------------
// buildHypotheses — the only exported entry point. Pure, deterministic,
// synchronous. Never mutates memory/observation/scenarios/contradictions/
// arbitration or any array they contain. Never appends to Working Memory
// (that stays the caller's responsibility, not this module's) and never
// returns anything but CognitiveHypothesisSet.
// ---------------------------------------------------------------------------

export function buildHypotheses(memory: CognitiveWorkingMemory, scenarios: ScenarioContext | null, contradictions: ContradictionReport | null, arbitration: DecisionArbitration | null): CognitiveHypothesisSet {
  const pool = memory.observation.evidence;
  const contradictionMeaningful = !!contradictions?.hasUnresolvedGenuineContradiction;

  const hypotheses: CognitiveHypothesis[] = [];
  let alternativeHypothesis: CognitiveHypothesis | null = null;

  // A. scenario_primary — at most one.
  if (scenarios?.primary) {
    const s = scenarios.primary;
    const hasOpposing = s.opposingEvidence.length > 0;
    const status = arbitration ? derivePrimaryStatus(arbitration.alignment, hasOpposing) : hasOpposing ? "CHALLENGED" : "ACTIVE";
    const uncertainty = deriveDirectionalUncertainty(pool, s.direction, contradictionMeaningful);
    hypotheses.push(buildScenarioHypothesis(s, "scenario_primary", status, uncertainty));
  }

  // B. scenario_alternative — at most one.
  if (scenarios?.alternative) {
    const s = scenarios.alternative;
    const status = arbitration ? deriveAlternativeStatus(arbitration) : "ACTIVE";
    const uncertainty = deriveDirectionalUncertainty(pool, s.direction, contradictionMeaningful);
    alternativeHypothesis = buildScenarioHypothesis(s, "scenario_alternative", status, uncertainty);
    hypotheses.push(alternativeHypothesis);
  }

  // C. contradiction — at most one, and only these three paths exist, so
  // `hypotheses` can never exceed 3 by construction.
  const chosenContradiction = pickContradictionSource(contradictions, alternativeHypothesis);
  if (chosenContradiction) {
    hypotheses.push(buildContradictionHypothesis(chosenContradiction));
  }

  return {
    hypotheses: hypotheses.slice(0, 3), // structural belt-and-braces; unreachable in practice since at most 3 paths can ever push
    generatedFrom: {
      hasScenarios: !!scenarios,
      hasContradictions: !!contradictions,
      hasArbitration: !!arbitration,
    },
  };
}
