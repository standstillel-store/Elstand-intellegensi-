import { AiSummaryIsolated } from "./AiSummaryIsolated";
import type { OrderFlowSeries } from "@/lib/intelligence/premiumMicrostructure";

function OrderFlowChart({ series }: { series: OrderFlowSeries }) {
  if (!series.connected || series.points.length < 2) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
        Historical order-flow data unavailable
      </div>
    );
  }

  const width = 480;
  const height = 120;
  const deltas = series.points.map((p) => p.delta);
  const maxAbs = Math.max(1, ...deltas.map((d) => Math.abs(d)));
  const barWidth = width / series.points.length;
  const mid = height / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[120px] w-full" preserveAspectRatio="none">
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

export function MarketOrderFlowCard({ pair, series }: { pair: string; series: OrderFlowSeries }) {
  const last = series.points[series.points.length - 1];
  const totalBuy = series.points.reduce((s, p) => s + Math.max(0, p.delta), 0);
  const totalSell = series.points.reduce((s, p) => s + Math.max(0, -p.delta), 0);
  const total = totalBuy + totalSell;
  const buyPct = total > 0 ? (totalBuy / total) * 100 : undefined;
  const sellPct = total > 0 ? 100 - (buyPct ?? 0) : undefined;

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div>
        <h3 className="eyebrow text-[11px] text-ink-muted">Market Order Flow</h3>
        <p className="text-[11px] text-ink-faint">{pair}USDT · Taker Buy/Sell Dominance · Source: Binance Futures</p>
      </div>

      {series.connected && buyPct !== undefined ? (
        <>
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-up">BUY {buyPct.toFixed(1)}%</span>
            <span className="font-semibold text-down">SELL {sellPct!.toFixed(1)}%</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-bg">
            <div className="h-full bg-up" style={{ width: `${buyPct}%` }} />
            <div className="h-full bg-down" style={{ width: `${sellPct}%` }} />
          </div>
        </>
      ) : (
        <div className="text-[11px] text-ink-faint">Taker dominance unavailable</div>
      )}

      <OrderFlowChart series={series} />

      <div className="text-[10px] text-ink-faint">
        {series.connected && last ? "Cumulative volume delta (taker buy − sell), 1h candles." : ""}
      </div>

      <AiSummaryIsolated />
    </section>
  );
}
