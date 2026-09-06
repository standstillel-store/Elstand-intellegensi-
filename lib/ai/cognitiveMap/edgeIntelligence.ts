// ---------------------------------------------------------------------------
// ELVOID Intelligence — Neural Edge Intelligence (Phase 8.3.3)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - NOT A PARALLEL GRAPH. This module classifies and enriches the SAME
//     nine `from -> to` pairs already defined as `edgeDefs` in
//     lib/ai/cognitiveMap/build.ts, plus (only where real, cross-cycle
//     evidence exists) a small number of additional DYNAMIC edges that
//     were not part of the original static topology. It never invents a
//     second node set or a second graph structure — every `from`/`to`
//     below is one of the eight `COGNITIVE_MODULE_REGISTRY` (8.3.1) ids.
//   - READ-ONLY, NEVER A DECISION AUTHORITY. This module has no return
//     path into `decideAutonomous`/`executeAutonomousPaperTrade` and is
//     never imported by anything in lib/ai/autonomousRuntime,
//     lib/ai/autonomousDecision, or lib/ai/autonomousExecution. It is a
//     pure function of already-computed, already-persisted data —
//     `cognitive_trace` (8.3.2) and `autonomous_intelligence_snapshot`
//     (8.3.0.1) — called only from the same read-only presentation layer
//     `lib/ai/cognitiveMap/build.ts` already is.
//   - EVIDENCE-GROUNDED, NOT ASSUMED. `STATIC_EDGE_CLASSIFICATION` below
//     is the result of tracing every one of the nine `edgeDefs` pairs
//     against the ACTUAL parameter lists in
//     `lib/ai/autonomousRuntime/orchestrator.ts::runAutonomousCycle()` —
//     not against what the pair's node labels merely suggest. Three of
//     the nine pairs (`market->macro`, `macro->oracle`, `learning->oracle`)
//     have NO real call-graph relationship in that function — macro
//     analysis only ever reads `{ asOf, calendar }`, never `context`;
//     macro's own output only reaches `qualifyAutonomousDecision`/
//     `decideAutonomous`, never `gradeConfluence`, which has already run
//     by the time macro is computed; and constraint validations
//     (`getConstraintValidations`) only reach `buildAutonomousDecisionContext`,
//     never `gradeConfluence`. Those three are marked `type: null` with an
//     explicit `unsupportedReason` — never a fabricated classification.
//     No use of JavaScript's non-deterministic random-number source (the
//     one usually reached for a fake confidence score) appears anywhere
//     in this file — only `Math.min`, a deterministic clamp.
//   - Dynamic edges are ADDITIVE ENTRIES in the same `connections` array
//     `buildCognitiveMap()` already returns (see build.ts), not a second
//     field/second graph. `id` disambiguates them (`"pattern->oracle::contradiction"`,
//     `"learning->decision"`) from the nine static edges' plain `"from->to"` ids.
// ---------------------------------------------------------------------------

import type { CognitiveTraceRecord } from "@/lib/ai/cognitiveTrace/contracts";
import type { EdgeEvidenceRef, IntelligenceConnection, SemanticEdgeType, StructuralEdgeInput } from "./contracts";

export type EdgeDirection = "FORWARD" | "BIDIRECTIONAL";
/** Semantic alias — `IntelligenceConnection` already carries every Phase 8.3.3 field (see contracts.ts). Not a second/parallel edge shape. */
export type SemanticEdge = IntelligenceConnection;

// ---------------------------------------------------------------------------
// Static classification of the nine existing edgeDefs pairs (build.ts).
// Every entry's `evidence` string names the exact orchestrator.ts variables
// traced to reach that conclusion.
// ---------------------------------------------------------------------------
interface StaticClassification {
  readonly type: SemanticEdgeType | null;
  readonly evidence: string;
}

