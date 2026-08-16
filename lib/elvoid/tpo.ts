import type { Candle } from "./types";

export const TPO_BLOCK_SIZES_MS: Record<string, number> = {
  "1m": 1 * 60_000,
  "5m": 5 * 60_000,
  "10m": 10 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1H": 60 * 60_000,
  "2H": 2 * 60 * 60_000,
  "4H": 4 * 60 * 60_000,
  "1D": 24 * 60 * 60_000,
};

export const TPO_PROFILE_PERIODS_MS: Record<string, number> = {
  "1D": 1 * 86_400_000,
  "5D": 5 * 86_400_000,
  "1W": 7 * 86_400_000,
  "1M": 30 * 86_400_000, // approximation — real calendar months vary; documented in report
};

/**
 * Root-cause fix (Phase 2, 2026-08): the chart's own candlestick timeframe
 * and the TPO bracket size (`blockSize` in TPOLetterChart) used to be fully
 * decoupled — the UI defaulted blockSize to a hardcoded "30m" regardless of
 * what timeframe the user picked on the main chart, so switching timeframes
 * changed the background candles but never the actual TPO letter/period
 * count. This maps each chart timeframe to its natural 1:1 bracket size:
 * 1m->1m, 5m->5m, 15m->15m, 1h->1H, 4h->4H, 1d->1D. TPOLetterChart re-applies
 * this default whenever `chartInterval` changes; a user's manual bracket-size
 * override (via the existing settings dropdown) is respected until they
 * change the chart timeframe again, at which point it re-syncs.
 */
export const TPO_DEFAULT_BLOCK_SIZE_BY_CHART_INTERVAL: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
};

export function defaultBlockSizeForChartInterval(chartInterval: string): string {
  return TPO_DEFAULT_BLOCK_SIZE_BY_CHART_INTERVAL[chartInterval.toLowerCase()] ?? "30m";
}

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export interface TpoRow {
  priceLow: number;
  priceHigh: number;
  letters: string; // e.g. "ABCC" — one char per block that touched this row, chronological
  touchCount: number;
  inValueArea: boolean;
  isPoc: boolean;
  isSinglePrint: boolean; // exactly 1 block touched this row, and it's not a session extreme
}

export interface TpoSession {
  sessionStart: number; // ms epoch, session boundary start
  rows: TpoRow[]; // highest price first
  poc: number | null;
  tvah: number | null;
  tval: number | null;
  high: number;
  low: number;
  blockCount: number;
  ibrHigh: number | null; // Initial Balance High — range of the first `ibrBlocks` blocks
  ibrLow: number | null;
  poorHigh: boolean; // session-high row touched by >1 block (no clean single-print rejection)
  poorLow: boolean;
}

/**
 * TradingView's documented "Auto" row size: over the given price range and
 * the symbol's real minimum tick, aim for ~80 rows, then round the
 * resulting tick-per-row to a clean increment that scales with magnitude
 * (5 / 50 / 500 / 5000 ...). This is the same formula published at
 * https://id.tradingview.com/support/solutions/43000713306/ — reused here
 * instead of a hardcoded row count so different symbols (and different
 * tick sizes) don't all get an arbitrary fixed row size.
 */
export function computeAutoRowSize(high: number, low: number, tickSize: number, targetRows = 80): number {
  const safeTick = tickSize > 0 ? tickSize : Math.pow(10, -2);
  const tickRange = (high - low) / safeTick;
  const rawTicksPerRow = Math.max(1, tickRange / targetRows);
  let increment = 5;
  if (rawTicksPerRow >= 100_000) increment = 500_000;
  else if (rawTicksPerRow >= 10_000) increment = 50_000;
  else if (rawTicksPerRow >= 1_000) increment = 5_000;
  else if (rawTicksPerRow >= 100) increment = 500;
  else if (rawTicksPerRow >= 1) increment = 5;
  const ticksPerRow = Math.max(increment, Math.round(rawTicksPerRow / increment) * increment);
  return ticksPerRow * safeTick;
}

