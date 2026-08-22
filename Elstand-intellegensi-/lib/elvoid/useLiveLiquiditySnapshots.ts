"use client";
import { useEffect, useRef, useState } from "react";
import { subscribeDepth, type DepthState } from "./depthStream";
import type { StoredLiquiditySnapshot, LiquiditySnapshotLevel } from "../marketHistory/store";

// Spec section 2/15A: sample the shared depth stream every ~10-15s (NOT
// every WS frame — that arrives every 500ms and would flood memory/DB for
// no visual benefit at heatmap resolution) into a rolling client-side
// buffer, independent of whether the user has the Live Book tab open —
// any mounted consumer of this hook (Order Book panel OR the heatmap
// itself, in either Historical or Live sub-mode) drives sampling.
const SAMPLE_INTERVAL_MS = 12_000;
const MAX_BUFFER_SNAPSHOTS = 40; // ~8 minutes of live trail at 12s spacing

function toSnapshot(depth: DepthState): StoredLiquiditySnapshot {
  const levels: LiquiditySnapshotLevel[] = [
    ...depth.bids.map((b) => ({ price: b.price, bidLiquidity: b.qty, askLiquidity: 0, totalLiquidity: b.qty })),
    ...depth.asks.map((a) => ({ price: a.price, bidLiquidity: 0, askLiquidity: a.qty, totalLiquidity: a.qty })),
  ];
  return { timestamp: depth.timestamp, levels, totalLiquidity: levels.reduce((s, l) => s + l.totalLiquidity, 0) };
}

/**
 * Builds a rolling buffer of real, timestamped order-book snapshots for a
 * symbol from the shared live depth stream — this is what gives Live mode
 * an actual time dimension instead of re-painting only the latest frame
 * (spec section 3). Also opportunistically persists each sample server-side
 * (fire-and-forget, best-effort) so historical coverage keeps growing
 * whenever ANY user has this symbol's chart open, not only when someone
 * has the Live Book tab open specifically.
 */
export function useLiveLiquiditySnapshots(symbol: string, persist: boolean) {
  const [buffer, setBuffer] = useState<StoredLiquiditySnapshot[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const latestDepthRef = useRef<DepthState | null>(null);

  useEffect(() => {
    setBuffer([]);
    latestDepthRef.current = null;
    const unsub = subscribeDepth(
      symbol,
      (state) => {
        latestDepthRef.current = state;
      },
      setStatus
    );

    function sample() {
      const depth = latestDepthRef.current;
      if (!depth || depth.bids.length === 0 || depth.asks.length === 0) return;
      const snap = toSnapshot(depth);
      setBuffer((prev) => [...prev, snap].slice(-MAX_BUFFER_SNAPSHOTS));
      if (persist) {
        fetch("/api/liquidity-sample", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: symbol.toUpperCase().trim(), timestamp: snap.timestamp, levels: snap.levels }),
          keepalive: true,
        }).catch(() => {
          // best-effort — never surfaced to the user, matches
          // persistLiquiditySnapshotThrottled's own swallow-errors contract
        });
      }
    }

    const id = setInterval(sample, SAMPLE_INTERVAL_MS);
    // Also take a first sample shortly after the first frame arrives,
    // rather than waiting the full interval, so a short-lived page view
    // still contributes something instead of contributing every visit
    // right up to the wire and then having it unmount at 0 samples.
    const firstSampleTimer = setTimeout(sample, 3000);

    return () => {
      clearInterval(id);
      clearTimeout(firstSampleTimer);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, persist]);

  return { buffer, status };
}
