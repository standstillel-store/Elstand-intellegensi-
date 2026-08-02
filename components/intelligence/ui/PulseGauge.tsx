import clsx from "clsx";
import type { PulseMetric } from "@/lib/intelligence/marketPulse";

// Re-pinned to the dashboard's real brand hex (was a slightly-off ad hoc
// green/red), amber now displays as gold ("Transition = Gold"), and
// neutral now displays as blue ("Neutral = Blue") instead of grey — same
// system used across the Intelligence Map and status badges. `signal`
// reads the live CSS variable instead of a hardcoded hex, so the one AI
// gauge (Confidence) still respects the Settings accent picker.
const TONE_STROKE: Record<PulseMetric["tone"], string> = {
  up: "#00E676",
  down: "#FF5252",
  amber: "#D4AF37",
  neutral: "#3B82F6",
  signal: "rgb(var(--signal-rgb))",
};
const TONE_TEXT: Record<PulseMetric["tone"], string> = {
  up: "text-up",
  down: "text-down",
  amber: "text-gold",
  neutral: "text-smartmoney-glow",
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
  const needleTransition = "x2 800ms cubic-bezier(0.34,1.56,0.64,1), y2 800ms cubic-bezier(0.34,1.56,0.64,1)";

  return (
    <div
      className={clsx(
        "flex flex-col items-center rounded-lg border border-line bg-bg-surface px-2 py-3 text-center transition-colors hover:border-gold/30",
        metric.connected && "pulse-ring"
      )}
      style={{ color: metric.connected ? color : undefined }}
    >
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
          style={{
            transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1), stroke 300ms",
            filter: metric.connected ? `drop-shadow(0 0 4px ${color})` : undefined,
          }}
          opacity={metric.connected ? 1 : 0.35}
        />
        {metric.connected && (
          <>
            <line
              x1={CX}
              y1={CY}
              x2={tipX}
              y2={tipY}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              className="gauge-needle"
              style={{ color, transition: needleTransition }}
            />
            <circle cx={CX} cy={CY} r={2.75} fill={color} />
            <circle cx={tipX} cy={tipY} r={3.5} fill={color} style={{ transition: needleTransition }} />
          </>
        )}
      </svg>
      <span className={clsx("mono-num -mt-1 truncate text-[12px] font-bold", metric.connected ? TONE_TEXT[metric.tone] : "text-ink-faint")}>
        {metric.stateLabel}
      </span>
      <span className="mt-0.5 line-clamp-1 text-[9px] leading-tight text-ink-faint">{metric.detail}</span>
    </div>
  );
}