export const STATIC_EDGE_CLASSIFICATION: Readonly<Record<string, StaticClassification>> = {
  "market->macro": {
    type: null,
    evidence:
      "unsupported — analyzeMacroIntelligence({ asOf, calendar }) never receives `context` (market/candles); no call-graph edge from assembleOracleContext's output into macro analysis in runAutonomousCycle().",
  },
  "market->pattern": {
    type: "DATA_FLOW",
    evidence: "computeConfluence(context) consumes `context` (assembleOracleContext's output) directly; confluence.factors is the source of pattern's liquidity/structure/volume evidence strings (evidenceForSource()).",
  },
  "macro->oracle": {
    type: null,
    evidence:
      "unsupported — gradeConfluence(confluence, risk) (the canonical Oracle assessment) runs in Step 1, before macro is computed in Step 5; macro's output only reaches qualifyAutonomousDecision/decideAutonomous, never gradeConfluence.",
  },
  "pattern->oracle": {
    type: "DATA_FLOW",
    evidence: "confluence.factors (pattern's evidence source) is the direct argument to gradeConfluence(confluence, risk) — the Oracle assessment.",
  },
  "oracle->risk": {
    type: "DATA_FLOW",
    evidence: "risk fields (entry/stopLoss/takeProfit/riskReward/riskStatus) are produced by buildOracleRiskPlan()+gradeConfluence() and read verbatim off `assessment.risk`/`assessment.riskStatus` — the Risk Engine node's own registry description ('attached to each Oracle assessment').",
  },
  "risk->decision": {
    type: "DEPENDENCY",
    evidence:
      "indirect/multi-hop: `assessment` (carrying risk fields) is passed into buildAutonomousDecisionContext() -> autonomousContext -> decideAutonomous(); a structural dependency through decision-context assembly, not a single direct value copy.",
  },
  "decision->execution": {
    type: "DATA_FLOW",
    evidence: "effectiveDecision is passed directly as the `decision` field of executeAutonomousPaperTrade({ decision: effectiveDecision, ... }).",
  },
  "execution->learning": {
    type: "DATA_FLOW",
    evidence: "execution (executeAutonomousPaperTrade's result) is the direct argument to classifyAutonomousLearningLifecycle(execution).",
  },
  "learning->oracle": {
    type: null,
    evidence:
      "unsupported — getConstraintValidations() output only reaches buildAutonomousDecisionContext() (feeding decideAutonomous), never gradeConfluence(), which has already run by that point in the cycle.",
  },
  "memory->decision": {
    type: "DATA_FLOW",
    evidence: "queryDecisionMemory()'s result (`memory`) is passed directly as a field of buildAutonomousDecisionContext()'s input, which produces `autonomousContext` -> decideAutonomous(); the same field qualifyAutonomousDecision() reads as context.memory to compute negativeMemorySignalPresent.",
  },
} as const;

/**
 * Enriches the nine existing structural edges with a real, traced
 * classification. Preserves every field `buildCognitiveMap()` already
 * computes (`id`/`from`/`to`/`active`/`lastActivatedAt`) verbatim — this
 * function narrows/adds fields, it never recomputes freshness.
 */
export function classifyStructuralEdges(connections: readonly StructuralEdgeInput[]): readonly SemanticEdge[] {
  return connections.map((c) => {
    const classification = STATIC_EDGE_CLASSIFICATION[c.id];
    const evidenceGrounded = !!classification && classification.type !== null;
    return {
      ...c,
      relationshipType: classification?.type ?? null,
      direction: "FORWARD",
      strength: null, // structural edges carry no per-cycle numeric strength — see dynamic edges for cycle-evidenced strength.
      evidenceRefs: classification && classification.type !== null ? [{ kind: "orchestrator_call_graph", ref: `runAutonomousCycle():${c.id}`, detail: classification.evidence }] : [],
      evidenceGrounded,
      unsupportedReason: classification && classification.type === null ? classification.evidence : classification ? null : "unsupported — pair not present in STATIC_EDGE_CLASSIFICATION",
      isDynamic: false,
    };
  });
}

