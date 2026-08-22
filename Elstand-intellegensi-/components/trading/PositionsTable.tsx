"use client";
import { useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { SideBadge } from "@/components/ui/Badge";
import { formatUsd, formatPct } from "@/lib/format";
import type { PositionInfo } from "@/lib/binance/types";
import type { PositionMeta } from "@/lib/binance/db";

type PositionRow = PositionInfo & { meta: PositionMeta | null };

export function PositionsTable({
  positions,
  onClose,
  onTrailingStop,
  onBreakeven,
}: {
  positions: PositionRow[];
  onClose: (symbol: string, percent?: number) => Promise<boolean>;
  onTrailingStop: (symbol: string, callbackRate: number) => Promise<boolean>;
  onBreakeven: (symbol: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [trailingInput, setTrailingInput] = useState<Record<string, string>>({});

  async function run(symbol: string, action: () => Promise<boolean>) {
    setBusy(symbol);
    await action();
    setBusy(null);
  }

  return (
    <div className="glow-card p-4">
      <SectionHeader code="POS" title="Open Positions" hint={`${positions.length} posisi aktif`} />
      {!positions.length && <p className="py-6 text-center text-sm text-ink-muted">Tidak ada posisi terbuka.</p>}
      {positions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-3 font-medium">Symbol</th>
                <th className="pb-2 pr-3 font-medium">Side</th>
                <th className="pb-2 pr-3 font-medium">Size</th>
                <th className="pb-2 pr-3 font-medium">Entry</th>
                <th className="pb-2 pr-3 font-medium">Mark</th>
                <th className="pb-2 pr-3 font-medium">Leverage</th>
                <th className="pb-2 pr-3 font-medium">Liq. Price</th>
                <th className="pb-2 pr-3 font-medium">SL / TP</th>
                <th className="pb-2 pr-3 font-medium">PnL</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {positions.map((p) => {
                const isBusy = busy === p.symbol;
                return (
                  <tr key={p.symbol}>
                    <td className="py-2.5 pr-3 font-medium">
                      {p.symbol}
                      {p.meta?.opened_by === "auto_trader" && <span className="ml-1.5 text-[10px] text-signal-glow">AI</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <SideBadge side={p.side} size="sm" />
                    </td>
                    <td className="mono-num py-2.5 pr-3 text-xs">
                      {Math.abs(p.positionAmt)} <span className="text-ink-faint">({formatUsd(p.notional)})</span>
                    </td>
                    <td className="mono-num py-2.5 pr-3 text-xs">{formatUsd(p.entryPrice)}</td>
                    <td className="mono-num py-2.5 pr-3 text-xs">{formatUsd(p.markPrice)}</td>
                    <td className="mono-num py-2.5 pr-3 text-xs">
                      {p.leverage}x <span className="text-ink-faint">{p.marginType}</span>
                    </td>
                    <td className="mono-num py-2.5 pr-3 text-xs text-amber">{p.liquidationPrice ? formatUsd(p.liquidationPrice) : "—"}</td>
                    <td className="mono-num py-2.5 pr-3 text-xs text-ink-muted">
                      {p.meta?.initial_stop ? formatUsd(p.meta.initial_stop) : "—"} / {p.meta?.tp1 ? formatUsd(p.meta.tp1) : "—"}
                      {p.meta?.breakeven_moved && <span className="ml-1 text-[10px] text-up">BE</span>}
                    </td>
                    <td className={`mono-num py-2.5 pr-3 text-xs font-medium ${p.unrealizedProfit >= 0 ? "text-up" : "text-down"}`}>
                      {formatUsd(p.unrealizedProfit)}
                      <div className="text-[10px] text-ink-faint">{formatPct(p.unrealizedProfitPct)}</div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => run(p.symbol, () => onClose(p.symbol, 50))}
                          disabled={isBusy}
                          className="rounded-md border border-line px-2 py-1 text-[10px] text-ink-muted hover:border-signal/50 hover:text-ink disabled:opacity-50"
                        >
                          Close 50%
                        </button>
                        <button
                          onClick={() => run(p.symbol, () => onClose(p.symbol))}
                          disabled={isBusy}
                          className="rounded-md border border-line px-2 py-1 text-[10px] text-ink-muted hover:border-down/50 hover:text-down disabled:opacity-50"
                        >
                          {isBusy ? "…" : "Close"}
                        </button>
                        <button
                          onClick={() => run(p.symbol, () => onBreakeven(p.symbol))}
                          disabled={isBusy || p.meta?.breakeven_moved}
                          className="rounded-md border border-line px-2 py-1 text-[10px] text-ink-muted hover:border-signal/50 hover:text-ink disabled:opacity-40"
                        >
                          BE
                        </button>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="5"
                          placeholder="TS%"
                          value={trailingInput[p.symbol] ?? ""}
                          onChange={(e) => setTrailingInput((s) => ({ ...s, [p.symbol]: e.target.value }))}
                          className="w-12 rounded-md border border-line bg-bg-raised px-1 py-1 text-[10px] text-ink"
                        />
                        <button
                          onClick={() => {
                            const rate = Number(trailingInput[p.symbol]);
                            if (rate > 0) run(p.symbol, () => onTrailingStop(p.symbol, rate));
                          }}
                          disabled={isBusy || !(Number(trailingInput[p.symbol]) > 0)}
                          className="rounded-md border border-line px-2 py-1 text-[10px] text-ink-muted hover:border-signal/50 hover:text-ink disabled:opacity-40"
                        >
                          Trail
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
