import { SectionHeader } from "./SectionHeader";
import { ScoreBadge } from "./ScoreBadge";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { formatUsd } from "@/lib/format";
import type { RugpullRisk } from "@/lib/types";

export function RugpullRiskPanel({ items }: { items: RugpullRisk[] }) {
  return (
    <div className="panel p-4">
      <SectionHeader code="RSK" title="Risk Assessment" hint="Heuristic — verify before acting" />
      {!items.length && <p className="text-sm text-ink-muted">Nothing flagged above the risk threshold.</p>}
      <ul className="divide-y divide-line">
        {items.slice(0, 10).map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-2.5">
            <ScoreBadge score={r.score} variant="risk" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.symbol}</span>
                <span className="text-xs uppercase text-ink-faint">{r.network}</span>
              </div>
              <p className="text-xs text-ink-muted">{r.flags.slice(0, 2).join(" · ") || "—"}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="mono-num text-right text-xs text-ink-muted">
                <div>Liq {formatUsd(r.liquidityUsd)}</div>
                <div>Vol {formatUsd(r.volume24hUsd)}</div>
              </div>
              <ConfidenceMeter value={r.confidence} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
