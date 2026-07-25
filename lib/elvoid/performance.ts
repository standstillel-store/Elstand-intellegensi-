import { getSupabase } from "../supabase";
import type { JournalWithSignal } from "./types";

// ---------------------------------------------------------------------------
// Every read here is a re-aggregation of ai_journal (joined with the
// originating ai_signals row for coin/side/strategy) — no separate stats
// are invented. This is also where the strategy calibration feed for
// lib/elvoid/engine.ts comes from, closing the loop the brief asked for:
// ElVoid AI adjusts future Confidence based on how a strategy has actually
// performed in paper trading so far.
// ---------------------------------------------------------------------------

export interface StrategyPerformance {
  strategy: string;
  trades: number;
  winRate: number;
  profitFactor: number;
  totalProfit: number;
}

export interface CoinPerformance {
  coin: string;
  trades: number;
  winRate: number;
  totalProfit: number;
}

export interface SetupWinRate {
  setup: string; // e.g. "LONG · Liquidity Sweep Reversal"
  trades: number;
  winRate: number;
}

export interface EquityPoint {
  date: string;
  equityPercent: number;
}

export interface MonthlyPoint {
  month: string; // "2026-07"
  profitPercent: number;
  trades: number;
}

export interface PerformanceReport {
  configured: boolean;
  strategies: StrategyPerformance[];
  coins: CoinPerformance[];
  setups: SetupWinRate[];
  bestStrategy?: StrategyPerformance;
  worstStrategy?: StrategyPerformance;
  bestCoin?: CoinPerformance;
  worstCoin?: CoinPerformance;
  bestSetup?: SetupWinRate;
  equityCurve: EquityPoint[];
  monthly: MonthlyPoint[];
  /** Average of duration_minutes across entries that have it recorded. Null when no entry has a duration yet. */
  avgHoldMinutes: number | null;
  /** Average Confidence (from the originating signal) across closed trades. Null when signals weren't joined (pre-redesign data). */
  avgConfidence: number | null;
}

export async function getJournalEntries(limit = 200): Promise<JournalWithSignal[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("ai_journal")
    .select("*, signal:ai_signals(coin,side,strategy,confidence,entry,reason,timeframe,scans,extra_reasoning)")
    .order("closed_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ElVoid AI] getJournalEntries error:", error.message);
    return [];
  }
  return (data ?? []) as unknown as JournalWithSignal[];
}

function winRateOf(entries: { result: string }[]): number {
  if (!entries.length) return 0;
  return Number(((entries.filter((e) => e.result === "win").length / entries.length) * 100).toFixed(1));
}

function profitFactorOf(entries: { profit_percent: number }[]): number {
  const grossWin = entries.filter((e) => e.profit_percent > 0).reduce((s, e) => s + e.profit_percent, 0);
  const grossLoss = Math.abs(entries.filter((e) => e.profit_percent < 0).reduce((s, e) => s + e.profit_percent, 0));
  return Number((grossLoss > 0 ? grossWin / grossLoss : grossWin).toFixed(2));
}

