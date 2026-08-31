// Small shared SVG gauges for the Futures Microstructure cards — no chart
// library needed, kept dependency-free like the sibling *Chart components
// in this folder.

/** Horizontal SHORT — NEUTRAL — LONG gradient bar with a position marker, driven by a real funding-rate-derived bias value clamped to [-1, 1]. */
export function BiasBar({ bias, label }: { bias: number | undefined; label: string }) {
  const clamped = bias === undefined ? 0 : Math.max(-1, Math.min(1, bias));
  const positionPct = ((clamped + 1) / 2) * 100;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">Market Bias</span>
        <span
          className={`text-[12px] font-bold uppercase ${
            bias === undefined ? "text-ink-faint" : clamped > 0.15 ? "text-down" : clamped < -0.15 ? "text-up" : "text-ink-muted"
          }`}
        >
          {label}
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full" style={{ background: "linear-gradient(to right, #00E676, #8A93A6, #FF5252)" }}>
        {bias !== undefined && (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-bg-surface bg-ink shadow-md"
            style={{ left: `${positionPct}%`, transform: "translate(-50%, -50%)" }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wide text-ink-faint">
        <span>Short</span>
        <span>Neutral</span>
        <span>Long</span>
      </div>
    </div>
  );
}

/** Two-tone semicircle arc gauge (green/red split) — used for Order Book bid/ask dominance. */
export function DominanceArc({ leftPercent, leftLabel, rightLabel }: { leftPercent: number; leftLabel: string; rightLabel: string }) {
  const r = 60;
  const cx = 70;
  const cy = 68;
  const circumference = Math.PI * r;
  const leftLen = (leftPercent / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 76" className="h-[76px] w-[140px]">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#23262F" strokeWidth={10} strokeLinecap="round" />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#00E676"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${leftLen} ${circumference}`}
        />
        <path
          d={`M ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx - r} ${cy}`}
          fill="none"
          stroke="#FF5252"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${circumference - leftLen} ${circumference}`}
          strokeDashoffset={-leftLen}
          transform={`rotate(180 ${cx} ${cy})`}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
      </svg>
      <div className="-mt-2 flex w-[140px] justify-between px-1 text-[11px] font-semibold">
        <span className="text-up">{leftLabel}</span>
        <span className="text-down">{rightLabel}</span>
      </div>
    </div>
  );
}

/** 5-segment strength meter (e.g. "Flow Strength: Moderate"). filled = 1-5. */
export function StrengthMeter({ filled, tone }: { filled: number; tone: "up" | "down" | "neutral" }) {
  const color = tone === "up" ? "#00E676" : tone === "down" ? "#FF5252" : "#8A93A6";
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-1.5 w-5 rounded-full" style={{ background: i <= filled ? color : "#23262F" }} />
      ))}
    </div>
  );
}
