// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Decision Arbitration (Phase 7.7)
//
// gradeConfluence() (grading.ts) remains the SOLE canonical authority for
// side/grade/confidence/riskStatus. This module NEVER recomputes or
// overrides any of them — it only reads the already-fixed OracleAssessment
// plus the context Phases 7.3B-7.6 already built (regime, mtf, scenarios,
// contradictions) and annotates how strongly that surrounding context
// corroborates the decision that was already made.
//
// PURE / READ-ONLY. No new fetch, no new scoring, no second decision
// engine. Disagreement in the surrounding context can only ever lower the
// `alignment` tier of the annotation below — it can never touch
// canonicalSide/canonicalGrade (both direct copies of `assessment`) or any
// execution behavior. Attached to the Oracle response as a sibling
// `arbitration` field, same additive pattern as every prior 7.x sub-phase.
// ---------------------------------------------------------------------------

import type { OracleAssessment } from "./gradingTypes";
import type { OracleGrade } from "./types";
import type { RegimeContext } from "./regime";
import type { MtfContext } from "./mtf";
import type { ScenarioContext, RegimeCompatibility } from "./scenario";
import type { MtfAlignment } from "./regime";
import type { ContradictionReport } from "./contradiction";

export type DecisionAlignment = "NOT_APPLICABLE" | "CONFLICTED" | "UNSUPPORTED_CONTEXT" | "SUPPORTED_WITH_CAUTION" | "STRONGLY_SUPPORTED";

export interface DecisionArbitration {
  /** Direct copy of assessment.side — never recomputed. */
  canonicalSide: "LONG" | "SHORT" | null;
  /** Direct copy of assessment.grade — never recomputed. */
  canonicalGrade: OracleGrade;
  alignment: DecisionAlignment;
  reasons: string[];
  hasUnresolvedGenuineContradiction: boolean;
  regimeCompatibility: RegimeCompatibility | "UNAVAILABLE";
  mtfCompatibility: MtfAlignment | "UNAVAILABLE";
  hasAlternativeScenario: boolean;
  /** True when an existing alternative scenario represents active opposing evidence against the canonical decision (per the reused-evidence rule below) rather than a mere within-structure contingency. Only meaningful when hasAlternativeScenario is true. */
  alternativeIsActiveOpposition: boolean;
  caveat: string | null;
}

/**
 * MTF relationships that describe ordinary, expected within-trend noise —
 * a pullback still inside the HTF structure the canonical decision is
 * already built on, not a competing directional call. Reused verbatim from
 * mtf.ts's own MtfRelationship enum (Phase 7.2), same list scenario.ts
 * already treats as "Pullback" (as opposed to "Reversal"/"Rejection")
 * wording. HTF_THESIS_THREATENED_* is deliberately excluded — that one is
 * exactly the case contradiction.ts (Phase 7.6) already classifies as a
 * real GENUINE/HIGH contradiction, so it's always active opposition.
 */
const CONTINGENCY_ONLY_MTF_RELATIONSHIPS: MtfContext["relationship"][] = ["PULLBACK_IN_UPTREND", "PULLBACK_IN_DOWNTREND"];

/**
 * Determines whether an existing alternative scenario is a mere
 * within-structure contingency (does not downgrade alignment) or active
 * opposing evidence (does). Reuses only fields scenario.ts already
 * computed — ScenarioEvidenceRef.source on each of the alternative's own
 * supportingEvidence entries (exactly the opposing signals scenario.ts
 * used to build it) plus mtf.relationship — no new opposing-signal
 * detector is introduced here.
 *
 * Rule: if EVERY signal that seeded the alternative came from `mtf` AND
 * the relationship is one of the ordinary pullback relationships above,
 * it's a contingency. Any confluence contradiction, liquidityOrderFlow
 * event/price-response signal, or an HTF-threatened relationship among the
 * seeding signals makes it active opposition.
 */
function isActiveOpposition(scenarios: ScenarioContext, mtf: MtfContext | null | undefined): boolean {
  const alt = scenarios.alternative;
  if (!alt || alt.supportingEvidence.length === 0) return false;

  const allSeedsAreMtf = alt.supportingEvidence.every((ref) => ref.source === "mtf");
  if (!allSeedsAreMtf) return true; // confluence / liquidityOrderFlow-sourced opposition is always active

  const relationship = mtf?.relationship;
  const isOrdinaryPullback = !!relationship && CONTINGENCY_ONLY_MTF_RELATIONSHIPS.includes(relationship);
  return !isOrdinaryPullback; // mtf-sourced but NOT an ordinary pullback (e.g. HTF_THESIS_THREATENED_*) -> active
}

