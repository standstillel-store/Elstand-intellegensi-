import { Waves, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd, timeAgo, shortAddr } from "@/lib/format";
import type { WhaleTransfer } from "@/lib/types";
import type { WhaleSummary } from "@/lib/market-insights";

const DIR_ICON = { in: ArrowDownLeft, out: ArrowUpRight, "wallet-to-wallet": ArrowLeftRight } as const;
const DIR_TONE = { in: "text-up", out: "text-down", "wallet-to-wallet": "text-ink-faint" } as const;

export function WhaleAlertCard({ summary, transfers }: { summary: WhaleSummary; transfers: WhaleTransfer[] }) {
  return (
    <div className="glow-card p-4">
      <SectionHeader code="WHL" title="Whale Alert" hint={`${summary.count} transfer`} />
      {!transfers.length ? (
        <p className="py-4 text-center text-xs text-ink-muted">Tidak ada transfer whale besar terdeteksi saat ini.</p>
      ) : (
        <ul className="space-y-2">
          {transfers.slice(0, 4).map((w) => {
            const Icon = DIR_ICON[w.direction];
            return (
              <li key={w.hash} className="flex items-center gap-2 text-xs">
                <Icon size={13} className={`shrink-0 ${DIR_TONE[w.direction]}`} />
                <span className="mono-num w-12 shrink-0 font-medium text-signal-glow">{w.asset}</span>
                <span className="min-w-0 flex-1 truncate text-ink-faint">{shortAddr(w.from)} → {shortAddr(w.to)}</span>
                <span className="mono-num shrink-0 text-ink">{formatUsd(w.valueUsd)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {summary.largest && (
        <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2 text-[11px] text-ink-faint">
          <Waves size={11} /> Terbesar: {summary.largest.asset} {formatUsd(summary.largest.valueUsd)} · {timeAgo(summary.largest.timestamp)}
        </p>
      )}
    </div>
  );
}
