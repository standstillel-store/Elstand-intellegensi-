"use client";
import { formatUsd } from "@/lib/format";
import { useDepthStream } from "@/lib/elvoid/useDepthStream";
import { useLiveLiquiditySnapshots } from "@/lib/elvoid/useLiveLiquiditySnapshots";

// Now backed by the SHARED depth WebSocket (lib/elvoid/depthStream.ts) —
// this is the same live connection the Liquidity Heatmap's Live mode reads
// from, so Order Book and Heatmap always represent the same market state
// (spec section 1). Also drives useLiveLiquiditySnapshots so historical
// collection keeps running whenever this panel is mounted, not only when
// the heatmap's own Live tab happens to be open.
export function OrderBookPanel({ symbol }: { symbol: string }) {
  const { state, status } = useDepthStream(symbol);
  useLiveLiquiditySnapshots(symbol, true);

  const bids = state?.bids ?? [];
  const asks = state?.asks ?? [];
  const maxQty = Math.max(1, ...bids.map((b) => b.qty), ...asks.map((a) => a.qty));

  return (
    <div className="rounded-lg border border-line bg-bg-surface/60">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-xs font-semibold text-ink">Order Book</p>
        <span className="text-[9px] uppercase tracking-wide text-ink-faint">futures · live</span>
      </div>

      {status === "error" ? (
        <p className="px-3 py-6 text-center text-[11px] text-ink-faint">Order book tidak tersedia saat ini.</p>
      ) : status !== "live" && asks.length === 0 ? (
        <p className="animate-pulse px-3 py-6 text-center text-[11px] text-ink-faint">Memuat order book…</p>
      ) : (
        <div className="mono-num px-2 py-1.5 text-[11px]">
          <div className="flex justify-between px-1.5 pb-1 text-[10px] text-ink-faint">
            <span>Price</span>
            <span>Size</span>
          </div>
          <div className="space-y-px">
            {[...asks].reverse().slice(-8).map((a) => (
              <div key={`ask-${a.price}`} className="relative flex justify-between rounded px-1.5 py-0.5">
                <div
                  className="absolute inset-y-0 right-0 bg-down/10"
                  style={{ width: `${(a.qty / maxQty) * 100}%` }}
                />
                <span className="relative text-down">{a.price.toLocaleString()}</span>
                <span className="relative text-ink-muted">{a.qty.toFixed(3)}</span>
              </div>
            ))}
          </div>

          <div className="my-1 border-t border-line px-1.5 py-1 text-center text-xs font-semibold text-ink">
            {asks[0] && bids[0] ? formatUsd((asks[0].price + bids[0].price) / 2) : "—"}
          </div>

          <div className="space-y-px">
            {bids.slice(0, 8).map((b) => (
              <div key={`bid-${b.price}`} className="relative flex justify-between rounded px-1.5 py-0.5">
                <div
                  className="absolute inset-y-0 right-0 bg-up/10"
                  style={{ width: `${(b.qty / maxQty) * 100}%` }}
                />
                <span className="relative text-up">{b.price.toLocaleString()}</span>
                <span className="relative text-ink-muted">{b.qty.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
