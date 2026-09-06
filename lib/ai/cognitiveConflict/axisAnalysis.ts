// ---------------------------------------------------------------------------
// ELVOID Intelligence — Cognitive Conflict Axis Analysis (Phase 8.3.5)
//
// ARCHITECTURE / AUTHORITY BOUNDARY (READ FIRST):
//   - READ-ONLY, NOT A NEW CONFLICT SCORE. This module invents nothing —
//     every axis below is derived from data ALREADY computed and, for the
//     three data-level axes, ALREADY PERSISTED verbatim in
//     `cognitive_trace.contradictions` (Phase 8.3.5 addition to 8.3.2) —
//     see `lib/ai/oracle/contradiction.ts::classifyContradictions()`, the
//     real Phase 7.6 module this data comes from. It never re-runs Oracle
//     analysis, never calls resolveCognitiveConflict() itself, and is
//     never imported by anything in lib/ai/autonomousDecision or
//     lib/ai/autonomousExecution.
//   - WHY A SEPARATE MODULE FROM `lib/ai/cognitive/conflict.ts`:
//     `resolveCognitiveConflict()` (Phase 8.0.4) already answers "how
//     coherent is the system's own interpretation" as ONE aggregate
//     state. It deliberately does not decompose by axis — its
//     `contributingFactors` name contributing MODULES (e.g.
//     `"arbitration"`), never a `ConfluenceSource` PAIR. This module
//     answers a narrower, different question per axis — "do these two
//     SPECIFIC named things disagree" — using the same underlying
//     evidence, never a competing conflict authority.
//   - FIVE AXES, THREE DIFFERENT EVIDENCE SOURCES — see each function's
//     doc comment for exactly which real field/table backs it. An axis
//     is `UNSUPPORTED` (not `NOT_CONFLICTED`) exactly when the evidence
//     that axis needs was not available for this read — never guessed,
//     never defaulted to `NOT_CONFLICTED` in place of missing data.
//   - `MACRO_VS_TECHNICAL` deliberately means "the `macro` ConfluenceSource
//     confluence FACTOR disagreed with a technical factor inside
//     `computeConfluence()`" — NOT the same thing as the standalone
//     `analyzeMacroIntelligence()` module (the "macro" cognitiveMap node).
//     Phase 8.3.3's own audit already found no real call-graph link
//     between that module and Oracle grading; this axis does not revisit
//     that finding, it answers a different, narrower question about a
//     same-named-but-distinct `ConfluenceSource` value.
// ---------------------------------------------------------------------------

import { NEGATIVE_EVALUATION_CLASSES } from "@/lib/ai/failurePatterns/detect";
import type { CognitiveTraceRecord } from "@/lib/ai/cognitiveTrace/contracts";
import type { DecisionMemoryResult } from "@/lib/ai/decisionMemory/contracts";

export type ConflictAxis = "MACRO_VS_TECHNICAL" | "HTF_VS_LTF" | "LIQUIDITY_VS_STRUCTURE" | "MEMORY_VS_EVIDENCE" | "RISK_VS_OPPORTUNITY";
export type AxisConflictStatus = "CONFLICTED" | "NOT_CONFLICTED" | "UNSUPPORTED";

export interface AxisConflict {
  readonly axis: ConflictAxis;
  readonly status: AxisConflictStatus;
  /** Verbatim descriptions/detail strings from the real evidence source — never paraphrased into a stronger claim. `null` when `status !== "CONFLICTED"`. */
  readonly evidence: readonly string[] | null;
  /** Non-null exactly when `status === "UNSUPPORTED"` — names the specific missing input. */
  readonly unsupportedReason: string | null;
}

export interface AxisConflictReport {
  readonly symbol: string;
  readonly axes: readonly AxisConflict[];
}

function unsupported(axis: ConflictAxis, reason: string): AxisConflict {
  return { axis, status: "UNSUPPORTED", evidence: null, unsupportedReason: reason };
}

/**
 * MACRO_VS_TECHNICAL / HTF_VS_LTF / LIQUIDITY_VS_STRUCTURE — all three
 * sourced from `trace.contradictions` (Phase 8.3.5's `cognitive_trace`
 * addition), itself verbatim `ContradictionReport.contradictions` from
 * `classifyContradictions()`. Only `genuineness === "GENUINE"` entries
 * count — a `DATA_GAP`/`SAME_CLUSTER` entry is real evidence of a data
 * quality issue, not a genuine cross-source disagreement, per
 * contradiction.ts's own documented distinction.
 */
