"use client";
import { useEffect, useRef } from "react";

const INDEXER_TICK_INTERVAL_MS = 30_000;

/**
 * Mirrors lib/hooks/useBinanceTrading.ts's auto-trade tick: POSTs to our own
 * indexer route every 30s while this hook is mounted. This is what makes
 * the BSC scanner advance out of the box on any hosting plan — per-minute+
 * Vercel Cron needs a Pro plan (see app/api/binance/auto-trade/tick's own
 * comment on this exact limitation); Hobby/self-hosted deployments get the
 * same result for free as long as the Whale Tracker tab is open somewhere,
 * exactly like Auto Trading already works today.
 *
 * For always-on indexing even when nobody has the tab open, add a Pro-plan
 * vercel.json cron entry or point an external scheduler at
 * /api/whale/indexer/run — documented in features/whale-tracker/README.md.
 */
export function useWhaleIndexerTick(enabled: boolean) {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (inFlight.current) return;
      inFlight.current = true;
      fetch("/api/whale/indexer/run", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          inFlight.current = false;
        });
    };
    tick(); // fire immediately on mount, don't wait for the first interval tick
    const interval = setInterval(tick, INDEXER_TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled]);
}
