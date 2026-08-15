import type { Candle } from "./types";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export interface TpoRow {
  priceLow: number;
  priceHigh: number;
  letters: string; // e.g. "ABCC" — one char per period that touched this row
  inValueArea: boolean;
  isPoc: boolean;
}

export interface TpoSession {
  sessionStart: number; // ms epoch, UTC day start
  rows: TpoRow[]; // highest price first
  poc: number | null;
  tvah: number | null;
  tval: number | null;
  high: number;
  low: number;
}

/**
 * Builds classic letter-based TPO sessions from real candles. Each candle
 * in the source interval (e.g. 30m) is one "period" and gets the next
 * letter; the period's own high↔low range stamps that letter onto every
 * price row it touches. Sessions are split on UTC day boundaries, same as
 * standard Market Profile charting. POC/TVA use the same value-area-growth
 * rule as the Volume Profile engine (lib/elvoid/marketProfile.ts), just
 * weighted by period-touch count instead of volume.
 */
export function buildTpoSessions(candles: Candle[], rowsPerSession = 24): TpoSession[] {
  if (candles.length === 0) return [];

  const bySession = new Map<number, Candle[]>();
  for (const c of candles) {
    const dayStart = Math.floor(c.time / 86_400_000) * 86_400_000;
    const arr = bySession.get(dayStart) ?? [];
    arr.push(c);
    bySession.set(dayStart, arr);
  }

  const sessions: TpoSession[] = [];
  const sortedKeys = [...bySession.keys()].sort((a, b) => a - b);

  for (const sessionStart of sortedKeys) {
    const periods = bySession.get(sessionStart)!.sort((a, b) => a.time - b.time);
    const high = Math.max(...periods.map((p) => p.high));
    const low = Math.min(...periods.map((p) => p.low));
    const span = high - low || high * 0.001 || 1;
    const rowSize = span / rowsPerSession;

    const rowLetters: string[] = new Array(rowsPerSession).fill("");
    const rowTouchCount: number[] = new Array(rowsPerSession).fill(0);

    periods.forEach((period, i) => {
      const letter = LETTERS[i % LETTERS.length];
      const startRow = Math.max(0, Math.floor((period.low - low) / rowSize));
      const endRow = Math.min(rowsPerSession - 1, Math.floor((period.high - low) / rowSize));
      for (let r = startRow; r <= endRow; r++) {
        rowLetters[r] += letter;
        rowTouchCount[r] += 1;
      }
    });

    const total = rowTouchCount.reduce((s, v) => s + v, 0);
    if (total === 0) continue;

    let pocIdx = 0;
    for (let i = 1; i < rowTouchCount.length; i++) if (rowTouchCount[i] > rowTouchCount[pocIdx]) pocIdx = i;

    let covered = rowTouchCount[pocIdx];
    let lo = pocIdx;
    let hi = pocIdx;
    while (covered / total < 0.7 && (lo > 0 || hi < rowTouchCount.length - 1)) {
      const below = lo > 0 ? rowTouchCount[lo - 1] : -1;
      const above = hi < rowTouchCount.length - 1 ? rowTouchCount[hi + 1] : -1;
      if (above >= below) {
        hi++;
        covered += rowTouchCount[hi];
      } else {
        lo--;
        covered += rowTouchCount[lo];
      }
    }

    const rows: TpoRow[] = [];
    for (let i = rowsPerSession - 1; i >= 0; i--) {
      if (rowTouchCount[i] === 0) continue;
      rows.push({
        priceLow: low + i * rowSize,
        priceHigh: low + (i + 1) * rowSize,
        letters: rowLetters[i],
        inValueArea: i >= lo && i <= hi,
        isPoc: i === pocIdx,
      });
    }

    sessions.push({
      sessionStart,
      rows,
      poc: low + (pocIdx + 0.5) * rowSize,
      tvah: low + (hi + 1) * rowSize,
      tval: low + lo * rowSize,
      high,
      low,
    });
  }

  return sessions;
}
