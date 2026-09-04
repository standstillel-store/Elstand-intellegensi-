// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — revision engine (architecture correction §8).
//
// Deliberately narrow scope: this file answers ONE objective question —
// "did the previously reported figure get revised, and by how much,
// numerically?" It does NOT decide whether a revision is economically
// good or bad news (that would require indicator-specific context, which
// belongs in interpret.ts's macroPressure/policyImplication derivation,
// not here). Keeping this split means revisionEngine.ts's output is
// reusable by any indicator without embedding a directional assumption —
// per Rule 4, no generic "positive revision = bullish" logic exists
// anywhere in this file or its caller.
// ---------------------------------------------------------------------------

import { parseNumericValue } from "./interpretMath";

export type RevisionImpact = "NONE" | "POSITIVE" | "NEGATIVE" | "MATERIAL" | "IMMATERIAL" | "UNAVAILABLE";

/**
 * `previous` = what was originally reported last period.
 * `revisedPrevious` = what that same prior-period figure now reads as,
 * per the current release (i.e. `EconomicRelease.revisedPrevious`).
 *
 * Decision order (each state is objectively derivable from the two raw
 * strings alone, per §8's "only use states that can be objectively
 * derived"):
 *   1. Either value missing/unparseable → UNAVAILABLE
 *   2. No numeric difference → NONE
 *   3. A numeric difference exists — first classify materiality
 *      (IMMATERIAL if the relative move is below a fixed threshold),
 *      otherwise classify direction (POSITIVE = revised up from what was
 *      originally reported, NEGATIVE = revised down). Materiality is
 *      checked first because a "positive" 0.01-point revision is not
 *      meaningfully different from no revision at all for macro
 *      purposes, and reporting it as POSITIVE would overstate its
 *      analytical weight.
 *
 * MATERIALITY_THRESHOLD is a documented, deliberately simple first cut —
 * 0.5% relative move — not indicator-tuned. Tightening this per-indicator
 * (e.g. NFP revisions of a few thousand vs. GDP revisions of a decimal
 * point) is a reasonable future refinement, not implemented here to keep
 * this pass's scope to what's objectively derivable today.
 */
const MATERIALITY_THRESHOLD_PCT = 0.5;

export function analyzeRevision(previous: string | null, revisedPrevious: string | null): RevisionImpact {
  const prevValue = parseNumericValue(previous);
  const revisedValue = parseNumericValue(revisedPrevious);
  if (prevValue === null || revisedValue === null) return "UNAVAILABLE";

  const delta = revisedValue - prevValue;
  if (delta === 0) return "NONE";

  const relativeMove = Math.abs(delta) / Math.max(Math.abs(prevValue), 1e-9);
  if (relativeMove * 100 < MATERIALITY_THRESHOLD_PCT) return "IMMATERIAL";

  return delta > 0 ? "POSITIVE" : "NEGATIVE";
}
