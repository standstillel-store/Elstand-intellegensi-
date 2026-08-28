// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Contradiction Classifier (Phase 7.6)
//
// Reclassifies contradiction-shaped evidence that already exists elsewhere
// in the pipeline — confluence.contradictions (Phase 2), the mtf.ts
// HTF_THESIS_THREATENED_* relationship (explicitly deferred to "Phase 7.6"
// in that file's own comments), and scenario.primary.opposingEvidence
// (Phase 7.5) — into one deduplicated, severity/genuineness-tagged report.
//
// This is a RECLASSIFICATION layer, not a new detector: every entry here
// traces back to a description already produced by an existing module.
// Severity reuses grading.ts's own contradictionMagnitude()/severe-moderate
// thresholds rather than inventing a competing calculation.
//
// PURE / READ-ONLY. No new fetch. Never written back into
// computeConfluence(), gradeConfluence(), confidence, dominantSide, or
// risk — `hasUnresolvedGenuineContradiction` is a descriptive readout for
// callers/UI only.
// ---------------------------------------------------------------------------

import { CLUSTERS, contradictionMagnitude } from "./grading";
import type { ConfluenceResult, ConfluenceFactor, ConfluenceSource } from "./confluenceTypes";
import type { OracleAssessment } from "./gradingTypes";
import type { MtfContext } from "./mtf";
import type { ScenarioContext } from "./scenario";

export type ContradictionSeverity = "LOW" | "MODERATE" | "HIGH";
export type ContradictionGenuineness = "GENUINE" | "DATA_GAP" | "SAME_CLUSTER";
export type ContradictionOrigin = "confluence" | "mtf_thesis_threatened" | "scenario_opposing_evidence";

export interface ClassifiedContradiction {
  /** Copied verbatim from the originating module — never reworded. */
  description: string;
  sources: ConfluenceSource[];
  severity: ContradictionSeverity;
  genuineness: ContradictionGenuineness;
  origin: ContradictionOrigin;
}

export interface ContradictionReport {
  contradictions: ClassifiedContradiction[];
  /** Descriptive readout only — never written back into assessment/grading. True when at least one GENUINE contradiction with MODERATE+ severity remains in the report. */
  hasUnresolvedGenuineContradiction: boolean;
}

/** Same severe(>8)/moderate(3-8) cutoffs grading.ts's own Contradiction Gate already uses — reused verbatim so this classifier's severity tiers line up with what actually gates the grade, rather than introducing a second scale. */
function severityFromMagnitude(magnitude: number): ContradictionSeverity {
  if (magnitude > 8) return "HIGH";
  if (magnitude > 3) return "MODERATE";
  return "LOW";
}

/** Same-cluster only describes the RELATIONSHIP between the disagreeing sources (they derive from the same underlying data family) — it does not by itself say anything about whether the disagreement is real. Genuineness and severity are computed independently, exactly per spec. */
function clustersOf(sources: ConfluenceSource[]): Set<string> {
  return new Set(sources.map((s) => CLUSTERS[s]));
}

function qualityOf(confluence: ConfluenceResult, sources: ConfluenceSource[]): ("real" | "proxy" | "unavailable")[] {
  return confluence.factors.filter((f) => sources.includes(f.source)).map((f) => f.quality);
}

function genuinenessFor(confluence: ConfluenceResult, sources: ConfluenceSource[]): ContradictionGenuineness {
  const qualities = qualityOf(confluence, sources);
  if (qualities.some((q) => q !== "real")) return "DATA_GAP";
  if (sources.length >= 2 && clustersOf(sources).size === 1) return "SAME_CLUSTER";
  return "GENUINE";
}

/** Stable identity for dedup: same underlying conflict must not appear twice just because it surfaces via two different origins (e.g. confluence.contradictions AND scenario.primary.opposingEvidence both mention the same market_structure-vs-footprint disagreement). Keyed on sorted sources + description text, NOT on origin — origin is allowed to differ across duplicates. */
function identityKey(sources: ConfluenceSource[], description: string): string {
  return `${[...sources].sort().join(",")}::${description}`;
}

