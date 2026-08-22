import { SectionHeader } from "./SectionHeader";

function needleAngle(value: number) {
  return -90 + (value / 100) * 180;
}

export function FearGreedGauge({
  value,
  classification,
  prevValue,
}: {
  value: number;
  classification: string;
  prevValue?: number;
}) {
  const angle = needleAngle(value);
  const delta = prevValue !== undefined ? value - prevValue : undefined;

  return (
    <div className="panel p-4">
      <SectionHeader code="FNG" title="Fear & Greed" />
      <div className="flex flex-col items-center py-2">
        <svg viewBox="0 0 200 110" className="w-48">
          <defs>
            <linearGradient id="fngGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="50%" stopColor="#FFB020" />
              <stop offset="100%" stopColor="#22C55E" />
            </linearGradient>
          </defs>
          <path d="M10,100 A90,90 0 0,1 190,100" fill="none" stroke="url(#fngGrad)" strokeWidth="14" strokeLinecap="round" />
          <g transform={`rotate(${angle} 100 100)`}>
            <line x1="100" y1="100" x2="100" y2="25" stroke="#E6E8EE" strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx="100" cy="100" r="5" fill="#E6E8EE" />
        </svg>
        <div className="mono-num text-3xl font-bold">{value}</div>
        <div className="text-sm text-ink-muted">{classification}</div>
        {delta !== undefined && (
          <div className={`mono-num text-xs ${delta >= 0 ? "text-up" : "text-down"}`}>
            {delta >= 0 ? "+" : ""}
            {delta} vs yesterday
          </div>
        )}
      </div>
    </div>
  );
}
