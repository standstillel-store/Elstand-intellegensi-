import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: "neutral" | "up" | "down";
  hint?: string;
}) {
  return (
    <div className="glow-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
        {Icon && <Icon size={14} className="text-ink-faint" />}
      </div>
      <p
        className={clsx(
          "mono-num mt-1.5 text-xl font-semibold",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "neutral" && "text-ink"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}
