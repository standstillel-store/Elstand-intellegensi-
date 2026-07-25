import type { NoctrunSnapshot } from "./snapshot";
import type { AiSignal } from "./elvoid/types";

export type AlertType = "liquidity_sweep" | "bos_choch" | "whale" | "funding_extreme" | "open_interest" | "news";
export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertItem {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  symbol?: string;
  message: string;
  timestamp: string;
}

const FUNDING_EXTREME = 0.003; // 0.3% per 8h — well outside typical range
const WHALE_ALERT_USD = 1_000_000;

export function detectAlerts(base: NoctrunSnapshot, openSignals: AiSignal[]): AlertItem[] {
  const alerts: AlertItem[] = [];

  // Whale — largest recent transfers.
  for (const w of [...base.whales].sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 5)) {
    if (w.valueUsd < WHALE_ALERT_USD) continue;
    alerts.push({
      id: `whale-${w.hash}`,
      type: "whale",
      severity: w.valueUsd > 5_000_000 ? "critical" : "warning",
      symbol: w.asset,
      message: `Transfer whale ${w.direction === "in" ? "masuk" : w.direction === "out" ? "keluar" : "antar wallet"} ${w.asset} senilai $${(w.valueUsd / 1_000_000).toFixed(2)}M.`,
      timestamp: w.timestamp,
    });
  }

  // Funding extreme (+ Open Interest context when it's large enough to matter).
  for (const f of base.funding) {
    if (Math.abs(f.lastFundingRate) < FUNDING_EXTREME) continue;
    const symbol = f.symbol.replace(/USDT$/i, "");
    const oiNote = f.openInterestValue && f.openInterestValue > 50_000_000 ? ` OI juga besar ($${(f.openInterestValue / 1_000_000).toFixed(0)}M).` : "";
    alerts.push({
      id: `funding-${f.symbol}`,
      type: "funding_extreme",
      severity: Math.abs(f.lastFundingRate) > 0.006 ? "critical" : "warning",
      symbol,
      message: `Funding rate ekstrem ${symbol}: ${(f.lastFundingRate * 100).toFixed(3)}%.${oiNote}`,
      timestamp: new Date().toISOString(),
    });
  }

  // News with a directional sentiment (skips neutral — that's not alert-worthy).
  for (const n of base.news.filter((n) => n.sentiment && n.sentiment !== "neutral").slice(0, 3)) {
    alerts.push({
      id: `news-${n.id}`,
      type: "news",
      severity: "info",
      message: `${n.sentiment === "positive" ? "📈" : "📉"} ${n.title}`,
      timestamp: n.publishedAt,
    });
  }

  // Liquidity Sweep / BOS-CHoCH — pulled from live signals' own stored scan snapshot.
  for (const s of openSignals) {
    const winningBias = s.side === "LONG" ? "bullish" : "bearish";
    const sweep = s.scans?.find((sc) => sc.key === "liquidity_sweep" && sc.bias === winningBias && sc.weight > 0);
    if (sweep) {
      alerts.push({
        id: `sweep-${s.id}`,
        type: "liquidity_sweep",
        severity: "warning",
        symbol: s.coin,
        message: `Liquidity Sweep terdeteksi di ${s.coin} (${s.side}): ${sweep.detail}`,
        timestamp: s.created_at,
      });
    }
    const structure = s.scans?.find((sc) => sc.key === "market_structure" && sc.bias === winningBias && sc.weight > 0);
    if (structure) {
      alerts.push({
        id: `structure-${s.id}`,
        type: "bos_choch",
        severity: "info",
        symbol: s.coin,
        message: `BOS / CHoCH di ${s.coin} (${s.side}): ${structure.detail}`,
        timestamp: s.created_at,
      });
    }
  }

  return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
}
