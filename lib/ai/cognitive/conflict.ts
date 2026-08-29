// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Cognitive Conflict Resolution (Phase 8.0.4)
//
// ARCHITECTURE / AUTHORITY:
//   - Meta-resolution layer, NOT a decision engine. Answers "how coherent
//     is the intelligence system's own interpretation right now" — never
//     "which market direction is correct." No side/direction/BUY/SELL/
//     execute/reject field exists anywhere in this file's output.
//   - THIN reuse over already-computed Phase 7 aggregates:
//       contradictions.hasUnresolvedGenuineContradiction (7.6)
//       arbitration.alignment / arbitration.alternativeIsActiveOpposition (7.7)
//     Never rescans contradictions.contradictions[] to re-determine whether
//     conflict exists, never re-derives arbitration's own alignment logic,
//     never recomputes risk, never regenerates hypotheses, never re-scans
//     raw evidence, never introduces a second scoring/confidence system.
//   - CRITICAL GUARDRAIL: riskIntelligence.overall/.factors are NEVER read
//     here. Only riskIntelligence.contextQuality is used, and only for the
//     INSUFFICIENT_CONTEXT tier. High risk (volatility/invalidation
//     distance/liquidity danger) is a different question from conflict
//     (internal disagreement) and must never be conflated — see the
//     Phase 8.0.4 audit for the full reasoning.
//   - CognitiveWorkingMemory and CognitiveHypothesisSet are accepted as
//     inputs for signature completeness / future explainability use, but
//     carry NO independent authority: neither is read anywhere in the
//     resolution logic below. Hypotheses are never counted or voted on.
//   - Deterministic, first-match-wins precedence — no weighted scoring, no
//     voting, no confidence averaging. Same inputs -> byte-identical
//     output. No Date.now()/Math.random()/fetch()/Supabase/module-level
//     state/singleton anywhere in this file.
//   - Immutable: every input (ScenarioContext, ContradictionReport,
//     DecisionArbitration, RiskIntelligence, CognitiveObservation,
//     CognitiveWorkingMemory, CognitiveHypothesisSet) is only ever read,
//     never assigned into. Output is a freshly constructed object/array
//     every call — never a live reference into any input.
// ---------------------------------------------------------------------------

import type { ScenarioContext } from "@/lib/ai/oracle/scenario";
import type { ContradictionReport } from "@/lib/ai/oracle/contradiction";
import type { DecisionArbitration } from "@/lib/ai/oracle/arbitration";
import type { RiskIntelligence } from "@/lib/ai/oracle/riskIntelligence";
import type { CognitiveObservation } from "./contracts";
import type { CognitiveHypothesisSet } from "./hypothesis";
import type { CognitiveWorkingMemory } from "./memory";

export type CognitiveCoherenceState = "INSUFFICIENT_CONTEXT" | "CONFLICTED" | "CAUTIOUS" | "CONSISTENT";

export type CognitiveConflictFactorSource = "contradiction" | "arbitration" | "context_quality";

export interface CognitiveConflictFactor {
  readonly source: CognitiveConflictFactorSource;
  readonly detail: string;
}

export interface CognitiveConflictState {
  readonly state: CognitiveCoherenceState;
  readonly reasons: readonly string[];
  readonly contributingFactors: readonly CognitiveConflictFactor[];
}

export interface CognitiveConflictInputs {
  readonly scenarios: ScenarioContext | null;
  readonly contradictions: ContradictionReport | null;
  readonly arbitration: DecisionArbitration | null;
  readonly riskIntelligence: RiskIntelligence | null;
  readonly observation: CognitiveObservation | null;
  /** Accepted for architecture completeness only — never read below. Hypotheses must never become a voting system; see the Phase 8.0.4 audit. */
  readonly hypotheses: CognitiveHypothesisSet | null;
  /** Accepted for architecture completeness only — never read below. Working Memory is a transport container, not an independent authority. */
  readonly workingMemory: CognitiveWorkingMemory | null;
}

