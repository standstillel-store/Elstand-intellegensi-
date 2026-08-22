"use client";
import { useEffect, useRef, useState } from "react";
import { subscribeDepth, type DepthState } from "./depthStream";

export type DepthConnStatus = "connecting" | "live" | "error";

/**
 * Live order-book depth for one symbol, backed by the shared WebSocket in
 * depthStream.ts. Every component calling this for the same symbol shares
 * one connection — this is what makes Order Book panel and Liquidity
 * Heatmap represent the same market state (spec section 1).
 */
export function useDepthStream(symbol: string) {
  const [state, setState] = useState<DepthState | null>(null);
  const [status, setStatus] = useState<DepthConnStatus>("connecting");
  const latestRef = useRef<DepthState | null>(null);

  useEffect(() => {
    setState(null);
    setStatus("connecting");
    const unsub = subscribeDepth(
      symbol,
      (next) => {
        latestRef.current = next;
        setState(next);
      },
      setStatus
    );
    return unsub;
  }, [symbol]);

  return { state, status, latestRef };
}
