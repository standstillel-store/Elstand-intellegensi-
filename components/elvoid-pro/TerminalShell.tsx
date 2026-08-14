"use client";
import { useState } from "react";
import { MarketHeader } from "./MarketHeader";
import { ChartToolbar } from "./ChartEngine/ChartToolbar";
import { AdvancedChart } from "./ChartEngine/AdvancedChart";
import { OrderBookPanel } from "./OrderBook/OrderBookPanel";
import { AISignalPanel } from "./AISignal/AISignalPanel";
import { FundingOIPanel } from "./Analytics/FundingOIPanel";
import { ComingSoonPanel } from "./Analytics/ComingSoonPanel";
import { TradingOverviewPanel } from "./Intelligence/TradingOverviewPanel";
import { NewsFeedPanel } from "./News/NewsFeedPanel";
import type { ChartMode } from "./ChartEngine/chartModes";

export function TerminalShell() {
  const [symbol, setSymbol] = useState("BTC");
  const [timeframe, setTimeframe] = useState("5m");
  const [chartMode, setChartMode] = useState<ChartMode>("candlestick");

  return (
    <div className="space-y-3">
      <MarketHeader symbol={symbol} />

      {/* Chart + right rail — chart dominates, right rail is the secondary column. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-lg border border-line bg-bg-surface/40">
          <ChartToolbar
            symbol={symbol}
            onSymbolChange={setSymbol}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            chartMode={chartMode}
            onChartModeChange={setChartMode}
          />
          <div className="p-2">
            <AdvancedChart symbol={symbol} timeframe={timeframe} chartMode={chartMode} />
          </div>
        </div>

        <div className="space-y-3">
          <OrderBookPanel symbol={symbol} />
          <AISignalPanel symbol={symbol} />
        </div>
      </div>

      {/* Bottom analytics — secondary panels, never larger than the chart above. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ComingSoonPanel title="CVD (Cumulative Volume Delta)" phase="Phase 3" />
        <ComingSoonPanel title="Volume Profile" phase="Phase 4" />
        <ComingSoonPanel title="Liquidation Heatmap" phase="Phase 6" />
        <FundingOIPanel symbol={symbol} />
      </div>

      {/* Bottom intelligence — news / AI insights / performance. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <NewsFeedPanel />
        <ComingSoonPanel title="AI Insights & Patterns" phase="Phase 7" />
        <TradingOverviewPanel />
      </div>
    </div>
  );
}