function fromConfluence(confluence: ConfluenceResult): ClassifiedContradiction[] {
  return confluence.contradictions.map((c) => {
    const magnitude = contradictionMagnitude(confluence, c);
    return {
      description: c.description,
      sources: c.sources,
      severity: c.sources.length < 2 ? "LOW" : severityFromMagnitude(magnitude), // internal single-factor ambiguity: fixed LOW, mirrors grading.ts treating it separately from cross-source magnitude
      genuineness: genuinenessFor(confluence, c.sources),
      origin: "confluence",
    };
  });
}

/**
 * Resolves the mtf.ts TODO: HTF_THESIS_THREATENED_* is real, evidenced
 * (protective level actually broken + LTF actually confirms the reversal —
 * both already verified by classifyMtfRelationship() before it assigns
 * this relationship), but was deliberately left unclassified. It only
 * becomes a classified contradiction here when the CURRENTLY TRADED side
 * (assessment.side) is the one being threatened — a threat to the
 * opposite side isn't a contradiction against what's actually being
 * considered.
 */
function fromMtfThreat(assessment: OracleAssessment, mtf: MtfContext | null | undefined): ClassifiedContradiction[] {
  if (!mtf || !assessment.side) return [];
  const threatensLong = mtf.relationship === "HTF_THESIS_THREATENED_BULLISH" && assessment.side === "LONG";
  const threatensShort = mtf.relationship === "HTF_THESIS_THREATENED_BEARISH" && assessment.side === "SHORT";
  if (!threatensLong && !threatensShort) return [];

  return [
    {
      description: mtf.relationshipEvidence,
      sources: ["market_structure"], // the underlying evidence is HTF structure (protective level break) + LTF structure, both structure-cluster reads
      severity: "HIGH", // per audit: only reached when both a real broken protective level AND real LTF confirmation exist — the strongest evidenced case this classifier handles
      genuineness: "GENUINE",
      origin: "mtf_thesis_threatened",
    },
  ];
}

function fromScenario(scenarios: ScenarioContext | null | undefined, confluence: ConfluenceResult): ClassifiedContradiction[] {
  if (!scenarios?.primary) return [];
  return scenarios.primary.opposingEvidence
    .filter((ref) => ref.source === "confluence") // only confluence-sourced refs map cleanly onto ConfluenceSource[] for genuineness/cluster tagging; mtf/liquidityOrderFlow-sourced refs aren't duplicates of confluence.contradictions and are intentionally left to the caller to read directly off `scenarios` if needed (see known limitations)
    .map((ref) => {
      const matchingSources = confluence.contradictions.find((c) => c.description === ref.detail)?.sources ?? [];
      const magnitude = matchingSources.length >= 2 ? contradictionMagnitude(confluence, { description: ref.detail, sources: matchingSources }) : 0;
      return {
        description: ref.detail,
        sources: matchingSources,
        severity: matchingSources.length < 2 ? "LOW" : severityFromMagnitude(magnitude),
        genuineness: genuinenessFor(confluence, matchingSources),
        origin: "scenario_opposing_evidence" as const,
      };
    });
}

export function classifyContradictions(confluence: ConfluenceResult, assessment: OracleAssessment, mtf?: MtfContext | null, scenarios?: ScenarioContext | null): ContradictionReport {
  const collected = [...fromConfluence(confluence), ...fromMtfThreat(assessment, mtf), ...fromScenario(scenarios, confluence)];

  const seen = new Set<string>();
  const deduped: ClassifiedContradiction[] = [];
  for (const c of collected) {
    const key = identityKey(c.sources, c.description);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  const hasUnresolvedGenuineContradiction = deduped.some((c) => c.genuineness === "GENUINE" && c.severity !== "LOW");

  return { contradictions: deduped, hasUnresolvedGenuineContradiction };
}