function dataLevelAxes(trace: CognitiveTraceRecord): AxisConflict[] {
  if (trace.contradictions === null) {
    const reason = "no assessed cycle this read — trace.contradictions is null (NO_ASSESSMENT cycle, same rule as every other stage since 8.3.2)";
    return [unsupported("MACRO_VS_TECHNICAL", reason), unsupported("HTF_VS_LTF", reason), unsupported("LIQUIDITY_VS_STRUCTURE", reason)];
  }

  const genuine = trace.contradictions.filter((c) => c.genuineness === "GENUINE");

  const macroVsTechnical = genuine.filter((c) => c.sources.includes("macro") && c.sources.some((s) => s !== "macro"));
  const htfVsLtf = genuine.filter((c) => c.origin === "mtf_thesis_threatened");
  const liquidityVsStructure = genuine.filter((c) => c.sources.includes("liquidity") && c.sources.includes("market_structure"));

  const toAxis = (axis: ConflictAxis, matches: typeof genuine): AxisConflict =>
    matches.length > 0
      ? { axis, status: "CONFLICTED", evidence: matches.map((c) => `${c.description} (sources: ${c.sources.join("+")}, severity: ${c.severity})`), unsupportedReason: null }
      : { axis, status: "NOT_CONFLICTED", evidence: null, unsupportedReason: null };

  return [toAxis("MACRO_VS_TECHNICAL", macroVsTechnical), toAxis("HTF_VS_LTF", htfVsLtf), toAxis("LIQUIDITY_VS_STRUCTURE", liquidityVsStructure)];
}

/**
 * MEMORY_VS_EVIDENCE — real historical Decision Memory (8.1.3) matches
 * (a documented negative-outcome evaluation OR a qualified failure
 * pattern for this exact symbol) against the current cycle's own graded
 * assessment. This is the SAME `hasNegativeMemorySignal` question
 * `lib/ai/decisionQualification/qualify.ts` already answers to decide
 * `CONFLICTED` qualification (re-derived here for a read-only axis view,
 * never a second scoring path — `qualify.ts` remains the sole place this
 * signal gates a live decision).
 */
function memoryVsEvidenceAxis(trace: CognitiveTraceRecord, memory: DecisionMemoryResult | null): AxisConflict {
  if (memory === null) return unsupported("MEMORY_VS_EVIDENCE", "no Decision Memory query result supplied to this read");
  if (trace.analysis === null) return unsupported("MEMORY_VS_EVIDENCE", "no assessed cycle this read — trace.analysis is null (NO_ASSESSMENT cycle)");

  const negativeEvaluations = memory.matchedEvaluations.filter((e) => NEGATIVE_EVALUATION_CLASSES.includes(e.evaluationClass));
  const hasNegativeSignal = negativeEvaluations.length > 0 || memory.matchedPatterns.length > 0;
  const currentlyQualifying = trace.analysis.grade !== "NO_TRADE";

  if (!(hasNegativeSignal && currentlyQualifying)) return { axis: "MEMORY_VS_EVIDENCE", status: "NOT_CONFLICTED", evidence: null, unsupportedReason: null };

  const evidence = [
    ...negativeEvaluations.map((e) => `decision_evaluations: sourceSignalId=${e.sourceSignalId}, evaluationClass=${e.evaluationClass}`),
    ...memory.matchedPatterns.map((p) => `failure_pattern_candidates: evidenceTag=${p.evidenceTag}, occurrenceCount=${p.occurrenceCount}, confidence=${p.confidence}`),
  ];
  return { axis: "MEMORY_VS_EVIDENCE", status: "CONFLICTED", evidence, unsupportedReason: null };
}

/**
 * RISK_VS_OPPORTUNITY — the canonical Oracle assessment's own `grade`
 * (opportunity) against its own `riskStatus` (a valid, executable risk
 * plan). Both fields are already on `trace.analysis` — no new evidence
 * source, purely a read of two fields already persisted together.
 */
function riskVsOpportunityAxis(trace: CognitiveTraceRecord): AxisConflict {
  if (trace.analysis === null) return unsupported("RISK_VS_OPPORTUNITY", "no assessed cycle this read — trace.analysis is null (NO_ASSESSMENT cycle)");

  const opportunityGraded = trace.analysis.grade !== "NO_TRADE";
  const riskInvalid = trace.analysis.riskStatus !== "valid";

  if (!(opportunityGraded && riskInvalid)) return { axis: "RISK_VS_OPPORTUNITY", status: "NOT_CONFLICTED", evidence: null, unsupportedReason: null };

  return { axis: "RISK_VS_OPPORTUNITY", status: "CONFLICTED", evidence: [`assessment.grade=${trace.analysis.grade} (opportunity graded) while assessment.riskStatus=${trace.analysis.riskStatus} (not valid)`], unsupportedReason: null };
}

/**
 * Combines all five axes for one symbol's most recent Cognitive Trace row.
 * `trace === null` (no trace persisted yet for this symbol) makes every
 * axis `UNSUPPORTED` — never a fabricated `NOT_CONFLICTED` in place of
 * "we have never observed a cycle for this symbol".
 */
export function deriveAxisConflictReport(symbol: string, trace: CognitiveTraceRecord | null, memory: DecisionMemoryResult | null): AxisConflictReport {
  if (trace === null) {
    const reason = "no Cognitive Trace row exists yet for this symbol";
    return { symbol, axes: [unsupported("MACRO_VS_TECHNICAL", reason), unsupported("HTF_VS_LTF", reason), unsupported("LIQUIDITY_VS_STRUCTURE", reason), unsupported("MEMORY_VS_EVIDENCE", reason), unsupported("RISK_VS_OPPORTUNITY", reason)] };
  }

  return { symbol, axes: [...dataLevelAxes(trace), memoryVsEvidenceAxis(trace, memory), riskVsOpportunityAxis(trace)] };
}
