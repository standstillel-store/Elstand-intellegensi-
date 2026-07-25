import clsx from "clsx";
import type { PulseMetric } from "@/lib/intelligence/marketPulse";

const TONE_STROKE: Record<PulseMetric["tone"], string> = {
  up: "#22C55E",
  down: "#EF4444",
  amber: "#FFB020",
  neutral: "#565A64",
  signal: "#6E5BFF",
};
const TONE_TEXT: Record<PulseMetric["tone"], string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-amber",
  neutral: "text-ink-muted",
  signal: "text-signal-glow",
};

const R = 40;
const CX = 50;
const CY = 50;
const CIRCUMFERENCE = Math.PI * R;

export function PulseGauge({ metric }: { metric: PulseMetric }) {
  const value = Math.max(0, Math.min(100, metric.value));
  const offset = CIRCUMFERENCE * (1 - value / 100);
  const theta = Math.PI * (1 - value / 100);
  const tipX = CX + R * Math.cos(theta);
  const tipY = CY - R * Math.sin(theta);
  const color = TONE_STROKE[metric.tone];
  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <div className="flex flex-col items-center rounded-lg border border-line bg-bg-surface px-2 py-3 text-center transition-colors hover:border-signal/30">
      <span className="eyebrow truncate text-[9px] tracking-wide text-ink-faint">{metric.label}</span>
      <svg viewBox="0 0 100 56" className="mt-1 h-[52px] w-[92px]" aria-hidden="true">
        <path d={arcPath} fill="none" stroke="#23262F" strokeWidth={7} strokeLinecap="round" />
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1), stroke 300ms" }}
          opacity={metric.connected ? 1 : 0.35}
        />
        {metric.connected && <circle cx={tipX} cy={tipY} r={3.5} fill={color} />}
      </svg>
      <span className={clsx("mono-num -mt-1 truncate text-[12px] font-bold", metric.connected ? TONE_TEXT[metric.tone] : "text-ink-faint")}>
        {metric.stateLabel}
      </span>
      <span className="mt-0.5 line-clamp-1 text-[9px] leading-tight text-ink-faint">{metric.detail}</span>
    </div>
  );
}
