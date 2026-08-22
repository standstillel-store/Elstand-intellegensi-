import { AppShell } from "@/components/AppShell";
import { getEconomicCalendar } from "@/lib/economiccalendar";
import { AnimatedTimeline } from "@/components/economic-calendar/AnimatedTimeline";
import { ImpactMeter } from "@/components/economic-calendar/ImpactMeter";
import { CountdownLive } from "@/components/economic-calendar/CountdownLive";
import { currencyFlag } from "@/lib/format";
import type { EconomicEvent } from "@/lib/types";

export const metadata = {
  title: "Economic Calendar | ELSTAND INTELLIGENCE",
};

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
}

export default async function EconomicCalendarPage() {
  const events = await getEconomicCalendar().catch(() => []);
  const sorted = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const byDay = new Map<string, EconomicEvent[]>();
  for (const e of sorted) {
    const key = dayKey(e.date);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }

  const highImpactCount = sorted.filter((e) => e.impact === "high" && new Date(e.date).getTime() >= Date.now()).length;

  return (
    <AppShell
      title="Economic Calendar"
      subtitle="Event makro high/medium impact minggu ini — dipakai ElVoid AI untuk Risk Assessment scan."
    >
      {!sorted.length ? (
        <div className="glow-card p-6 text-center text-sm text-ink-muted">Tidak ada event terjadwal minggu ini.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="glow-card p-4">
              <p className="text-[10px] uppercase text-ink-faint">Total Events</p>
              <p className="mono-num mt-1 text-xl font-semibold">{sorted.length}</p>
            </div>
            <div className="glow-card p-4">
              <p className="text-[10px] uppercase text-ink-faint">High Impact</p>
              <p className="mono-num mt-1 text-xl font-semibold text-down">{highImpactCount}</p>
            </div>
            <div className="glow-card p-4">
              <p className="text-[10px] uppercase text-ink-faint">Next Event</p>
              <p className="mt-1 truncate text-sm font-medium">{sorted.find((e) => new Date(e.date).getTime() >= Date.now())?.title ?? "—"}</p>
            </div>
            <div className="glow-card p-4">
              <p className="text-[10px] uppercase text-ink-faint">Currencies</p>
              <p className="mt-1 text-lg leading-none">
                {[...new Set(sorted.map((e) => e.country))].slice(0, 6).map((c) => (
                  <span key={c} className="mr-0.5">
                    {currencyFlag(c)}
                  </span>
                ))}
              </p>
            </div>
          </div>

          <AnimatedTimeline events={sorted} />

          <div className="space-y-4">
            {[...byDay.entries()].map(([day, dayEvents]) => (
              <div key={day} className="glow-card p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{day}</p>
                <ul className="divide-y divide-line">
                  {dayEvents.map((e, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                      <span className="mt-0.5 shrink-0 text-base leading-none">{currencyFlag(e.country)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase text-ink-faint">{e.country}</span>
                          <ImpactMeter impact={e.impact} />
                        </div>
                        <p className="mt-0.5 text-sm text-ink">{e.title}</p>
                        {(e.forecast || e.previous) && (
                          <p className="mt-0.5 text-[11px] text-ink-faint">
                            {e.forecast && <>Expected: {e.forecast} </>}
                            {e.previous && <>· Previous: {e.previous}</>}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="mono-num text-xs text-ink-muted">
                          {new Date(e.date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <div className="mt-1">
                          <CountdownLive date={e.date} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
