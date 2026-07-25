"use client";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd, timeAgo } from "@/lib/format";
import type { AiSignal } from "@/lib/elvoid/types";
import { computeUnrealized } from "@/lib/elvoid/math";

export function OpenTradesTable({
  signals,
  priceBySymbol,
  riskPerTrade,
  onClose,
  closingId,
}: {
  signals: AiSignal[];
  priceBySymbol: Record<string, number>;
  riskPerTrade: number;
  onClose: (signal: AiSignal) => void;
  closingId: string | null;
}) {
  return (
    <div className="glow-card p-4">
      <SectionHeader code="OPN" title="Open Trades" hint={`${signals.length} posisi berjalan`} />
      {!signals.length && <p className="py-6 text-center text-sm text-ink-muted">Tidak ada posisi terbuka saat ini.</p>}
      {signals.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-3 font-medium">Tanggal</th>
                <th className="pb-2 pr-3 font-medium">Coin</th>
                <th className="pb-2 pr-3 font-medium">Side</th>
                <th className="pb-2 pr-3 font-medium">TF</th>
                <th className="pb-2 pr-3 font-medium">Entry</th>
                <th className="pb-2 pr-3 font-medium">Live</th>
                <th className="pb-2 pr-3 font-medium">SL</th>
                <th className="pb-2 pr-3 font-medium">TP1 / TP2 / TP3</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 pr-3 font-medium">Unrealized</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {signals.map((s) => {
                const live = priceBySymbol[s.coin.toLowerCase()];
                const { unrealizedPercent, unrealizedRr } = computeUnrealized(s, live, riskPerTrade);
                const positive = unrealizedPercent >= 0;
                const effectiveSl = s.status === "tp1_hit" ? s.entry : s.sl;
                return (
                  <tr key={s.id} className="align-middle">
                    <td className="py-2.5 pr-3 text-xs text-ink-faint">{timeAgo(s.created_at)}</td>
                    <td className="py-2.5 pr-3 font-medium">{s.coin}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`mono-num text-xs font-medium ${s.side === "LONG" ? "text-up" : "text-down"}`}>{s.side}</span>
                    </td>
                    <td className="mono-num py-2.5 pr-3 text-xs text-ink-faint">{s.timeframe}</td>
                    <td className="mono-num py-2.5 pr-3 text-xs">{formatUsd(s.entry)}</td>
                    <td className="mono-num py-2.5 pr-3 text-xs">{live ? formatUsd(live) : "—"}</td>
                    <td className="mono-num py-2.5 pr-3 text-xs text-ink-muted">{formatUsd(effectiveSl)}</td>
                    <td className="mono-num py-2.5 pr-3 text-xs text-ink-muted">
                      {formatUsd(s.tp1)} / {formatUsd(s.tp2)} {s.tp3 ? `/ ${formatUsd(s.tp3)}` : ""}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-ink-muted">
                      {s.status === "tp1_hit" ? "TP1 hit · SL@BE" : "Open"}
                    </td>
                    <td className={`mono-num py-2.5 pr-3 text-xs font-medium ${positive ? "text-up" : "text-down"}`}>
                      {positive ? "+" : ""}
                      {unrealizedPercent.toFixed(2)}% ({unrealizedRr.toFixed(2)}R)
                    </td>
                    <td className="py-2.5">
                      <button
                        onClick={() => onClose(s)}
                        disabled={closingId === s.id}
                        className="rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-muted hover:border-down/50 hover:text-down disabled:opacity-50"
                      >
                        {closingId === s.id ? "Menutup…" : "Close"}
                      </button>
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
