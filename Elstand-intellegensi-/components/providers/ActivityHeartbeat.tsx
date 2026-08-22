"use client";
import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/** Renders nothing. Mounted once in app/layout.tsx so "Last Active" updates on every page, not just Settings. */
export function ActivityHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await fetch("/api/account/heartbeat", { method: "POST" });
      } catch {
        // Best-effort — a missed heartbeat just means a slightly stale "Last Active" timestamp, nothing worth surfacing to the user.
      }
    }

    ping();
    const id = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  return null;
}
