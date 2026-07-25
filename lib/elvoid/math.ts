import type { AiSignal, TradeResult } from "./types";

// ---------------------------------------------------------------------------
// Pure risk/P&L math, deliberately split out from paperTrader.ts (which
// imports the server-only Supabase client) so client components — like the
// Open Trades table showing live unrealized P&L — can import this file
// without pulling @supabase/supabase-js into the browser bundle.
// ---------------------------------------------------------------------------

/** Unrealized P&L preview for a still-open position. Pure, no side effects. */
export function computeUnrealized(
  signal: Pick<AiSignal, "side" | "entry" | "sl">,
  currentPrice: number | undefined,
  riskPerTrade: number
): { unrealizedPercent: number; unrealizedRr: number } {
  if (currentPrice === undefined) return { unrealizedPercent: 0, unrealizedRr: 0 };
  const dir = signal.side === "LONG" ? 1 : -1;
  const riskDistance = Math.abs(signal.entry - signal.sl) || 1e-9;
  const rr = (dir * (currentPrice - signal.entry)) / riskDistance;
  return { unrealizedPercent: Number((rr * riskPerTrade).toFixed(2)), unrealizedRr: Number(rr.toFixed(2)) };
}

/** Realized result for closing `signal` at `exitPrice`, at a given risk-per-trade %. */
export function computeCloseResult(
  signal: Pick<AiSignal, "side" | "entry" | "sl">,
  exitPrice: number,
  riskPerTrade: number
): { rr: number; profitPercent: number; result: TradeResult } {
  const dir = signal.side === "LONG" ? 1 : -1;
  const riskDistance = Math.abs(signal.entry - signal.sl) || 1e-9;
  const pnlDistance = dir * (exitPrice - signal.entry);
  const rr = pnlDistance / riskDistance;
  const profitPercent = rr * riskPerTrade;
  const result: TradeResult = profitPercent > 0.05 ? "win" : profitPercent < -0.05 ? "loss" : "breakeven";
  return { rr, profitPercent, result };
}
