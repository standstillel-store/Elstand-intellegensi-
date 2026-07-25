import { SectionHeader } from "@/components/SectionHeader";
import type { EquityPoint } from "@/lib/elvoid/performance";

export function EquityCurveChart({ points }: { points: EquityPoint[] }) {
  const W = 640;
  const H = 180;
  const PAD = 8;

  if (points.length < 2) {
    return (
      <div className="glow-card p-4">
        <SectionHeader code="EQC" title="Equity Curve" hint="% dari starting balance" />
        <p className="py-8 text-center text-sm text-ink-muted">
          Belum ada cukup trade yang ditutup untuk menggambar equity curve.
        </p>
      </div>
    );
  }

  const values = points.map((p) => p.equityPercent);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const xStep = (W - PAD * 2) / (points.length - 1);
  const yFor = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const xFor = (i: number) => PAD + i * xStep;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.equityPercent).toFixed(1)}`).join(" ");
  const zeroY = yFor(0);
  const areaPath = `${linePath} L${xFor(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${PAD},${zeroY.toFixed(1)} Z`;

  const last = values[values.length - 1];
  const positive = last >= 0;

  return (
    <div className="glow-card p-4">
      <SectionHeader code="EQC" title="Equity Curve" hint={`${positive ? "+" : ""}${last.toFixed(2)}% kumulatif`} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="#23262F" strokeWidth="1" strokeDasharray="4 4" />
        <path d={areaPath} fill={positive ? "#22C55E" : "#EF4444"} opacity="0.12" />
        <path d={linePath} fill="none" stroke={positive ? "#22C55E" : "#EF4444"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
