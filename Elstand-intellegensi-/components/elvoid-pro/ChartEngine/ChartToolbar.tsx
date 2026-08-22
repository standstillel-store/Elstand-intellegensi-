"use client";
import clsx from "clsx";
import { IndicatorSelector } from "./IndicatorSelector";
import type { ChartMode } from "./chartModes";

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"];
const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP"];

export function ChartToolbar({
  symbol,
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  chartMode,
  onChartModeChange,
}: {
  symbol: string;
  onSymbolChange: (s: string) => void;
  timeframe: string;
  onTimeframeChange: (t: string) => void;
  chartMode: ChartMode;
  onChartModeChange: (m: ChartMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <select
        value={symbol}
        onChange={(e) => onSymbolChange(e.target.value)}
        className="rounded-md border border-line bg-bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink outline-none"
      >
        {SYMBOLS.map((s) => (
          <option key={s} value={s}>
            {s}/USDT
          </option>
        ))}
      </select>

      <div className="flex items-center gap-0.5 rounded-md border border-line bg-bg-surface p-0.5">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => onTimeframeChange(tf)}
            className={clsx(
              "rounded px-2 py-1 text-[11px] font-medium transition-colors",
              tf === timeframe ? "bg-signal/15 text-signal-glow" : "text-ink-faint hover:text-ink-muted"
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      <IndicatorSelector activeMode={chartMode} onSelect={onChartModeChange} />
    </div>
  );
}
