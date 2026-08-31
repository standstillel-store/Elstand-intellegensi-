import { formatUsd } from "@/lib/format";
import { AiSummaryIsolated } from "./AiSummaryIsolated";
import { StrengthMeter } from "./gauges";
import type { OrderFlowSeries, SupportedPair } from "@/lib/intelligence/premiumMicrostructure";

function BuySellDonut({ buyPct }: { buyPct: number }) {
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const buyLen = (buyPct / 100) * circumference;

  return (
    <svg viewBox="0 0 84 84" className="h-[84px] w-[84px] shrink-0 -rotate-90">
      <circle cx={42} cy={42} r={r} fill="none" stroke="#23262F" strokeWidth={10} />
      <circle
        cx={42}
        cy={42}
        r={r}
        fill="none"
        stroke="#00E676"
        strokeWidth={10}
        strokeDasharray={`${buyLen} ${circumference}`}
        strokeLinecap="round"
      />
      <circle
        cx={42}
        cy={42}
        r={r}
        fill="none"
        stroke="#FF5252"
        strokeWidth={10}
        strokeDasharray={`${circumference - buyLen} ${circumference}`}
        strokeDashoffset={-buyLen}
        strokeLinecap="round"
      />
    </svg>
  );
}

function OrderFlowChart({ series }: { series: OrderFlowSeries }) {
  if (!series.connected || series.points.length < 2) {
    return (
      <div className="flex h-[110px] items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
        Historical order-flow data unavailable
      </div>
    );
  }

  const width = 480;
  const height = 110;
  const deltas = series.points.map((p) => p.delta);
  const maxAbs = Math.max(1, ...deltas.map((d) => Math.abs(d)));
  const barWidth = width / series.points.length;
  const mid = height / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[110px] w-full" preserveAspectRatio="none">
      <line x1={0} y1={mid} x2={width} y2={mid} stroke="#23262F" strokeWidth={1} />
      {series.points.map((p, i) => {
        const h = (Math.abs(p.delta) / maxAbs) * (height / 2 - 4);
        const x = i * barWidth;
        const isBuy = p.delta >= 0;
        return (
          <rect
            key={i}
            x={x + 0.5}
            y={isBuy ? mid - h : mid}
            width={Math.max(1, barWidth - 1)}
            height={h}
            fill={isBuy ? "#00E676" : "#FF5252"}
            fillOpacity={0.85}
          />
        );
      })}
    </svg>
  );
}

export function MarketOrderFlowCard({ pair, series }: { pair: SupportedPair; series: OrderFlowSeries }) {
  const totalBuyUsd = series.points.reduce((s, p) => s + p.buyVolumeUsd, 0);
  const totalSellUsd = series.points.reduce((s, p) => s + p.sellVolumeUsd, 0);
  const totalUsd = totalBuyUsd + totalSellUsd;
  const buyPct = totalUsd > 0 ? (totalBuyUsd / totalUsd) * 100 : undefined;
  const sellPct = totalUsd > 0 ? 100 - (buyPct ?? 0) : undefined;
  const netFlowUsd = totalBuyUsd - totalSellUsd;

  const skew = buyPct !== undefined ? Math.abs(buyPct - 50) : 0; // 0 = balanced, 50 = fully one-sided
  const strengthFilled = Math.min(5, Math.max(1, Math.round((skew / 50) * 5) || 1));
  const strengthTone: "up" | "down" | "neutral" = !buyPct ? "neutral" : buyPct > 52 ? "up" : buyPct < 48 ? "down" : "neutral";
  const strengthLabel = strengthTone === "up" ? "Buy Dominant" : strengthTone === "down" ? "Sell Dominant" : "Balanced";

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div>
        <h3 className="eyebrow text-[11px] text-ink-muted">Market Order Flow</h3>
        <p className="text-[11px] text-ink-faint">{pair}USDT · Taker Buy/Sell Dominance · Source: Binance Futures</p>
      </div>

      {series.connected && buyPct !== undefined ? (
        <>
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-up">Buy Volume</div>
              <div className="mono-num text-[20px] font-bold text-up">{buyPct.toFixed(1)}%</div>
              <div className="text-[10px] text-ink-faint">{formatUsd(totalBuyUsd)}</div>
            </div>
            <BuySellDonut buyPct={buyPct} />
            <div className="text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-down">Sell Volume</div>
              <div className="mono-num text-[20px] font-bold text-down">{sellPct!.toFixed(1)}%</div>
              <div className="text-[10px] text-ink-faint">{formatUsd(totalSellUsd)}</div>
            </div>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-bg">
            <div className="h-full bg-up" style={{ width: `${buyPct}%` }} />
            <div className="h-full bg-down" style={{ width: `${sellPct}%` }} />
          </div>
        </>
      ) : (
        <div className="text-[11px] text-ink-faint">Taker dominance unavailable</div>
      )}

      <div>
        <div className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">Historical Buy/Sell Volume Flow</div>
        <OrderFlowChart series={series} />
      </div>

      {series.connected && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">Net Flow</div>
            <div className={`mono-num text-[14px] font-semibold ${netFlowUsd >= 0 ? "text-up" : "text-down"}`}>
              {netFlowUsd >= 0 ? "+" : ""}
              {formatUsd(netFlowUsd)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">Total Volume</div>
            <div className="mono-num text-[14px] font-semibold text-ink">{formatUsd(totalUsd)}</div>
          </div>
        </div>
      )}

      {series.connected && buyPct !== undefined && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-ink-faint">
            <span>Flow Strength</span>
            <span className={strengthTone === "up" ? "text-up" : strengthTone === "down" ? "text-down" : "text-ink-muted"}>
              {strengthLabel}
            </span>
          </div>
          <StrengthMeter filled={strengthFilled} tone={strengthTone} />
        </div>
      )}

      <AiSummaryIsolated />
    </section>
  );
}
