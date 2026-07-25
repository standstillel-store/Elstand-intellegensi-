// ---------------------------------------------------------------------------
// lib/binance/riskManager.ts is server-only (it pulls in the signed REST
// client chain). Client Components that just need to *display* the 1% cap
// — badges, hints, form validation — import this instead of the whole
// server module. Keep this in sync with MAX_RISK_PERCENT in riskManager.ts;
// it's a fixed product rule, not something either file computes.
// ---------------------------------------------------------------------------
export const MAX_RISK_PERCENT_CLIENT = 1;
export const MIN_RISK_REWARD_CLIENT = 3;
export const PREFERRED_RISK_REWARD_CLIENT = 5;
export const MAX_RISK_REWARD_CLIENT = 10;
export const MIN_CONFLUENCES_CLIENT = 5;
