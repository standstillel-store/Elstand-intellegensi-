"use client";
import { useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd, timeAgo } from "@/lib/format";
import type { OpenOrderInfo } from "@/lib/binance/types";

export function OpenOrdersTable({ orders, onCancel }: { orders: OpenOrderInfo[]; onCancel: (symbol: string, orderId: number) => Promise<boolean> }) {
  const [busyId, setBusyId] = useState<number | null>(null);

  async function handleCancel(o: OpenOrderInfo) {
    setBusyId(o.orderId);
    await onCancel(o.symbol, o.orderId);
    setBusyId(null);
  }

  return (
    <div className="glow-card p-4">
      <SectionHeader code="ORD" title="Pending Orders" hint={`${orders.length} order menunggu`} />
      {!orders.length && <p className="py-6 text-center text-sm text-ink-muted">Tidak ada order tertunda.</p>}
      {orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-3 font-medium">Waktu</th>
                <th className="pb-2 pr-3 font-medium">Symbol</th>
                <th className="pb-2 pr-3 font-medium">Type</th>
                <th className="pb-2 pr-3 font-medium">Side</th>
                <th className="pb-2 pr-3 font-medium">Price / Stop</th>
                <th className="pb-2 pr-3 font-medium">Qty</th>
                <th className="pb-2 pr-3 font-medium">Reduce Only</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.orderId}>
                  <td className="py-2.5 pr-3 text-xs text-ink-faint">{timeAgo(new Date(o.time).toISOString())}</td>
                  <td className="py-2.5 pr-3 font-medium">{o.symbol}</td>
                  <td className="py-2.5 pr-3 text-xs text-ink-muted">{o.type}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`mono-num text-xs font-medium ${o.side === "BUY" ? "text-up" : "text-down"}`}>{o.side}</span>
                  </td>
                  <td className="mono-num py-2.5 pr-3 text-xs">{formatUsd(o.price || o.stopPrice)}</td>
                  <td className="mono-num py-2.5 pr-3 text-xs">{o.closePosition ? "Full Position" : o.origQty}</td>
                  <td className="py-2.5 pr-3 text-xs text-ink-muted">{o.reduceOnly || o.closePosition ? "Yes" : "No"}</td>
                  <td className="py-2.5">
                    <button
                      onClick={() => handleCancel(o)}
                      disabled={busyId === o.orderId}
                      className="rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-muted hover:border-down/50 hover:text-down disabled:opacity-50"
                    >
                      {busyId === o.orderId ? "…" : "Cancel"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
