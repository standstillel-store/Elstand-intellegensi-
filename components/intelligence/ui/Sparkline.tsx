const TONE_STROKE: Record<string, string> = {
  up: "#22C55E",
  down: "#EF4444",
  amber: "#FFB020",
  neutral: "#6E5BFF",
};

export function Sparkline({
  series,
  tone = "neutral",
  height = 56,
  connected = true,
}: {
  series: number[];
  tone?: "up" | "down" | "amber" | "neutral";
  height?: number;
  connected?: boolean;
}) {
  if (!connected || series.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint"
        style={{ height }}
      >
        Waiting for API Connection
      </div>
    );
  }

  const width = 240;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = width / (series.length - 1);
  const points = series.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 6) - 3).toFixed(1)}`).join(" ");
  const stroke = TONE_STROKE[tone];
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polygon points={areaPoints} fill={stroke} fillOpacity={0.08} stroke="none" />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
