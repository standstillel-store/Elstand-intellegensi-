// ---------------------------------------------------------------------------
// Phase 6.6.4 — Suggestions config.
//
// AI Energy grant amount is a fixed constant, same "explicit operator
// decision, not a formula" rule as ELIGIBLE_BASE_REWARD_ELS in
// lib/rewards/eligibility.ts. Granted once, on approval, via lib/energy.ts
// refundEnergy() — never routed through the ELS distributor.
// ---------------------------------------------------------------------------

export const SUGGESTION_CATEGORIES = [
  "UI / UX",
  "Feature",
  "Performance",
  "Security Improvement",
  "Documentation",
  "ELSTAND Intelligence",
  "Other",
] as const;

export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

export const SUGGESTION_AI_ENERGY_REWARD = 10;

// Base ELS reward for ANY approved suggestion, before any admin bonus.
// totalElsReward = SUGGESTION_BASE_ELS_REWARD + adminBonusEls (adminBonusEls
// defaults to 0). Both constants are fixed, non-client-supplied values —
// the only admin-controlled input is the bonus, and even that is clamped
// server-side (see approveSuggestion in store.ts).
export const SUGGESTION_BASE_ELS_REWARD = 40;
