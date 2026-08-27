// ---------------------------------------------------------------------------
// ELVOID PRO — Normalized Evidence Adapter (Phase 7.1)
//
// Thin, read-only view over the EXISTING ConfluenceResult (lib/ai/oracle/
// confluence.ts). This file does not fetch data, does not compute weights,
// and does not decide LONG/SHORT for the pipeline — it only relabels the
// already-computed per-factor numbers into an explicit, self-describing
// shape so later Pro sub-phases (7.2+) have one normalized evidence type
// to build on instead of re-deriving `side` ad hoc the way patterns.ts
// currently does inline (smc.longWeight > smc.shortWeight ? "LONG" : ...).
//
// Guarantees (spec 7.1):
//   - No new confluence engine. Input is always a ConfluenceResult that
//     computeConfluence() already produced.
//   - No new market-data fetching.
//   - `direction` here is PER-FACTOR (which side that one factor leans),
//     never a new overall decision. The overall decision is still, and
//     remains, confluence.dominantSide / gradeConfluence()'s output.
//   - A factor with longWeight === shortWeight (including both 0, i.e.
//     "unavailable" or genuinely undecided) normalizes to "NEUTRAL" — it
//     is never forced to LONG or SHORT.
//   - quality (real/proxy/unavailable) is carried through unchanged.
//   - `cluster` reuses grading.ts's existing CLUSTERS map (now exported)
//     instead of redefining independent-evidence-cluster logic here.
//   - `timeframe` is intentionally optional and currently always the
//     single interval the OracleContext was built for (Phase 7.2 is what
//     introduces real HTF/MTF/LTF separation — this adapter does not
//     fabricate it ahead of time).
//   - `invalidation` is intentionally optional and left undefined: no
//     per-factor invalidation level exists in ConfluenceFactor yet, and
//     this adapter must not invent one.
// ---------------------------------------------------------------------------

import type { ConfluenceResult, ConfluenceFactor, ConfluenceSource } from "./confluenceTypes";
import type { OracleDataQuality } from "./types";
import { CLUSTERS } from "./grading";

export type EvidenceDirection = "LONG" | "SHORT" | "NEUTRAL";
export type EvidenceCluster = "structure" | "orderflow" | "context";

/** One factor's evidence, re-expressed explicitly. Derived only — nothing here is a new source of truth. */
export interface NormalizedEvidence {
  source: ConfluenceSource;
  cluster: EvidenceCluster;
  direction: EvidenceDirection;
  /** The weight of the winning side (0 when NEUTRAL/no lean). Same scale as ConfluenceFactor.longWeight/shortWeight — not renormalized. */
  strength: number;
  quality: OracleDataQuality;
  timeframe?: string;
  evidence: string;
  invalidation?: string;
  timestamp?: string;
}

function factorDirection(f: ConfluenceFactor): EvidenceDirection {
  if (f.longWeight === f.shortWeight) return "NEUTRAL"; // covers 0/0 (unavailable/no read) and genuine ties
  return f.longWeight > f.shortWeight ? "LONG" : "SHORT";
}

function factorStrength(f: ConfluenceFactor): number {
  return Math.max(f.longWeight, f.shortWeight);
}

/**
 * Normalize every factor in a ConfluenceResult. Pure mapping — same
 * factors in, same count out, no filtering, no re-scoring.
 */
export function normalizeEvidence(confluence: ConfluenceResult, timeframe?: string): NormalizedEvidence[] {
  return confluence.factors.map((f) => ({
    source: f.source,
    cluster: CLUSTERS[f.source],
    direction: factorDirection(f),
    strength: factorStrength(f),
    quality: f.quality,
    timeframe,
    evidence: f.evidence,
    invalidation: undefined,
    timestamp: confluence.timestamp,
  }));
}

/** Distinct clusters with a non-NEUTRAL read on the given side — read-only convenience, same grouping concept grading.ts already enforces internally, exposed here for Phase 7.2+ consumers that need it without importing grading internals. */
export function firingClustersFor(evidence: NormalizedEvidence[], side: "LONG" | "SHORT"): Set<EvidenceCluster> {
  const set = new Set<EvidenceCluster>();
  for (const e of evidence) if (e.direction === side) set.add(e.cluster);
  return set;
}

/** Factors already flagged by computeConfluence() as internally contradictory (unchanged pass-through — see ConfluenceResult.contradictions). Exposed here only so 7.1+ consumers can read it alongside NormalizedEvidence without reaching back into confluenceTypes directly. */
export function existingContradictions(confluence: ConfluenceResult) {
  return confluence.contradictions;
}
