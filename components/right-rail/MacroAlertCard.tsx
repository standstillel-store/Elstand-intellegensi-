import { AlertTriangle, CalendarClock, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";
import { timeUntil } from "@/lib/format";
import type { MacroReading } from "@/lib/market-insights";

const LEVEL_CFG = {
  alert: { icon: AlertTriangle, tone: "text-down", ring: "border-down/30 bg-down/5" },
  watch: { icon: CalendarClock, tone: "text-amber", ring: "border-amber/30 bg-amber/5" },
  calm: { icon: ShieldCheck, tone: "text-up", ring: "border-up/30 bg-up/5" },
} as const;

export function MacroAlertCard({ macro }: { macro: MacroReading }) {
  const cfg = LEVEL_CFG[macro.level];
  const Icon = cfg.icon;

  return (
    <div className="glow-card p-4">
      <SectionHeader code="MCR" title="Macro Alert" />
      <div className={clsx("flex items-start gap-2.5 rounded-lg border p-3", cfg.ring)}>
        <Icon size={16} className={clsx("mt-0.5 shrink-0", cfg.tone)} />
        <div className="min-w-0">
          <p className={clsx("text-sm font-medium", cfg.tone)}>{macro.label}</p>
          {macro.nextEvent && (
            <p className="mt-1 truncate text-[11px] text-ink-muted">
              {macro.nextEvent.title} ({macro.nextEvent.country}) · {timeUntil(macro.nextEvent.date)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
