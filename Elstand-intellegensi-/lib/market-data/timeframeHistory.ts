/**
 * Centralized historical-range configuration for the chart engine.
 *
 * Maps each supported candle interval to the maximum amount of history the
 * chart is allowed to request. Shared by:
 *  - app/api/klines/route.ts (server: clamps/derives the `days` param)
 *  - components/ai-signal-pro/ChartAnalysisView.tsx (AI Signal chart)
 *  - components/elvoid-pro/ChartEngine/AdvancedChart.tsx (Elvoid Pro chart)
 *
 * No server-only imports here on purpose — this file must be safe to import
 * from both client ("use client") components and server route handlers.
 *
 * To change how much history a timeframe loads, edit this table only.
 */
export const TIMEFRAME_HISTORY_DAYS: Record<string, number> = {
  "1m": 30, // ~1 month
  "5m": 90, // ~3 months
  "15m": 90, // ~3 months
  "1h": 150, // ~5 months
  "4h": 150, // ~5 months
  "1d": 365, // ~12 months
};

const DEFAULT_HISTORY_DAYS = 90;

/** Max history (in days) allowed for a given interval. Falls back to a safe default for unknown intervals. */
export function getMaxHistoryDays(interval: string): number {
  return TIMEFRAME_HISTORY_DAYS[interval] ?? DEFAULT_HISTORY_DAYS;
}

/** Clamp a requested `days` value to the max allowed for that interval (also floors at 1). */
export function clampHistoryDays(interval: string, requestedDays: number | null | undefined): number {
  const max = getMaxHistoryDays(interval);
  if (requestedDays == null || Number.isNaN(requestedDays)) return max;
  return Math.min(max, Math.max(1, requestedDays));
}
