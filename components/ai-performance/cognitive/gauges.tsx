// ---------------------------------------------------------------------------
// Shared, purely presentational gauge primitives for the AI Performance
// redesign. Neither component computes or fetches anything — every
// percentage/label rendered here is passed in by the caller, already
// derived from real data (see SelfPerformancePanel.tsx and
// EvolutionCharge.tsx for what backs each number). Kept in one small file
// so the "0% ──── 100%" Evolution Charge track and the 3 Self Performance
// ring gauges never drift into two different visual languages.
// ---------------------------------------------------------------------------

/** A ring gauge for an already-bounded 0-100 percentage (e.g. confidence average, execution rate). `percent` is clamped defensively — callers with an unbounded value (e.g. portfolio return) should map it to 0-100 themselves before passing it in, and should pass an explicit `label` with the real, unclamped number. */
export function RadialGauge({
  percent,
  color = "#22D3EE",
  trackColor = "rgba(255,255,255,0.08)",
  size = 64,
  strokeWidth = 6,
  label,
}: {
  percent: number;
  color?: string;
  trackColor?: string;
  size?: number;
  strokeWidth?: number;
  /** Overrides the auto "{percent}%" text — use this whenever the real value is N/A, or differs from the clamped fill (e.g. an unbounded return mapped onto a 0-100 ring). */
  label?: string;
}) {
  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const center = size / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="mono-num text-[11px] font-semibold text-ink">{label ?? `${Math.round(clamped)}%`}</span>
      </div>
    </div>
  );
}

/** The literal "0% ──────── 100%" horizontal track the AI Performance spec asks for. `percent === null` renders an honest empty track (no fill) instead of a fabricated number — callers pass null when there is nothing real to show yet. */
export function LinearGauge({ percent, color = "#22D3EE" }: { percent: number | null; color?: string }) {
  const clamped = percent === null || !Number.isFinite(percent) ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="w-full">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{ width: `${clamped}%`, backgroundColor: color, opacity: percent === null ? 0 : 1, transition: "width 0.7s ease" }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-wider text-ink-faint">
        <span>0%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
