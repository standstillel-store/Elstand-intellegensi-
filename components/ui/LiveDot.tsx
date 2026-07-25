import clsx from "clsx";

const TONE_BG: Record<string, string> = {
  signal: "bg-signal",
  up: "bg-up",
  down: "bg-down",
  amber: "bg-amber",
  rugpull: "bg-rugpull",
  smartmoney: "bg-smartmoney",
};

export function LiveDot({
  tone = "signal",
  label,
  className,
}: {
  tone?: "signal" | "up" | "down" | "amber" | "rugpull" | "smartmoney";
  label?: string;
  className?: string;
}) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5", className)}>
      <span className={clsx("live-dot", TONE_BG[tone])} />
      {label && <span className="eyebrow text-[10px] uppercase tracking-wider text-ink-faint">{label}</span>}
    </span>
  );
}
