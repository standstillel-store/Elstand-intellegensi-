import { Wifi } from "lucide-react";

export function SystemStatusStrip({ connectedSources, totalSources }: { connectedSources: number; totalSources: number }) {
  return (
    <div className="glow-card scan-sweep flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 text-[11px]">
      <span className="flex items-center gap-1.5 text-ink-muted">
        <span className="live-dot bg-up" />
        <span className="font-medium text-up">LIVE</span>
      </span>

      <span className="hidden text-line sm:inline">|</span>

      <span className="flex items-center gap-1.5 text-ink-faint">
        Status
        <span className="font-medium text-ink">Connected</span>
      </span>

      <span className="hidden text-line sm:inline">|</span>

      <span className="flex items-center gap-1.5 text-ink-faint">
        Market
        <span className="font-medium text-ink">Open · 24/7</span>
      </span>

      <span className="hidden text-line sm:inline">|</span>

      <span className="flex items-center gap-1.5 text-ink-faint">
        <Wifi size={11} />
        Data Sources
        <span className="mono-num font-medium text-ink">
          {connectedSources}/{totalSources}
        </span>
      </span>

      <span className="ml-auto flex items-center gap-1.5 text-ink-faint">
        Scanning market
        <span className="typing-dots text-signal-glow">
          <span />
          <span />
          <span />
        </span>
      </span>
    </div>
  );
}
