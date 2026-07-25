import clsx from "clsx";
import type { SentimentStatus } from "@/lib/intelligence/globalSentiment";

const CONFIG: Record<SentimentStatus, { label: string; dot: string; classes: string }> = {
  "risk-on": { label: "Risk On", dot: "bg-up", classes: "border-up/30 bg-up/10 text-up" },
  "risk-off": { label: "Risk Off", dot: "bg-down", classes: "border-down/30 bg-down/10 text-down" },
  neutral: { label: "Neutral", dot: "bg-ink-faint", classes: "border-line bg-bg-surface text-ink-muted" },
  transition: { label: "Transition", dot: "bg-amber", classes: "border-amber/30 bg-amber/10 text-amber" },
};

export function MarketStatusBadge({ status, size = "md" }: { status: SentimentStatus; size?: "sm" | "md" }) {
  const cfg = CONFIG[status];
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium",
        cfg.classes,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
