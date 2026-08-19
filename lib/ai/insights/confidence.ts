// ---------------------------------------------------------------------------
// Deterministic confidence for one detected pattern. Same inputs -> same
// output, always (spec §15). Never Math.random(), never a bare constant.
//
// Formula, and why:
//  - evidenceCount: each additional confirming piece of evidence adds
//    diminishing returns (sqrt-like via capped linear steps) — 1 piece of
//    evidence shouldn't score anywhere near what 4 independent pieces do.
//  - sourceQuality: real sources count fully; proxy sources are
//    structurally discounted (spec §9 — proxy must never be treated as
//    equal to real).
//  - strength: the pattern's own measured magnitude (e.g. footprint delta
//    ratio, S/R distance) on a 0-1 scale, supplied by the caller — this is
//    what actually varies confidence within the "same pattern kind" case,
//    not a flat per-kind constant.
//  - contradiction: any conflicting evidence caps confidence down,
//    reflecting genuine uncertainty rather than hiding it.
// ---------------------------------------------------------------------------

import type { OracleDataQuality } from "../oracle/types";

export interface ConfidenceInput {
  evidenceCount: number;
  sourceQualities: OracleDataQuality[]; // one per confirming source
  strength: number; // 0-1, the pattern's own measured magnitude
  hasContradiction: boolean;
}

export function computeConfidence(input: ConfidenceInput): number {
  const realCount = input.sourceQualities.filter((q) => q === "real").length;
  const proxyCount = input.sourceQualities.filter((q) => q === "proxy").length;

  // Evidence breadth: capped diminishing-returns steps, real sources worth
  // full weight, proxy sources worth half (same discount rate used
  // throughout the Oracle engine's own PROXY_WEIGHT_CAP for consistency).
  const evidenceScore = Math.min(40, realCount * 10 + proxyCount * 5 + Math.max(0, input.evidenceCount - input.sourceQualities.length) * 3);

  const strengthScore = Math.max(0, Math.min(1, input.strength)) * 35;

  const qualityBonus = proxyCount === 0 && realCount > 0 ? 10 : proxyCount > 0 && realCount === 0 ? 0 : 5;

  const contradictionPenalty = input.hasContradiction ? 20 : 0;

  const raw = evidenceScore + strengthScore + qualityBonus - contradictionPenalty;
  return Math.max(5, Math.min(95, Math.round(raw)));
}
