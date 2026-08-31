import { AlertTriangle } from "lucide-react";
import { formatUsd } from "@/lib/format";
import { DominanceArc } from "./gauges";
import type { OrderBookDepthData, SupportedPair } from "@/lib/intelligence/premiumMicrostructure";

function DepthChart({ book }: { book: OrderBookDepthData }) {
  if (!book.connected || !book.bids.length || !book.asks.length) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-ink-faint">
        Order book depth unavailable
      </div>
    );
  }

  const width = 480;
  const height = 150;
  const bids = [...book.bids].sort((a, b) => b.price - a.price); // best bid first, descending price
  const asks = [...book.asks].sort((a, b) => a.price - b.price); // best ask first, ascending price

  let cum = 0;
  const bidCum = bids.map((b) => (cum += b.qty));
  cum = 0;
  const askCum = asks.map((a) => (cum += a.qty));
  const maxDepth = Math.max(bidCum[bidCum.length - 1] ?? 0, askCum[askCum.length - 1] ?? 0, 1);

  const halfW = width / 2;
  const bidStepX = halfW / bids.length;
  const askStepX = halfW / asks.length;

  const bidPath = bids
    .map((_, i) => `${(halfW - i * bidStepX).toFixed(1)},${(height - (bidCum[i] / maxDepth) * height).toFixed(1)}`)
    .reverse()
    .join(" ");
  const askPath = asks
    .map((_, i) => `${(halfW + i * askStepX).toFixed(1)},${(height - (askCum[i] / maxDepth) * height).toFixed(1)}`)
    .join(" ");

  const bidArea = `0,${height} ${bidPath} ${halfW},${height}`;
  const askArea = `${halfW},${height} ${askPath} ${width},${height}`;

  return (
    <div className="relative">
      <div className="mb-1 flex items-center justify-between px-1 text-[11px] font-semibold">
        <span className="text-up">BID DEPTH</span>
        {book.midPrice !== undefined && <span className="text-ink-faint">Mid ${book.midPrice.toLocaleString()}</span>}
        <span className="text-down">ASK DEPTH</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[150px] w-full" preserveAspectRatio="none">
        <polygon points={bidArea} fill="#00E676" fillOpacity={0.15} stroke="#00E676" strokeWidth={1.5} />
        <polygon points={askArea} fill="#FF5252" fillOpacity={0.15} stroke="#FF5252" strokeWidth={1.5} />
        <line x1={halfW} y1={0} x2={halfW} y2={height} stroke="#565A64" strokeDasharray="3 3" />
      </svg>
    </div>
  );
}

export function OrderBookImbalanceCard({ pair, book }: { pair: SupportedPair; book: OrderBookDepthData }) {
  return (
    <section className="panel flex flex-col gap-3 p-4 lg:flex-row lg:items-stretch">
      <div className="flex flex-1 flex-col gap-3">
        <div>
          <h3 className="eyebrow text-[11px] text-ink-muted">Live Order Book Imbalance</h3>
          <p className="text-[11px] text-ink-faint">{pair}USDT · Source: Binance Futures depth snapshot</p>
        </div>

        <DepthChart book={book} />

        <div className="flex items-start gap-1.5 rounded-lg border border-amber/30 bg-amber/10 px-2.5 py-2 text-[11px] text-amber">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>Snapshot — liquidity may change rapidly and does not guarantee directional price movement.</span>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-3 border-t border-line/60 pt-3 lg:w-[220px] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        {book.connected && book.bidDominancePercent !== undefined ? (
          <DominanceArc leftPercent={book.bidDominancePercent} leftLabel={`${book.bidDominancePercent.toFixed(0)}% BID`} rightLabel={`${(book.askDominancePercent ?? 0).toFixed(0)}% ASK`} />
        ) : null}

        <div className="grid grid-cols-2 gap-3 text-center lg:grid-cols-1 lg:text-left">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">Depth Imbalance</div>
            <div className="text-[15px] font-semibold text-ink">
              {book.depthImbalancePercent !== undefined
                ? `${book.depthImbalancePercent >= 0 ? "+" : ""}${book.depthImbalancePercent.toFixed(1)}%`
                : "N/A"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <div>
              <div className="text-[9px] uppercase tracking-wide text-ink-faint">Total Bid Liq.</div>
              <div className="mono-num text-[12px] font-semibold text-up">
                {book.bidLiquidityUsd !== undefined ? formatUsd(book.bidLiquidityUsd) : "N/A"}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-ink-faint">Total Ask Liq.</div>
              <div className="mono-num text-[12px] font-semibold text-down">
                {book.askLiquidityUsd !== undefined ? formatUsd(book.askLiquidityUsd) : "N/A"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