/**
 * Aggregates real candles into fixed-length TPO blocks (e.g. 30m), which
 * may be smaller, equal to, or larger than the underlying candle interval
 * actually fetched. Each block's high/low is the max/min across every
 * source candle whose open time falls in that block window — this is the
 * real OHLC range touched during the block, not an estimate. If the
 * source candle interval is *larger* than the requested block size, each
 * source candle simply becomes its own block (documented limitation: we
 * can't know real intrabar traversal finer than the fetched candle).
 */
function aggregateToBlocks(candles: Candle[], blockMs: number): { time: number; high: number; low: number }[] {
  const byBlock = new Map<number, { time: number; high: number; low: number }>();
  for (const c of candles) {
    const blockStart = Math.floor(c.time / blockMs) * blockMs;
    const existing = byBlock.get(blockStart);
    if (existing) {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
    } else {
      byBlock.set(blockStart, { time: blockStart, high: c.high, low: c.low });
    }
  }
  return [...byBlock.values()].sort((a, b) => a.time - b.time);
}

/**
 * Builds classic letter-based TPO sessions from real candles, following the
 * methodology documented at
 * https://id.tradingview.com/support/solutions/43000713306/ :
 *  - each block gets the next sequential letter (A-Z, then a-z, repeating)
 *  - a letter is stamped on every price row the block's high↔low touches
 *  - POC = row with the most block-touches; Value Area grows outward from
 *    POC, on ties preferring the row nearer POC, then the higher row
 *  - IBR = the high/low range of the first `ibrBlocks` blocks
 *  - single print = a non-extreme row touched by exactly one block
 *  - poor high/low = a session-extreme row touched by more than one block
 *
 * `blockMs` and `sessionMs` are independent of the chart's own candle
 * interval — candles are re-bucketed into blocks first. `tickSize` should
 * come from the real exchange symbol filter (getSymbolFilters) so row size
 * isn't a guess for markets whose tick size differs from BTC's.
 */
