import { SectionHeader } from "./SectionHeader";
import { ScoreBadge } from "./ScoreBadge";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { formatPct } from "@/lib/format";
import type { PumpCandidate } from "@/lib/types";

export function PumpCandidatesPanel({ items }: { items: PumpCandidate[] }) {
  return (
    <div className="panel p-4">
      <SectionHeader code="MTM" title="High Momentum Watchlist" hint="Signal, not a prediction" />
      {!items.length && <p className="text-sm text-ink-muted">No names clearing the threshold right now.</p>}
      <ul className="divide-y divide-line">
        {items.slice(0, 10).map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5">
            <ScoreBadge score={c.score} variant="pump" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.symbol}</span>
                <span className="truncate text-xs text-ink-muted">{c.name}</span>
              </div>
              <p className="truncate text-xs text-ink-faint">{c.reasons.join(" · ") || "—"}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="mono-num text-right text-sm">
                <div>${c.price < 1 ? c.price.toPrecision(3) : c.price.toFixed(2)}</div>
                <div className={c.change24h >= 0 ? "text-up" : "text-down"}>{formatPct(c.change24h)}</div>
              </div>
              <ConfidenceMeter value={c.confidence} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
