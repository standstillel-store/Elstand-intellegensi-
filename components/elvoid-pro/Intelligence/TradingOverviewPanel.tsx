"use client";
import { useEffect, useState } from "react";
import type { AiStatistics } from "@/lib/elvoid/types";

export function TradingOverviewPanel() {
  const [stats, setStats] = useState<AiStatistics | null>(null);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/paper-trader/stats")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setStats(data.stats);
        setConfigured(data.configured);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const n = (v: number | undefined, fmt: (x: number) => string) => (v === undefined || v === null ? "N/A" : fmt(v));

  return (
    <div className="rounded-lg border border-line bg-bg-surface/40 p-3">
      <p className="text-xs font-semibold text-ink-muted">Trading Overview</p>
      {!configured && <p className="mt-2 text-[10px] text-ink-faint">Database belum terkonfigurasi.</p>}
      <div className="mono-num mt-2 grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <p className="text-ink-faint">Win Rate</p>
          <p className="text-sm font-semibold text-ink">{n(stats?.win_rate, (v) => `${v.toFixed(1)}%`)}</p>
        </div>
        <div>
          <p className="text-ink-faint">Total Trades</p>
          <p className="text-sm font-semibold text-ink">{stats?.total_trade ?? "N/A"}</p>
        </div>
        <div>
          <p className="text-ink-faint">Profit Factor</p>
          <p className="text-sm font-semibold text-ink">{n(stats?.profit_factor, (v) => v.toFixed(2))}</p>
        </div>
        <div>
          <p className="text-ink-faint">Total PnL</p>
          <p className={`text-sm font-semibold ${(stats?.total_profit ?? 0) >= 0 ? "text-up" : "text-down"}`}>
            {n(stats?.total_profit, (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} USDT`)}
          </p>
        </div>
      </div>
    </div>
  );
}