export function buildTpoSessions(
  candles: Candle[],
  opts: {
    blockMs?: number;
    sessionMs?: number;
    tickSize?: number;
    valueAreaPct?: number;
    ibrBlocks?: number;
  } = {}
): TpoSession[] {
  if (candles.length === 0) return [];
  const blockMs = opts.blockMs ?? TPO_BLOCK_SIZES_MS["30m"];
  const sessionMs = opts.sessionMs ?? TPO_PROFILE_PERIODS_MS["1D"];
  const tickSize = opts.tickSize ?? 0.01;
  const valueAreaPct = opts.valueAreaPct ?? 0.7;
  const ibrBlocks = opts.ibrBlocks ?? 2;

  const blocks = aggregateToBlocks(candles, blockMs);
  if (blocks.length === 0) return [];

  const bySession = new Map<number, typeof blocks>();
  for (const b of blocks) {
    const sessionStart = Math.floor(b.time / sessionMs) * sessionMs;
    const arr = bySession.get(sessionStart) ?? [];
    arr.push(b);
    bySession.set(sessionStart, arr);
  }

  // Row size computed once, from the overall visible range — TradingView
  // recalculates this "when adding the indicator, resetting settings, or
  // changing symbol/timeframe", i.e. it's shared across profiles on the
  // chart rather than recomputed per session, so profiles stay comparable.
  const overallHigh = Math.max(...blocks.map((b) => b.high));
  const overallLow = Math.min(...blocks.map((b) => b.low));
  const rowSize = computeAutoRowSize(overallHigh, overallLow, tickSize) || (overallHigh - overallLow) / 24 || 1;

  const sessions: TpoSession[] = [];
  for (const sessionStart of [...bySession.keys()].sort((a, b) => a - b)) {
    const sessionBlocks = bySession.get(sessionStart)!.sort((a, b) => a.time - b.time);
    const high = Math.max(...sessionBlocks.map((b) => b.high));
    const low = Math.min(...sessionBlocks.map((b) => b.low));
    const rowCount = Math.max(1, Math.ceil((high - low) / rowSize));

    const rowLetters: string[] = new Array(rowCount).fill("");
    const rowTouchCount: number[] = new Array(rowCount).fill(0);

    sessionBlocks.forEach((block, i) => {
      const letter = LETTERS[i % LETTERS.length];
      const startRow = Math.max(0, Math.floor((block.low - low) / rowSize));
      const endRow = Math.min(rowCount - 1, Math.floor((block.high - low) / rowSize));
      for (let r = startRow; r <= endRow; r++) {
        rowLetters[r] += letter;
        rowTouchCount[r] += 1;
      }
    });

    const total = rowTouchCount.reduce((s, v) => s + v, 0);
    if (total === 0) continue;

    let pocIdx = 0;
    for (let i = 1; i < rowTouchCount.length; i++) if (rowTouchCount[i] > rowTouchCount[pocIdx]) pocIdx = i;

    // Value area growth — same documented rule: compare the row just below
    // `lo` and just above `hi`; take the larger count; on a tie take the
    // row nearer POC; if that's also tied, take the higher row.
    let covered = rowTouchCount[pocIdx];
    let lo = pocIdx;
    let hi = pocIdx;
    while (covered / total < valueAreaPct && (lo > 0 || hi < rowTouchCount.length - 1)) {
      const belowIdx = lo > 0 ? lo - 1 : null;
      const aboveIdx = hi < rowTouchCount.length - 1 ? hi + 1 : null;
      const belowCount = belowIdx !== null ? rowTouchCount[belowIdx] : -1;
      const aboveCount = aboveIdx !== null ? rowTouchCount[aboveIdx] : -1;

      let takeAbove: boolean;
      if (aboveIdx === null) takeAbove = false;
      else if (belowIdx === null) takeAbove = true;
      else if (aboveCount !== belowCount) takeAbove = aboveCount > belowCount;
      else {
        const distAbove = aboveIdx - pocIdx;
        const distBelow = pocIdx - belowIdx;
        takeAbove = distAbove !== distBelow ? distAbove < distBelow : true; // final tie → higher row
      }

      if (takeAbove && aboveIdx !== null) {
        hi = aboveIdx;
        covered += rowTouchCount[hi];
      } else if (belowIdx !== null) {
        lo = belowIdx;
        covered += rowTouchCount[lo];
      } else break;
    }

    // Non-empty extreme rows of this session (for single-print / poor high-low).
    let firstOccupied = 0;
    while (firstOccupied < rowCount && rowTouchCount[firstOccupied] === 0) firstOccupied++;
    let lastOccupied = rowCount - 1;
    while (lastOccupied >= 0 && rowTouchCount[lastOccupied] === 0) lastOccupied--;

    const rows: TpoRow[] = [];
    for (let i = rowCount - 1; i >= 0; i--) {
      if (rowTouchCount[i] === 0) continue;
      const isExtreme = i === firstOccupied || i === lastOccupied;
      rows.push({
        priceLow: low + i * rowSize,
        priceHigh: low + (i + 1) * rowSize,
        letters: rowLetters[i],
        touchCount: rowTouchCount[i],
        inValueArea: i >= lo && i <= hi,
        isPoc: i === pocIdx,
        isSinglePrint: !isExtreme && rowTouchCount[i] === 1,
      });
    }

    const ibrRange = sessionBlocks.slice(0, ibrBlocks);
    const ibrHigh = ibrRange.length > 0 ? Math.max(...ibrRange.map((b) => b.high)) : null;
    const ibrLow = ibrRange.length > 0 ? Math.min(...ibrRange.map((b) => b.low)) : null;

    sessions.push({
      sessionStart,
      rows,
      poc: low + (pocIdx + 0.5) * rowSize,
      tvah: low + (hi + 1) * rowSize,
      tval: low + lo * rowSize,
      high,
      low,
      blockCount: sessionBlocks.length,
      ibrHigh,
      ibrLow,
      poorHigh: lastOccupied >= 0 && rowTouchCount[lastOccupied] > 1,
      poorLow: firstOccupied < rowCount && rowTouchCount[firstOccupied] > 1,
    });
  }

  return sessions;
}
