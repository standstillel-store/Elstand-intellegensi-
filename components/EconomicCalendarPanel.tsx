import { SectionHeader } from "./SectionHeader";
import { ImpactMeter } from "./economic-calendar/ImpactMeter";
import { CountdownLive } from "./economic-calendar/CountdownLive";
import { currencyFlag } from "@/lib/format";
import type { EconomicEvent } from "@/lib/types";

export function EconomicCalendarPanel({ items }: { items: EconomicEvent[] }) {
  const upcoming = items.filter((e) => new Date(e.date).getTime() >= Date.now()).slice(0, 6);

  return (
    <div className="panel p-4">
      <SectionHeader code="CAL" title="Economic Calendar" hint="High/medium impact, this week" />
      {!upcoming.length && <p className="text-sm text-ink-muted">No upcoming high-impact events this week.</p>}
      <ul className="divide-y divide-line">
        {upcoming.map((e, i) => (
          <li key={i} className="flex items-start justify-between gap-3 py-2.5">
            <span className="mt-0.5 shrink-0 text-base leading-none">{currencyFlag(e.country)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase text-ink-faint">{e.country}</span>
                <ImpactMeter impact={e.impact} />
              </div>
              <p className="text-sm text-ink">{e.title}</p>
              {(e.forecast || e.previous) && (
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {e.forecast && <>Forecast: {e.forecast} </>}
                  {e.previous && <>· Previous: {e.previous}</>}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <CountdownLive date={e.date} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
