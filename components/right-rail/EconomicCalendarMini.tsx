import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";
import { timeUntil } from "@/lib/format";
import type { EconomicEvent } from "@/lib/types";

const IMPACT_TONE = { high: "bg-down", medium: "bg-amber", low: "bg-ink-faint" } as const;

export function EconomicCalendarMini({ events }: { events: EconomicEvent[] }) {
  const upcoming = events
    .filter((e) => new Date(e.date).getTime() >= Date.now())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <div className="glow-card p-4">
      <SectionHeader code="CAL" title="Economic Calendar" />
      {!upcoming.length ? (
        <p className="py-4 text-center text-xs text-ink-muted">Tidak ada event terjadwal.</p>
      ) : (
        <ul className="space-y-2.5">
          {upcoming.map((e, i) => (
            <li key={i} className="flex items-center gap-2.5 text-xs">
              <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", IMPACT_TONE[e.impact])} />
              <span className="min-w-0 flex-1 truncate text-ink">{e.title}</span>
              <span className="mono-num shrink-0 text-[10px] uppercase text-ink-faint">{e.country}</span>
              <span className="mono-num w-14 shrink-0 text-right text-ink-muted">{timeUntil(e.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
