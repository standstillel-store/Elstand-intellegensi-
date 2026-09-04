// ---------------------------------------------------------------------------
// components/dashboard/premium/macro — shared tone mapping.
//
// Only cluster/regime/risk/macroPressure/policyImplication states get a
// semantic up/down/amber color — these are the fields where interpret.ts /
// clusters.ts / regime.ts already did the work of resolving indicator-
// specific directionality into a genuinely meaningful verdict (Rule 4's
// "no universal higher=bullish/bearish" was resolved upstream, in the
// calculation layer, not skipped).
//
// Deliberately NOT color-coded here: raw `Surprise`/`Momentum`/
// `RevisionImpact` badges (ReleaseComparison.tsx) — those are numeric-
// direction-only by design (revisionEngine.ts's own header: "does NOT
// decide whether a revision is economically good or bad news"). Giving
// them a green/red color would silently reintroduce the universal-
// direction judgment Rule 4 forbids, one UI layer removed from where the
// rule is enforced. They render as plain, neutral badges instead.
// ---------------------------------------------------------------------------

export type Tone = "up" | "down" | "amber" | "signal" | "muted";

const inflationTone: Record<string, Tone> = { HOT: "down", COOLING: "up", MIXED: "amber", INSUFFICIENT_DATA: "muted" };
const laborTone: Record<string, Tone> = { STRONG: "up", WEAKENING: "down", MIXED: "amber", INSUFFICIENT_DATA: "muted" };
const growthTone: Record<string, Tone> = { EXPANDING: "up", SLOWING: "down", MIXED: "amber", INSUFFICIENT_DATA: "muted" };
const policyTone: Record<string, Tone> = { DOVISH: "up", HAWKISH: "amber", NEUTRAL: "muted", UNCERTAIN: "muted" };
const macroPressureTone: Record<string, Tone> = {
  INFLATIONARY: "down",
  DISINFLATIONARY: "up",
  LABOR_TIGHT: "up",
  LABOR_WEAKENING: "down",
  GROWTH_POSITIVE: "up",
  GROWTH_NEGATIVE: "down",
  NEUTRAL: "muted",
  MIXED: "amber",
  INSUFFICIENT_DATA: "muted",
};
const policyImplicationTone: Record<string, Tone> = {
  INCREASES_HAWKISH_PRESSURE: "amber",
  INCREASES_DOVISH_PRESSURE: "up",
  NEUTRAL: "muted",
  MIXED: "amber",
  INSUFFICIENT_DATA: "muted",
};
const economicRegimeTone: Record<string, Tone> = {
  INFLATIONARY_EXPANSION: "amber",
  DISINFLATIONARY_EXPANSION: "up",
  STAGFLATION_RISK: "down",
  DISINFLATIONARY_SLOWDOWN: "amber",
  GROWTH_SLOWDOWN: "amber",
  MIXED_TRANSITION: "muted",
  INSUFFICIENT_DATA: "muted",
};
const riskEnvironmentTone: Record<string, Tone> = {
  RISK_ON_SUPPORTIVE: "up",
  RISK_OFF_PRESSURE: "down",
  CAUTIOUS: "amber",
  MIXED: "amber",
  TRANSITIONING: "muted",
  INSUFFICIENT_DATA: "muted",
};

function lookup(map: Record<string, Tone>, key: string | undefined): Tone {
  if (!key) return "muted";
  return map[key] ?? "muted";
}

export const toneFor = {
  inflationCluster: (state?: string) => lookup(inflationTone, state),
  laborCluster: (state?: string) => lookup(laborTone, state),
  growthCluster: (state?: string) => lookup(growthTone, state),
  monetaryPolicyCluster: (state?: string) => lookup(policyTone, state),
  macroPressure: (state?: string) => lookup(macroPressureTone, state),
  policyImplication: (state?: string) => lookup(policyImplicationTone, state),
  economicRegime: (state?: string) => lookup(economicRegimeTone, state),
  riskEnvironment: (state?: string) => lookup(riskEnvironmentTone, state),
};

export const TONE_TEXT: Record<Tone, string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-amber",
  signal: "text-signal",
  muted: "text-ink-faint",
};

export const TONE_BORDER: Record<Tone, string> = {
  up: "border-up/30",
  down: "border-down/30",
  amber: "border-amber/30",
  signal: "border-signal/30",
  muted: "border-line",
};

export const TONE_BG: Record<Tone, string> = {
  up: "bg-up/10",
  down: "bg-down/10",
  amber: "bg-amber/10",
  signal: "bg-signal/10",
  muted: "bg-bg-raised",
};

/** Human-readable label for any SCREAMING_SNAKE_CASE enum value — "INSUFFICIENT_DATA" -> "Insufficient Data". */
export function humanize(value: string | undefined): string {
  if (!value) return "—";
  return value
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}
