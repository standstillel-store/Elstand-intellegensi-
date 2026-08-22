/**
 * Centralized history-window configuration for the Liquidity Heatmap's
 * historical (volume-at-price) mode — mirrors the LIQUIDITY_HISTORY table
 * from the module spec: finer candle intervals only need a short, dense
 * window; coarser intervals need a longer one to show a meaningful picture.
 *
 * Used by LiquidityHeatmapEmbeddedChart to decide how many of the already-
 * fetched candles fall inside the liquidity window. Edit here only.
 *
 * No server-only imports on purpose — safe to import from client components,
 * same convention as lib/market-data/timeframeHistory.ts.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const LIQUIDITY_HISTORY_MS: Record<string, number> = {
  "1m": 1 * HOUR,
  "5m": 3 * HOUR,
  "15m": 6 * HOUR,
  "30m": 12 * HOUR,
  "1h": 24 * HOUR,
  "4h": 7 * DAY,
  "1d": 30 * DAY,
};

const DEFAULT_WINDOW_MS = 24 * HOUR;

/** How far back (ms) the liquidity heatmap should look for a given candle interval. */
export function getLiquidityHistoryMs(interval: string): number {
  return LIQUIDITY_HISTORY_MS[interval] ?? DEFAULT_WINDOW_MS;
}
