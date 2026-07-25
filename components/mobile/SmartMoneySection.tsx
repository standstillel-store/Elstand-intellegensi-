import { AccordionSection } from "./AccordionSection";
import { formatUsd, timeAgo, shortAddr } from "@/lib/format";
import type { WhaleSummary } from "@/lib/market-insights";
import type { WhaleTransfer } from "@/lib/types";

export function SmartMoneySection({
  whaleSummary,
  whales,
}: {
  whaleSummary: WhaleSummary;
  whales: WhaleTransfer[];
}) {
  const recent = whales.slice(0, 5);
  const glance = (
    <span className="mono-num text-xs font-medium text-ink-muted">
      {whaleSummary.count} transfer
    </span>
  );

  return (
    <AccordionSection code="SMN" title="Smart Money" glance={glance}>
      {!whales.length ? (
        <p className="text-sm text-ink-muted">Tidak ada transfer whale besar terdeteksi di watchlist saat ini.</p>
      ) : (
        <>
          <div className="divide-y divide-line">
            <div className="flex items-center justify-between gap-3 py-2 first:pt-0">
              <span className="text-xs text-ink-muted">Total Volume Whale (24j)</span>
              <span className="mono-num text-sm">
                {formatUsd(whaleSummary.totalUsd)} <span className="text-ink-faint">· {whaleSummary.count}x</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-xs text-ink-muted">Transaksi Terbesar</span>
              <span className="mono-num text-sm">
                {whaleSummary.largest ? (
                  <>
                    <span className="text-signal-glow">{whaleSummary.largest.asset}</span>{" "}
                    {formatUsd(whaleSummary.largest.valueUsd)}
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-xs text-ink-muted">Exchange Flow (Buy/Sell)</span>
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase text-ink-faint">
                Segera hadir
              </span>
            </div>
          </div>

          <p className="mb-1.5 mt-3 text-[11px] uppercase tracking-wide text-ink-faint">Transaksi Terbaru</p>
          <ul className="divide-y divide-line">
            {recent.map((w) => (
              <li key={w.hash} className="flex items-center gap-3 py-2 text-sm">
                <span className="mono-num w-14 shrink-0 font-medium text-signal-glow">{w.asset}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                  {shortAddr(w.from)} → {shortAddr(w.to)}
                </span>
                <span className="mono-num shrink-0 text-right text-xs">{formatUsd(w.valueUsd)}</span>
                <span className="w-12 shrink-0 text-right text-[10px] text-ink-faint">{timeAgo(w.timestamp)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </AccordionSection>
  );
}
