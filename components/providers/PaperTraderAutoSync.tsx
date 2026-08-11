"use client";
import { useEffect } from "react";

const SYNC_INTERVAL_MS = 30 * 1000; // 30s — Vercel Hobby only supports daily cron, so this client-side poll is what actually keeps SL/TP evaluation live.

/**
 * Renders nothing. Mounted once in app/layout.tsx so open paper-trade
 * positions get marked-to-market and auto-closed the moment SL/TP is hit,
 * on every page — not just while the user has Paper Trader open. Calls the
 * same /api/paper-trader/sync endpoint the manual "Sync Harga" button uses
 * (see evaluateOpenTrades in lib/elvoid/paperTrader.ts for the actual
 * SL/TP1/TP2/breakeven logic); this component just makes sure it fires
 * automatically instead of only on a manual click.
 */
export function PaperTraderAutoSync() {
  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await fetch("/api/paper-trader/sync", { method: "POST" });
      } catch {
        // Best-effort — a missed sync just means the next 30s tick (or the
        // manual "Sync Harga" button) catches up; nothing worth surfacing.
      }
    }

    sync();
    const id = setInterval(sync, SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return null;
}
