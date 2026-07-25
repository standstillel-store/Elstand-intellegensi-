"use client";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { formatUsd, timeAgo } from "@/lib/format";
import type { AiSignal } from "@/lib/elvoid/types";

function triggerDescription(s: AiSignal): string {
  const dir = s.side === "LONG" ? 1 : -1;
  if (s.order_type === "limit") {
    return `Limit — fill saat harga ${dir === 1 ? "turun ke" : "naik ke"} ${formatUsd(s.entry)}`;
  }
  const riskDistance = Math.abs(s.entry - s.sl) || s.entry * 0.02;
  const trigger = s.entry + dir * riskDistance * 0.3;
  return `Stop — fill saat harga ${dir === 1 ? "menembus naik" : "menembus turun"} ${formatUsd(trigger)}`;
}

export function PendingOrdersTable({
  signals,
  onCancel,
  cancelingId,
}: {
  signals: AiSignal[];
  onCancel: (signal: AiSignal) => void;
  cancelingId: string | null;
}) {
  if (!signals.length) return null;

  return (
    <div className="glow-card p-4">
      <SectionHeader code="PND" title="Pending Orders" hint={`${signals.length} order menunggu`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="pb-2 pr-3 font-medium">Coin</th>
              <th className="pb-2 pr-3 font-medium">Side</th>
              <th className="pb-2 pr-3 font-medium">Order Type</th>
              <th className="pb-2 pr-3 font-medium">Trigger</th>
              <th className="pb-2 pr-3 font-medium">Dipasang</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {signals.map((s) => (
              <tr key={s.id}>
                <td className="py-2.5 pr-3 font-medium">{s.coin}</td>
                <td className="py-2.5 pr-3">
                  <span className={`mono-num text-xs font-medium ${s.side === "LONG" ? "text-up" : "text-down"}`}>{s.side}</span>
                </td>
                <td className="py-2.5 pr-3">
                  <Badge tone="amber">{s.order_type}</Badge>
                </td>
                <td className="py-2.5 pr-3 text-xs text-ink-muted">{triggerDescription(s)}</td>
                <td className="py-2.5 pr-3 text-xs text-ink-faint">{timeAgo(s.created_at)}</td>
                <td className="py-2.5">
                  <button
                    onClick={() => onCancel(s)}
                    disabled={cancelingId === s.id}
                    className="rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-muted hover:border-down/50 hover:text-down disabled:opacity-50"
                  >
                    {cancelingId === s.id ? "Membatalkan…" : "Cancel"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">
        Order otomatis dibatalkan (expired) jika tidak ter-fill dalam 48 jam. Trigger dievaluasi setiap kali Sync dijalankan.
      </p>
    </div>
  );
}
