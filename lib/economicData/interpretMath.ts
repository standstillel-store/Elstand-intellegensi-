// ---------------------------------------------------------------------------
// ELVOID Macro Intelligence — shared numeric parsing.
//
// Provider values arrive as free-form strings ("3.2%", "150K", "232K",
// "4.25-4.50%", "-25bps"). Centralizing parsing here (rather than each
// caller doing its own regex) is what interpret.ts's header/§4 of the
// original brief asked for: "numeric parsing belongs in one controlled
// parsing/interpretation layer."
//
// Returns `null` on anything unparseable — never a fabricated 0 or a
// best-guess. A range like "4.25-4.50" resolves to its midpoint,
// documented here as a deliberate simplification (used only for FOMC-style
// range figures, which this MVP pipeline treats as informational, not as
// a surprise/momentum input — see interpret.ts's FOMC_RATE_DECISION branch).
// ---------------------------------------------------------------------------

export function parseNumericValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Range, e.g. "4.25-4.50%" or "3.50 - 3.75" → midpoint.
  const rangeMatch = trimmed.match(/^(-?[\d.]+)\s*[-–]\s*(-?[\d.]+)/);
  if (rangeMatch) {
    const lo = Number(rangeMatch[1]);
    const hi = Number(rangeMatch[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) / 2;
  }

  // Plain number with optional %, K, M, B, bps suffix.
  const match = trimmed.match(/^(-?[\d,]+\.?\d*)\s*(%|k|m|b|bps)?/i);
  if (!match) return null;
  const numeric = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;

  const suffix = match[2]?.toLowerCase();
  switch (suffix) {
    case "k":
      return numeric * 1_000;
    case "m":
      return numeric * 1_000_000;
    case "b":
      return numeric * 1_000_000_000;
    case "bps":
      return numeric / 100; // basis points → percentage points
    default:
      return numeric;
  }
}