/**
 * Deterministic, pure, first-match-wins resolution over already-computed
 * Phase 7 aggregates. Six rules, evaluated in the exact order below (the
 * approved Phase 8.0.4 architecture) — no reordering, no weighted scoring.
 *
 * Same inputs -> byte-identical output. Zero I/O, zero timestamps, zero
 * randomness, zero mutation of any input.
 */
export function resolveCognitiveConflict(inputs: CognitiveConflictInputs): CognitiveConflictState {
  const { scenarios, contradictions, arbitration, riskIntelligence, observation } = inputs;

  // ---------------------------------------------------------------------
  // RULE 1 — hard context blocker. Any of the three core Phase 7 modules
  // missing entirely means there isn't enough to judge coherence at all.
  // ---------------------------------------------------------------------
  if (scenarios === null || contradictions === null || arbitration === null) {
    const missing: string[] = [];
    if (scenarios === null) missing.push("scenarios");
    if (contradictions === null) missing.push("contradictions");
    if (arbitration === null) missing.push("arbitration");
    return {
      state: "INSUFFICIENT_CONTEXT",
      reasons: [`Konteks inti tidak lengkap — modul berikut tidak tersedia: ${missing.join(", ")}.`],
      contributingFactors: missing.map((m) => ({ source: "context_quality", detail: `${m} = null` })),
    };
  }

  // From here on, scenarios/contradictions/arbitration are non-null
  // (TypeScript-narrowed by the early return above — no cast needed).

  // ---------------------------------------------------------------------
  // RULE 2 — insufficient quality. riskIntelligence/observation may be
  // null (handled defensively via optional chaining, never throws) or
  // present-but-low-quality. Only riskIntelligence.contextQuality is read
  // here — never .overall/.factors (the risk != conflict guardrail).
  // ---------------------------------------------------------------------
  const qualityReasons: string[] = [];
  const qualityFactors: CognitiveConflictFactor[] = [];
  if (scenarios.contextQuality === "insufficient") {
    qualityReasons.push("Konteks skenario tidak cukup untuk dievaluasi (scenarios.contextQuality = insufficient).");
    qualityFactors.push({ source: "context_quality", detail: "scenarios.contextQuality = insufficient" });
  }
  if (riskIntelligence?.contextQuality === "insufficient") {
    qualityReasons.push("Konteks risk intelligence tidak cukup (riskIntelligence.contextQuality = insufficient).");
    qualityFactors.push({ source: "context_quality", detail: "riskIntelligence.contextQuality = insufficient" });
  }
  if (observation?.quality === "unavailable") {
    qualityReasons.push("Cognitive observation tidak tersedia (observation.quality = unavailable).");
    qualityFactors.push({ source: "context_quality", detail: "observation.quality = unavailable" });
  }
  if (qualityReasons.length > 0) {
    return { state: "INSUFFICIENT_CONTEXT", reasons: qualityReasons, contributingFactors: qualityFactors };
  }

  // ---------------------------------------------------------------------
  // RULE 3 — genuine system conflict. Deliberately a conjunction, never a
  // single weak signal: contradictions.hasUnresolvedGenuineContradiction
  // reused directly (never rescanning contradictions.contradictions[]),
  // AND at least one of arbitration.alignment === "CONFLICTED" /
  // arbitration.alternativeIsActiveOpposition === true, both reused
  // directly from arbitration.ts, never re-derived.
  // ---------------------------------------------------------------------
  if (contradictions.hasUnresolvedGenuineContradiction && (arbitration.alignment === "CONFLICTED" || arbitration.alternativeIsActiveOpposition)) {
    const reasons: string[] = ["Kontradiksi genuine yang belum terselesaikan terdeteksi (contradictions.hasUnresolvedGenuineContradiction = true)."];
    const factors: CognitiveConflictFactor[] = [{ source: "contradiction", detail: "contradictions.hasUnresolvedGenuineContradiction = true" }];
    if (arbitration.alignment === "CONFLICTED") {
      reasons.push("Arbitration melaporkan alignment CONFLICTED.");
      factors.push({ source: "arbitration", detail: "arbitration.alignment = CONFLICTED" });
    }
    if (arbitration.alternativeIsActiveOpposition) {
      reasons.push("Skenario alternatif merupakan oposisi aktif terhadap keputusan kanonik, bukan sekadar contingency struktural (arbitration.alternativeIsActiveOpposition = true).");
      factors.push({ source: "arbitration", detail: "arbitration.alternativeIsActiveOpposition = true" });
    }
    return { state: "CONFLICTED", reasons, contributingFactors: factors };
  }

  // ---------------------------------------------------------------------
  // RULE 4 — caution. SUPPORTED_WITH_CAUTION / UNSUPPORTED_CONTEXT per the
  // approved architecture. CONFLICTED alignment is ALSO handled here as a
  // defensive fallback bucket for the one case Rule 3's conjunction does
  // not confirm as a genuine system conflict (arbitration itself reads
  // CONFLICTED but contradictions.hasUnresolvedGenuineContradiction is
  // false and alternativeIsActiveOpposition is false) — the approved
  // four-state model has no fifth state for this narrow edge case, so it
  // falls into CAUTIOUS rather than being silently dropped.
  // ---------------------------------------------------------------------
  if (arbitration.alignment === "SUPPORTED_WITH_CAUTION" || arbitration.alignment === "UNSUPPORTED_CONTEXT" || arbitration.alignment === "CONFLICTED") {
    return {
      state: "CAUTIOUS",
      reasons: [`Arbitration belum sepenuhnya bersih (arbitration.alignment = ${arbitration.alignment}), namun konflik sistemik genuine belum terkonfirmasi oleh kombinasi contradiction + arbitration.`],
      contributingFactors: [{ source: "arbitration", detail: `arbitration.alignment = ${arbitration.alignment}` }],
    };
  }

  // ---------------------------------------------------------------------
  // RULE 5 — consistent. Requires the full clean combination: strongly
  // supported, no genuine unresolved contradiction, no active opposition.
  // ---------------------------------------------------------------------
  if (arbitration.alignment === "STRONGLY_SUPPORTED" && !contradictions.hasUnresolvedGenuineContradiction && !arbitration.alternativeIsActiveOpposition) {
    return {
      state: "CONSISTENT",
      reasons: ["Arbitration STRONGLY_SUPPORTED tanpa kontradiksi genuine yang belum terselesaikan dan tanpa oposisi aktif dari skenario alternatif."],
      contributingFactors: [
        { source: "arbitration", detail: "arbitration.alignment = STRONGLY_SUPPORTED" },
        { source: "contradiction", detail: "contradictions.hasUnresolvedGenuineContradiction = false" },
      ],
    };
  }

  // ---------------------------------------------------------------------
  // RULE 6 — NOT_APPLICABLE. Explicit Phase 8.0.4 architectural decision:
  // no canonical decision exists to evaluate coherence around, so this is
  // treated as insufficient context, never reinterpreted as CAUTIOUS.
  // ---------------------------------------------------------------------
  if (arbitration.alignment === "NOT_APPLICABLE") {
    return {
      state: "INSUFFICIENT_CONTEXT",
      reasons: ["Tidak ada keputusan kanonik untuk dievaluasi koherensinya (arbitration.alignment = NOT_APPLICABLE)."],
      contributingFactors: [{ source: "arbitration", detail: "arbitration.alignment = NOT_APPLICABLE" }],
    };
  }

  // Structurally unreachable: DecisionAlignment is a closed 5-value union
  // (CONFLICTED / UNSUPPORTED_CONTEXT / SUPPORTED_WITH_CAUTION /
  // STRONGLY_SUPPORTED / NOT_APPLICABLE) and every value is covered by
  // rules 3-6 above. Kept as an explicit, typed fallback rather than a
  // non-null assertion or `as never`.
  return {
    state: "INSUFFICIENT_CONTEXT",
    reasons: ["Kondisi arbitration tidak dikenali oleh model resolusi Phase 8.0.4."],
    contributingFactors: [{ source: "arbitration", detail: `arbitration.alignment = ${arbitration.alignment}` }],
  };
}
