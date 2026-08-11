"use client";
import { useState } from "react";
import clsx from "clsx";
import { SectionHeader } from "@/components/SectionHeader";

const INDICATORS = [
  "RSI",
  "MACD",
  "EMA",
  "SMA",
  "VWAP",
  "ATR",
  "ADX",
  "Bollinger",
  "Ichimoku",
  "Supertrend",
  "Volume Profile",
] as const;

/**
 * Placeholder shell for the Indicators Suite: locks in the tabbed structure
 * and the position directly below the Chart + Order Book workspace, per the
 * reference spec. Module 3 replaces the placeholder body with real
 * calculations from the same OHLCV candles already loaded for the chart —
 * no fabricated values are shown here in the meantime.
 */
export function IndicatorsSuitePanel({ symbol }: { symbol: string }) {
  const [active, setActive] = useState<(typeof INDICATORS)[number]>("RSI");

  return (
    <div className="glow-card p-4">
      <SectionHeader code="IND" title="Indicators Suite" hint={symbol} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {INDICATORS.map((ind) => (
          <button
            key={ind}
            onClick={() => setActive(ind)}
            className={clsx(
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
              active === ind ? "border-signal/50 bg-signal/15 text-signal-glow" : "border-line text-ink-muted hover:text-ink"
            )}
          >
            {ind}
          </button>
        ))}
      </div>
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line text-center text-[11px] text-ink-faint">
        {active} — menunggu Modul 3 (perhitungan real dari OHLCV {symbol})
      </div>
    </div>
  );
}
