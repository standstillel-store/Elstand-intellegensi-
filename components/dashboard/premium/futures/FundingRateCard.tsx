import { formatPct } from "@/lib/format";
import { AiSummaryIsolated } from "./AiSummaryIsolated";
import { BiasBar } from "./gauges";
import type { AssetFundingSeries, ExchangeFundingReading, SupportedPair } from "@/lib/intelligence/premiumMicrostructure";

const ASSET_COLOR: Record<SupportedPair, string> = {
  BTC: "#F7931A",
  ETH: "#627EEA",
  BNB: "#F3BA2F",
  SOL: "#9945FF",
};

function biasFromRate(rate: number | undefined): { label: string; bias: number } {
  if (rate === undefined) return { label: "—", bias: 0 };
  // ±0.001 (0.1%) treated as the practical extreme for the bar — funding
  // rates rarely move much further than that outside brief squeezes.
  const bias = Math.max(-1, Math.min(1, rate / 0.001));
  if (rate > 0.0005) return { label: "Long Crowded", bias };
  if (rate > 0.0001) return { label: "Long Slightly Crowded", bias };
  if (rate < -0.0005) return { label: "Short Crowded", bias };
  if (rate < -0.0001) return { label: "Short Slightly Crowded", bias };
  return { label: "Neutral", bias };
}

/** Multi-asset overlay — one line per SUPPORTED_PAIRS asset, plotted by index (Binance settles all these symbols on the same 00:00/08:00/16:00 UTC schedule, so index-aligned is a fair proxy for time-aligned without needing to interpolate across series). */
function MultiAssetChart({ series }: { series: AssetFundingSeries[] }) {
  const connected = series.filter((s) => s.history.connected);
  if (!connected.length) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
        Historical funding data unavailable
      </div>
    );
  }

  const width = 480;
  const height = 160;
  const allValues = connected.flatMap((s) => s.history.points.map((p) => p.fundingRate));
  const min = Math.min(0, ...allValues);
  const max = Math.max(0, ...allValues);
  const range = max - min || 1;
  const zeroY = height - ((0 - min) / range) * height;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[160px] w-full" preserveAspectRatio="none">
        <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#23262F" strokeWidth={1} strokeDasharray="4 4" />
        {connected.map((s) => {
          const pts = s.history.points;
          const stepX = width / Math.max(1, pts.length - 1);
          const path = pts
            .map((p, i) => `${(i * stepX).toFixed(1)},${(height - ((p.fundingRate - min) / range) * height).toFixed(1)}`)
            .join(" ");
          return (
            <polyline
              key={s.pair}
              points={path}
              fill="none"
              stroke={ASSET_COLOR[s.pair]}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          );
        })}
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {connected.map((s) => (
          <span key={s.pair} className="flex items-center gap-1 text-[10px] text-ink-faint">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: ASSET_COLOR[s.pair] }} />
            {s.pair}
          </span>
        ))}
      </div>
    </div>
  );
}

function AssetFundingStat({ asset }: { asset: AssetFundingSeries }) {
  const rate = asset.currentFundingRate;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: ASSET_COLOR[asset.pair] }} />
        {asset.pair} Funding
      </div>
      <div className={`mono-num text-[14px] font-semibold ${rate !== undefined ? (rate >= 0 ? "text-up" : "text-down") : "text-ink-faint"}`}>
        {rate !== undefined ? formatPct(rate * 100) : "N/A"}
      </div>
    </div>
  );
}

function CrossExchangeRow({ pair, readings }: { pair: SupportedPair; readings: ExchangeFundingReading[] }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">Cross-Exchange · {pair}</div>
      <div className="flex flex-wrap gap-2">
        {readings.map((r) => (
          <div key={r.exchange} className="flex items-center gap-1.5 rounded-lg border border-line bg-bg-raised/60 px-2.5 py-1.5">
            <span className="text-[10px] font-semibold text-ink-muted">{r.exchange}</span>
            <span
              className={`mono-num text-[11px] font-semibold ${
                !r.connected ? "text-ink-faint" : (r.currentFundingRate ?? 0) >= 0 ? "text-up" : "text-down"
              }`}
            >
              {r.connected && r.currentFundingRate !== undefined ? formatPct(r.currentFundingRate * 100) : "N/A"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FundingRateCard({
  pair,
  multiAssetFunding,
  crossExchangeFunding,
  currentFundingRate,
}: {
  pair: SupportedPair;
  multiAssetFunding: AssetFundingSeries[];
  crossExchangeFunding: ExchangeFundingReading[];
  currentFundingRate?: number;
}) {
  const { label, bias } = biasFromRate(currentFundingRate);

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div>
        <h3 className="eyebrow text-[11px] text-ink-muted">Funding Rate Intelligence</h3>
        <p className="text-[11px] text-ink-faint">Perpetual funding · BTC / ETH / BNB / SOL</p>
      </div>

      <MultiAssetChart series={multiAssetFunding} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {multiAssetFunding.map((a) => (
          <AssetFundingStat key={a.pair} asset={a} />
        ))}
      </div>

      <div className="border-t border-line/60 pt-3">
        <CrossExchangeRow pair={pair} readings={crossExchangeFunding} />
      </div>

      <BiasBar bias={bias} label={label} />

      <AiSummaryIsolated />
    </section>
  );
}
