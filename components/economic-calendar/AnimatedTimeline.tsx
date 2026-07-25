"use client";
import clsx from "clsx";
import { currencyFlag } from "@/lib/format";
import { ImpactMeter } from "./ImpactMeter";
import { CountdownLive } from "./CountdownLive";
import type { EconomicEvent } from "@/lib/types";

const DOT_TONE: Record<string, string> = { high: "bg-down shadow-glow-down", medium: "bg-amber shadow-glow-amber", low: "bg-ink-faint" };

export function AnimatedTimeline({ events }: { events: EconomicEvent[] }) {
  const upcoming = events
    .filter((e) => new Date(e.date).getTime() >= Date.now())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 8);

  if (!upcoming.length) return null;

  return (
    <div className="glow-card overflow-x-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow text-[11px] text-signal-glow">
          TIMELINE<span className="text-ink-faint">&lt;GO&gt;</span>
        </p>
        <span className="flex items-center gap-1.5 text-[10px] text-ink-faint">
          <span className="live-dot bg-signal" /> Next {upcoming.length} events
        </span>
      </div>

      <div className="relative flex min-w-[640px] items-start gap-0 pb-2 pt-6">
        {/* connecting line */}
        <div className="absolute left-0 right-0 top-[38px] h-px bg-gradient-to-r from-signal/60 via-line to-line" />

        {upcoming.map((e, i) => (
          <div key={i} className="relative flex-1 px-2 first:pl-0 last:pr-0">
            <div className="flex flex-col items-center text-center">
              <span className={clsx("relative z-10 h-2.5 w-2.5 rounded-full", DOT_TONE[e.impact])}>
                {e.impact === "high" && <span className="absolute inset-0 animate-ping rounded-full bg-down opacity-60" />}
              </span>
              <span className="mt-3 text-base leading-none">{currencyFlag(e.country)}</span>
              <p className="mt-2 line-clamp-2 h-8 text-[11px] leading-tight text-ink">{e.title}</p>
              <div className="mt-1.5">
                <ImpactMeter impact={e.impact} />
              </div>
              <div className="mt-1.5">
                <CountdownLive date={e.date} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