export async function getPerformanceReport(): Promise<PerformanceReport> {
  const sb = getSupabase();
  const entries = await getJournalEntries(500);
  // We need ascending order for the equity curve / monthly buckets below.
  const chronological = [...entries].sort((a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime());

  if (!sb || !entries.length) {
    return {
      configured: Boolean(sb),
      strategies: [],
      coins: [],
      setups: [],
      equityCurve: [],
      monthly: [],
      avgHoldMinutes: null,
      avgConfidence: null,
    };
  }

  const byStrategy = new Map<string, JournalWithSignal[]>();
  const byCoin = new Map<string, JournalWithSignal[]>();
  const bySetup = new Map<string, JournalWithSignal[]>();

  for (const e of chronological) {
    const strategy = e.signal?.strategy ?? "Unknown";
    const coin = e.signal?.coin ?? "Unknown";
    const setup = e.signal ? `${e.signal.side} · ${e.signal.strategy}` : "Unknown";
    byStrategy.set(strategy, [...(byStrategy.get(strategy) ?? []), e]);
    byCoin.set(coin, [...(byCoin.get(coin) ?? []), e]);
    bySetup.set(setup, [...(bySetup.get(setup) ?? []), e]);
  }

  const strategies: StrategyPerformance[] = [...byStrategy.entries()].map(([strategy, es]) => ({
    strategy,
    trades: es.length,
    winRate: winRateOf(es),
    profitFactor: profitFactorOf(es),
    totalProfit: Number(es.reduce((s, e) => s + e.profit_percent, 0).toFixed(2)),
  }));

  const coins: CoinPerformance[] = [...byCoin.entries()].map(([coin, es]) => ({
    coin,
    trades: es.length,
    winRate: winRateOf(es),
    totalProfit: Number(es.reduce((s, e) => s + e.profit_percent, 0).toFixed(2)),
  }));

  const setups: SetupWinRate[] = [...bySetup.entries()]
    .map(([setup, es]) => ({ setup, trades: es.length, winRate: winRateOf(es) }))
    .filter((s) => s.trades >= 2)
    .sort((a, b) => b.winRate - a.winRate);

  const withEnough = strategies.filter((s) => s.trades >= 2);
  const bestStrategy = [...withEnough].sort((a, b) => b.profitFactor - a.profitFactor)[0];
  const worstStrategy = [...withEnough].sort((a, b) => a.winRate - b.winRate)[0];
  const coinsWithEnough = coins.filter((c) => c.trades >= 2);
  const bestCoin = [...coinsWithEnough].sort((a, b) => b.totalProfit - a.totalProfit)[0];
  const worstCoin = [...coinsWithEnough].sort((a, b) => a.totalProfit - b.totalProfit)[0];
  const bestSetup = setups[0];

  let cumulative = 0;
  const equityCurve: EquityPoint[] = chronological.map((e) => {
    cumulative += e.profit_percent;
    return { date: e.closed_at, equityPercent: Number(cumulative.toFixed(2)) };
  });

  const monthlyMap = new Map<string, { profit: number; trades: number }>();
  for (const e of chronological) {
    const d = new Date(e.closed_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const prev = monthlyMap.get(key) ?? { profit: 0, trades: 0 };
    monthlyMap.set(key, { profit: prev.profit + e.profit_percent, trades: prev.trades + 1 });
  }
  const monthly: MonthlyPoint[] = [...monthlyMap.entries()]
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .map(([month, v]) => ({ month, profitPercent: Number(v.profit.toFixed(2)), trades: v.trades }));

  const withDuration = chronological.filter((e) => e.duration_minutes !== null) as (JournalWithSignal & { duration_minutes: number })[];
  const avgHoldMinutes = withDuration.length
    ? Number((withDuration.reduce((s, e) => s + e.duration_minutes, 0) / withDuration.length).toFixed(1))
    : null;

  const withConfidence = chronological.filter((e) => e.signal?.confidence !== undefined);
  const avgConfidence = withConfidence.length
    ? Number((withConfidence.reduce((s, e) => s + (e.signal?.confidence ?? 0), 0) / withConfidence.length).toFixed(1))
    : null;

  return {
    configured: true,
    strategies,
    coins,
    setups,
    bestStrategy,
    worstStrategy,
    bestCoin,
    worstCoin,
    bestSetup,
    equityCurve,
    monthly,
    avgHoldMinutes,
    avgConfidence,
  };
}

/** Feeds engine.ts's calibration step — win rate per strategy label, closed trades only. */
export async function getStrategyCalibration(): Promise<{ strategy: string; winRate: number; sampleSize: number }[]> {
  const report = await getPerformanceReport();
  return report.strategies.map((s) => ({ strategy: s.strategy, winRate: s.winRate, sampleSize: s.trades }));
}