/** Minimal, verbatim-only slice of an AutonomousIntelligenceSnapshotRecord this module needs — avoids importing the full contract for one field. */
export interface LearningInfluenceSource {
  readonly symbol: string;
  readonly updatedAt: string;
  readonly learningInfluence: string | null;
}

/**
 * Derives 0-2 additional, evidence-conditional edges from real, already-
 * persisted data. Never present when no symbol's evidence supports them —
 * absence here is the honest default, not an error.
 */
export function deriveDynamicEdges(latestTraceBySymbol: ReadonlyMap<string, CognitiveTraceRecord>, latestSnapshotBySymbol: ReadonlyMap<string, LearningInfluenceSource>): readonly SemanticEdge[] {
  const edges: SemanticEdge[] = [];

  // --- CONTRADICTION: pattern->oracle, only when the most recent
  // CONFLICTED cycle (across tracked symbols) genuinely shows it. Strength
  // is proportional to the real contributingFactors count this cycle
  // produced — never a fabricated constant. ---
  let mostRecentConflicted: { symbol: string; trace: CognitiveTraceRecord } | null = null;
  for (const [symbol, trace] of latestTraceBySymbol) {
    if (trace.conflict?.state !== "CONFLICTED") continue;
    if (!mostRecentConflicted || Date.parse(trace.conflictAt ?? trace.cycleAt) > Date.parse(mostRecentConflicted.trace.conflictAt ?? mostRecentConflicted.trace.cycleAt)) {
      mostRecentConflicted = { symbol, trace };
    }
  }
  if (mostRecentConflicted) {
    const { symbol, trace } = mostRecentConflicted;
    const factorCount = trace.conflict?.contributingFactors.length ?? 0;
    edges.push({
      id: "pattern->oracle::contradiction",
      from: "pattern",
      to: "oracle",
      active: true,
      lastActivatedAt: trace.conflictAt ?? trace.cycleAt,
      relationshipType: "CONTRADICTION",
      direction: "FORWARD",
      strength: Math.min(1, factorCount / 3),
      evidenceRefs: [{ kind: "cognitive_trace", ref: `${symbol}@${trace.cycleAt}`, detail: `resolveCognitiveConflict() -> CONFLICTED; reasons: ${(trace.conflict?.reasons ?? []).join(" | ") || "(none recorded)"}` }],
      evidenceGrounded: true,
      unsupportedReason: null,
      isDynamic: true,
    });
  }

  // --- LEARNING_INFLUENCE: learning->decision (not among the nine static
  // pairs — added only here, only when real evidence exists). Sourced from
  // `autonomous_intelligence_snapshot.learningInfluence`, itself
  // `describeLearningInfluence(memory)` in orchestrator.ts — a real,
  // count-based description of Decision Memory matches, never invented
  // narrative. No natural numeric strength exists for a free-text
  // description, so `strength` stays `null` rather than a guessed value. ---
  let mostRecentInfluence: LearningInfluenceSource | null = null;
  for (const source of latestSnapshotBySymbol.values()) {
    if (!source.learningInfluence) continue;
    if (!mostRecentInfluence || Date.parse(source.updatedAt) > Date.parse(mostRecentInfluence.updatedAt)) mostRecentInfluence = source;
  }
  if (mostRecentInfluence) {
    edges.push({
      id: "learning->decision",
      from: "learning",
      to: "decision",
      active: true,
      lastActivatedAt: mostRecentInfluence.updatedAt,
      relationshipType: "LEARNING_INFLUENCE",
      direction: "FORWARD",
      strength: null,
      evidenceRefs: [{ kind: "autonomous_intelligence_snapshot", ref: `${mostRecentInfluence.symbol}@${mostRecentInfluence.updatedAt}`, detail: `queryDecisionMemory() result reached buildAutonomousDecisionContext(); learningInfluence="${mostRecentInfluence.learningInfluence}"` }],
      evidenceGrounded: true,
      unsupportedReason: null,
      isDynamic: true,
    });
  }

  return edges;
}
