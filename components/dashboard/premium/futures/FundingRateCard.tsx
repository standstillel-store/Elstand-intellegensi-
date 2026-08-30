import { formatPct } from "@/lib/format";
import { AiSummaryIsolated } from "./AiSummaryIsolated";
import type { FundingHistorySeries } from "@/lib/intelligence/premiumMicrostructure";

function biasLabel(rate: number | undefined): { label: string; tone: "up" | "down" | "neutral" } {
  if (rate === undefined) return { label: "—", tone: "neutral" };
  if (rate > 0.0005) return { label: "Long Crowded", tone: "down" }; // longs paying shorts heavily
  if (rate < -0.0005) return { label: "Short Crowded", tone: "up" };
  return { label: "Neutral", tone: "neutral" };
}

function FundingHistoryChart({ series }: { series: FundingHistorySeries }) {
  if (!series.connected || series.points.length < 2) {
    return (
      <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
        Historical funding data unavailable
      </div>
    );
  }

  const width = 480;
  const height = 140;
  const values = series.points.map((p) => p.fundingRate);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const stepX = width / (series.points.length - 1);
  const zeroY = height - ((0 - min) / range) * height;
  const path = series.points
    .map((p, i) => `${(i * stepX).toFixed(1)},${(height - ((p.fundingRate - min) / range) * height).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[140px] w-full" preserveAspectRatio="none">
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#23262F" strokeWidth={1} strokeDasharray="4 4" />
      <polyline points={path} fill="none" stroke="#A78BFA" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FundingRateCard({
  pair,
  history,
  currentFundingRate,
}: {
  pair: string;
  history: FundingHistorySeries;
  currentFundingRate?: number;
}) {
  const bias = biasLabel(currentFundingRate);
  const toneClass = bias.tone === "up" ? "text-up" : bias.tone === "down" ? "text-down" : "text-ink-faint";

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="eyebrow text-[11px] text-ink-muted">Funding Rate Intelligence</h3>
          <p className="text-[11px] text-ink-faint">
            {pair}USDT Perpetual · Source: Binance Futures
          </p>
        </div>
      </div>

      <FundingHistoryChart series={history} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Current Funding</div>
          <div className={`text-[15px] font-semibold ${currentFundingRate !== undefined ? (currentFundingRate >= 0 ? "text-up" : "text-down") : "text-ink-faint"}`}>
            {currentFundingRate !== undefined ? formatPct(currentFundingRate * 100) : "N/A"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Market Bias</div>
          <div className={`text-[15px] font-semibold ${toneClass}`}>{bias.label}</div>
        </div>
      </div>

      <AiSummaryIsolated />
    </section>
  );
}
