import clsx from "clsx";
import type { ReactNode } from "react";

export type BadgeTone = "up" | "down" | "signal" | "amber" | "rugpull" | "smartmoney" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  up: "bg-up/15 text-up border-up/30",
  down: "bg-down/15 text-down border-down/30",
  signal: "bg-signal/15 text-signal-glow border-signal/30",
  amber: "bg-amber/15 text-amber border-amber/30",
  rugpull: "bg-rugpull/15 text-rugpull-glow border-rugpull/30",
  smartmoney: "bg-smartmoney/15 text-smartmoney-glow border-smartmoney/30",
  neutral: "bg-ink-faint/10 text-ink-muted border-line",
};

export function Badge({
  tone = "neutral",
  children,
  icon,
  className,
  size = "sm",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md border font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE_CLASSES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** LONG / SHORT — the one badge every signal card needs, styled distinctly from generic tone badges. */
export function SideBadge({ side, size = "md" }: { side: "LONG" | "SHORT"; size?: "sm" | "md" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border font-bold tracking-wide",
        size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs",
        side === "LONG" ? "border-up/40 bg-up/10 text-up" : "border-down/40 bg-down/10 text-down"
      )}
    >
      <span className={clsx("live-dot", side === "LONG" ? "bg-up" : "bg-down")} />
      {side}
    </span>
  );
}

/** Running / Win / Loss / Invalidated / Expired / Pending status pill for AI signals & trades. */
export function StatusBadge({ status }: { status: "running" | "win" | "loss" | "invalidated" | "expired" | "breakeven" | "pending" }) {
  const map: Record<typeof status, { label: string; tone: BadgeTone }> = {
    running: { label: "Running", tone: "signal" },
    win: { label: "Win", tone: "up" },
    loss: { label: "Loss", tone: "down" },
    breakeven: { label: "Breakeven", tone: "amber" },
    invalidated: { label: "Invalidated", tone: "neutral" },
    expired: { label: "Expired", tone: "neutral" },
    pending: { label: "Pending", tone: "amber" },
  };
  const cfg = map[status];
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}
