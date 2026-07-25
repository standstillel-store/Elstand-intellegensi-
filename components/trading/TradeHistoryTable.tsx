"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd, timeAgo } from "@/lib/format";
import type { TradeHistoryEntry } from "@/lib/binance/types";

export function TradeHistoryTable({ symbol }: { symbol: string }) {
  const [trades, setTrades] = useState<TradeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/binance/trades?symbol=${symbol}&limit=50`);
      const body = await res.json();
      setTrades(res.ok ? body.trades ?? [] : []);
    } catch {
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  const realizedTotal = trades.reduce((sum, t) => sum + t.realizedPnl, 0);

  return (
    <div className="glow-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-2">
        <div className="flex items-baseline gap-2">
          <span className="eyebrow text-[11px] text-signal-glow">
            HIS<span className="text-ink-faint">&lt;GO&gt;</span>
          </span>
          <h2 className="text-sm font-semibold tracking-wide text-ink">Trade History — {symbol}</h2>
        </div>
        <button onClick={load} className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      {!trades.length && <p className="py-6 text-center text-sm text-ink-muted">{loading ? "Memuat…" : "Belum ada riwayat trade untuk symbol ini."}</p>}
      {trades.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-3 font-medium">Waktu</th>
                  <th className="pb-2 pr-3 font-medium">Side</th>
                  <th className="pb-2 pr-3 font-medium">Price</th>
                  <th className="pb-2 pr-3 font-medium">Qty</th>
                  <th className="pb-2 pr-3 font-medium">Fee</th>
                  <th className="pb-2 font-medium">Realized PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-3 text-xs text-ink-faint">{timeAgo(new Date(t.time).toISOString())}</td>
                    <td className="py-2 pr-3">
                      <span className={`mono-num text-xs font-medium ${t.side === "BUY" ? "text-up" : "text-down"}`}>{t.side}</span>
                    </td>
                    <td className="mono-num py-2 pr-3 text-xs">{formatUsd(t.price)}</td>
                    <td className="mono-num py-2 pr-3 text-xs">{t.qty}</td>
                    <td className="mono-num py-2 pr-3 text-xs text-ink-faint">
                      {t.commission} {t.commissionAsset}
                    </td>
                    <td className={`mono-num py-2 text-xs font-medium ${t.realizedPnl > 0 ? "text-up" : t.realizedPnl < 0 ? "text-down" : "text-ink-muted"}`}>
                      {formatUsd(t.realizedPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-right text-xs text-ink-muted">
            Total realized ({trades.length} trade terakhir):{" "}
            <span className={`mono-num font-medium ${realizedTotal >= 0 ? "text-up" : "text-down"}`}>{formatUsd(realizedTotal)}</span>
          </p>
        </>
      )}
    </div>
  );
}
