import clsx from "clsx";

export function ScoreBadge({ score, variant = "pump" }: { score: number; variant?: "pump" | "risk" }) {
  const tone =
    variant === "pump"
      ? score >= 70
        ? "bg-up/15 text-up border-up/30"
        : score >= 40
        ? "bg-signal/15 text-signal-glow border-signal/30"
        : "bg-ink-faint/10 text-ink-muted border-line"
      : score >= 70
      ? "bg-down/15 text-down border-down/30"
      : score >= 40
      ? "bg-amber/15 text-amber border-amber/30"
      : "bg-ink-faint/10 text-ink-muted border-line";

  return (
    <span
      className={clsx(
        "mono-num inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-medium",
        tone
      )}
    >
      {score}
    </span>
  );
}
