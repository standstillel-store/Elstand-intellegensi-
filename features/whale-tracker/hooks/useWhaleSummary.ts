"use client";
import { useEffect, useState } from "react";
import type { WhaleSummary } from "../types";

const REFRESH_INTERVAL_MS = 30_000;

export function useWhaleSummary() {
  const [summary, setSummary] = useState<WhaleSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/whale/summary");
        if (!res.ok) return;
        const json = (await res.json()) as WhaleSummary;
        if (!cancelled) setSummary(json);
      } catch {
        // Summary cards degrade to their last known value on a transient failure — never throw into the panel.
      }
    }
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return summary;
}
