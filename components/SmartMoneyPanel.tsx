import { SectionHeader } from "./SectionHeader";
import { formatUsd, timeAgo, shortAddr } from "@/lib/format";
import type { WhaleTransfer } from "@/lib/types";

export function SmartMoneyPanel({ items }: { items: WhaleTransfer[] }) {
  return (
    <div className="panel p-4">
      <SectionHeader code="SMN" title="Trending Smart Money" hint="Alchemy on-chain feed" />
      {!items.length && (
        <p className="text-sm text-ink-muted">
          No large whale transfers detected in the last block scan.
        </p>
      )}
      <ul className="divide-y divide-line">
        {items.slice(0, 10).map((w) => (
          <li key={w.hash} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="mono-num w-16 shrink-0 font-medium text-signal-glow">{w.asset}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
              {shortAddr(w.from)} → {shortAddr(w.to)}
            </span>
            <span className="mono-num shrink-0 text-right">{formatUsd(w.valueUsd)}</span>
            <span className="w-14 shrink-0 text-right text-[11px] text-ink-faint">{timeAgo(w.timestamp)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
