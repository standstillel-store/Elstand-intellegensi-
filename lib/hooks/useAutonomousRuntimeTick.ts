"use client";
import { useEffect, useRef } from "react";

const AUTONOMOUS_TICK_INTERVAL_MS = 60_000;

/**
 * Mirrors features/whale-tracker/hooks/useWhaleIndexerTick.ts and
 * lib/hooks/useBinanceTrading.ts's own auto-trade tick: POSTs to the
 * autonomous runtime route every 60s while this hook is mounted. This is
 * what makes ELVOID PRO ORACLE's autonomous analyze -> decide ->
 * EXECUTE/WAIT/REJECT pipeline run out of the box on any hosting plan —
 * a sub-daily Vercel Cron schedule needs a Pro plan (see
 * app/api/elvoid-pro/autonomous/tick's own header) — but as long as
 * ELVOID Pro is open in at least one browser tab somewhere, the runtime
 * keeps advancing for free, exactly like Auto Trading and the Whale
 * Indexer already do today.
 *
 * Deliberately does NOT read the response — this hook only triggers the
 * batch; OraclePanel/AutonomousStatusCard read the RESULT via the
 * separate, side-effect-free GET /api/elvoid-pro/autonomous/status route.
 */
export function useAutonomousRuntimeTick(enabled: boolean) {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (inFlight.current) return;
      inFlight.current = true;
      fetch("/api/elvoid-pro/autonomous/tick", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          inFlight.current = false;
        });
    };
    tick(); // fire immediately on mount, don't wait for the first interval tick
    const interval = setInterval(tick, AUTONOMOUS_TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled]);
}
