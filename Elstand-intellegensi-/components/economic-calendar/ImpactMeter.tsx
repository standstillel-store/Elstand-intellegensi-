import clsx from "clsx";

const LEVEL: Record<string, number> = { high: 3, medium: 2, low: 1 };
const COLOR: Record<string, string> = { high: "bg-down", medium: "bg-amber", low: "bg-ink-faint" };

/** Three vertical bars, filled according to impact — the "how loud is this event" read at a glance, Bloomberg-terminal style. */
export function ImpactMeter({ impact }: { impact: "high" | "medium" | "low" }) {
  const filled = LEVEL[impact] ?? 1;
  return (
    <span className="inline-flex items-end gap-[2px]" title={`${impact} impact`}>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={clsx("w-1 rounded-sm transition-colors", bar <= filled ? COLOR[impact] : "bg-line")}
          style={{ height: `${4 + bar * 3}px` }}
        />
      ))}
    </span>
  );
}