export function arbitrateDecision(
  assessment: OracleAssessment,
  regime?: RegimeContext | null,
  mtf?: MtfContext | null,
  scenarios?: ScenarioContext | null,
  contradictions?: ContradictionReport | null
): DecisionArbitration {
  const canonicalSide = assessment.side;
  const canonicalGrade = assessment.grade;

  const regimeCompatibility: RegimeCompatibility | "UNAVAILABLE" = scenarios?.primary?.regimeCompatibility ?? "UNAVAILABLE";
  const mtfCompatibility: MtfAlignment | "UNAVAILABLE" = scenarios?.primary?.mtfCompatibility ?? "UNAVAILABLE";
  const hasUnresolvedGenuineContradiction = contradictions?.hasUnresolvedGenuineContradiction ?? false;
  const hasAlternativeScenario = !!scenarios?.alternative;
  const alternativeIsActiveOpposition = scenarios ? isActiveOpposition(scenarios, mtf) : false;

  const base: Omit<DecisionArbitration, "alignment" | "reasons" | "caveat"> = {
    canonicalSide,
    canonicalGrade,
    hasUnresolvedGenuineContradiction,
    regimeCompatibility,
    mtfCompatibility,
    hasAlternativeScenario,
    alternativeIsActiveOpposition,
  };

  // Precedence per spec, checked in this exact order:
  // NO_TRADE -> unresolved genuine contradiction -> missing/degraded context -> cautionary/opposing -> aligned.

  if (assessment.grade === "NO_TRADE" || !canonicalSide) {
    return {
      ...base,
      alignment: "NOT_APPLICABLE",
      reasons: ["assessment.grade is NO_TRADE — no canonical decision exists to arbitrate."],
      caveat: null,
    };
  }

  if (hasUnresolvedGenuineContradiction) {
    return {
      ...base,
      alignment: "CONFLICTED",
      reasons: ["contradictions.hasUnresolvedGenuineContradiction is true — at least one GENUINE, MODERATE+ severity contradiction remains unresolved."],
      caveat: "Ada contradiction genuine yang belum terselesaikan terhadap keputusan ini — lihat contradictions untuk detail. Keputusan (side/grade/confidence) TIDAK diubah; ini hanya catatan konteks.",
    };
  }

  if (!scenarios || !regime || !mtf || regimeCompatibility === "DEGRADED" || regimeCompatibility === "UNAVAILABLE" || mtfCompatibility === "UNAVAILABLE") {
    const reasons: string[] = [];
    if (!scenarios) reasons.push("scenarios context unavailable.");
    if (!regime) reasons.push("regime context unavailable.");
    if (!mtf) reasons.push("mtf context unavailable.");
    if (regimeCompatibility === "DEGRADED") reasons.push("regimeCompatibility is DEGRADED (regime unclear/volatile or unavailable).");
    if (regimeCompatibility === "UNAVAILABLE") reasons.push("regimeCompatibility could not be determined.");
    if (mtfCompatibility === "UNAVAILABLE") reasons.push("mtfCompatibility could not be determined.");
    return {
      ...base,
      alignment: "UNSUPPORTED_CONTEXT",
      reasons,
      caveat: "Konteks pendukung (regime/MTF/scenario) tidak cukup lengkap untuk menilai keselarasan — bukan berarti keputusan salah, hanya konteksnya belum bisa dikonfirmasi.",
    };
  }

  const cautionReasons: string[] = [];
  if (regimeCompatibility === "REQUIRES_STRONGER_EVIDENCE") cautionReasons.push("regimeCompatibility is REQUIRES_STRONGER_EVIDENCE — current regime doesn't clearly favor this direction.");
  if (mtfCompatibility === "MIXED") cautionReasons.push("mtfCompatibility is MIXED — HTF/LTF don't fully agree with this direction.");
  if (hasAlternativeScenario && alternativeIsActiveOpposition) cautionReasons.push("An alternative scenario exists backed by active opposing evidence (not merely a within-structure pullback contingency).");

  if (cautionReasons.length > 0) {
    return {
      ...base,
      alignment: "SUPPORTED_WITH_CAUTION",
      reasons: cautionReasons,
      caveat: "Konteks sekitar sebagian mendukung namun ada catatan kehati-hatian — lihat reasons. Keputusan (side/grade/confidence) TIDAK diubah.",
    };
  }

  const reasons = ["regimeCompatibility: COMPATIBLE", "mtfCompatibility: ALIGNED", "no unresolved genuine contradiction"];
  if (hasAlternativeScenario) reasons.push("An alternative scenario exists but is a within-structure contingency only, not active opposition — does not lower alignment.");

  return {
    ...base,
    alignment: "STRONGLY_SUPPORTED",
    reasons,
    caveat: null,
  };
}
