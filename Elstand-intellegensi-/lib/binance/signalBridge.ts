import { generateSignal, type GeneratedSignal } from "../elvoid/engine";
import { buildScanContext, type ScanContext } from "../elvoid/service";
import { getKlines, getTickerPrice } from "./marketData";
import { computeRR } from "./riskManager";
import { getBinanceConfig, type BinanceConfig } from "./config";
import type { Kline } from "./types";

// ---------------------------------------------------------------------------
// The bridge between ElVoid AI's existing, already-thorough scan/signal
// engine (lib/elvoid/engine.ts — 9 directional confluence categories plus
// 7 extended-reasoning ones: SMC order blocks, FVG, liquidity, funding,
// open interest, SMT divergence, MACD) and the live Binance Testnet/Live
// account this integration trades on. Candles and current price come from
// the *same venue orders execute on* (not the dashboard's generic public
// feed) so a signal is never generated against different data than the
// account can actually see. Two hard gates get applied on top of whatever
// the engine itself produces — "Never force entry. Minimum 5 confluences.
// Otherwise NO TRADE." and "Minimum RR 1:3... Reject if RR<1:3."
// ---------------------------------------------------------------------------

export interface GatedSignal {
  signal: GeneratedSignal;
  confluenceCount: number;
  rrTp1: number;
  rrTp2: number;
  passed: boolean;
  rejectReason?: string;
}

const MAX_TP_R_MULTIPLE = 10; // "Maximum RR 1:10" — a sanity clamp on how far a TP is allowed to sit, not a floor

function countConfluences(signal: GeneratedSignal): number {
  const winningBias = signal.side === "LONG" ? "bullish" : "bearish";
  return signal.scans.filter((s) => s.bias === winningBias && s.weight > 0).length;
}

function clampTargetToMaxR(entry: number, sl: number, target: number, side: "LONG" | "SHORT"): number {
  const riskDistance = Math.abs(entry - sl);
  const dir = side === "LONG" ? 1 : -1;
  const distance = dir * (target - entry);
  if (distance <= riskDistance * MAX_TP_R_MULTIPLE) return target;
  return entry + dir * riskDistance * MAX_TP_R_MULTIPLE;
}

/** Fetches candles for `symbol` from the account's own active venue (Testnet or Live, Spot or Futures per config). */
export async function fetchTradingCandles(symbol: string, timeframe: string, limit = 300, cfg: BinanceConfig = getBinanceConfig()): Promise<Kline[]> {
  return getKlines(symbol, timeframe, limit, cfg);
}

/**
 * Runs the full ElVoid AI signal engine against live account-venue data for
 * one symbol, then gates the result against min confluences + min RR.
 * `sharedCtx` (whales/news/calendar/funding/calibration) is built once per
 * tick by the caller — see autoTrader.ts — so scanning several symbols
 * doesn't refetch shared context per symbol.
 */
export async function buildGatedSignal(
  binanceSymbol: string,
  timeframe: string,
  opts: { minConfluences: number; minRiskReward: number; riskPercent: number },
  sharedCtx?: ScanContext,
  cfg: BinanceConfig = getBinanceConfig()
): Promise<GatedSignal | null> {
  const ctx = sharedCtx ?? (await buildScanContext());
  const baseSymbol = binanceSymbol.toUpperCase().replace(/USDT$|BUSD$|USDC$/i, "");

  const [klines, ticker] = await Promise.all([fetchTradingCandles(binanceSymbol, timeframe, 300, cfg), getTickerPrice(binanceSymbol, cfg)]);
  if (klines.length < 30) return null;

  const candles = klines.map((k) => ({ time: k.openTime, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume }));
  const market = ctx.markets.find((m) => m.symbol.toUpperCase() === baseSymbol);
  const btc = baseSymbol === "BTC" ? undefined : ctx.markets.find((m) => m.symbol.toUpperCase() === "BTC");
  const funding = ctx.funding.find((f) => f.symbol.toUpperCase() === `${baseSymbol}USDT`);

  const signal = generateSignal({
    symbol: baseSymbol,
    name: market?.name,
    currentPrice: ticker.price,
    candles,
    whales: ctx.whales,
    news: ctx.news,
    calendar: ctx.calendar,
    funding,
    riskPercent: opts.riskPercent,
    calibration: ctx.calibration,
    timeframe,
    change24h: market?.price_change_percentage_24h_in_currency,
    btcChange24h: btc?.price_change_percentage_24h_in_currency,
    btcChange7d: btc?.price_change_percentage_7d_in_currency,
    stableChange24hUsd: ctx.stableChange24hUsd,
  });
  if (!signal) return null;

  const confluenceCount = countConfluences(signal);
  const clampedTp2 = clampTargetToMaxR(signal.entry, signal.sl, signal.tp2, signal.side);
  const rrTp1 = computeRR(signal.entry, signal.sl, signal.tp1);
  const rrTp2 = computeRR(signal.entry, signal.sl, clampedTp2);

  if (confluenceCount < opts.minConfluences) {
    return {
      signal,
      confluenceCount,
      rrTp1,
      rrTp2,
      passed: false,
      rejectReason: `Hanya ${confluenceCount} dari minimum ${opts.minConfluences} confluence — NO TRADE (aturan: jangan pernah memaksakan entry).`,
    };
  }
  if (rrTp2 < opts.minRiskReward) {
    return {
      signal,
      confluenceCount,
      rrTp1,
      rrTp2,
      passed: false,
      rejectReason: `Risk:Reward ${rrTp2.toFixed(2)} di bawah minimum 1:${opts.minRiskReward} — NO TRADE.`,
    };
  }

  return { signal: { ...signal, tp2: clampedTp2 }, confluenceCount, rrTp1, rrTp2, passed: true };
}
