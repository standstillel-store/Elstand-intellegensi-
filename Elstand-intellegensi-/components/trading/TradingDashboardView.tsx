"use client";
import { useState } from "react";
import { useBinanceTrading } from "@/lib/hooks/useBinanceTrading";
import { ConnectionStatusBar } from "./ConnectionStatusBar";
import { AccountSummaryCards } from "./AccountSummaryCards";
import { LiveTradingChart } from "./LiveTradingChart";
import { OrderPanel } from "./OrderPanel";
import { PositionsTable } from "./PositionsTable";
import { OpenOrdersTable } from "./OpenOrdersTable";
import { TradeHistoryTable } from "./TradeHistoryTable";
import { RiskPanel } from "./RiskPanel";
import { AutoTradePanel } from "./AutoTradePanel";
import { EmergencyControls } from "./EmergencyControls";
import { NewsRiskPanel } from "./NewsRiskPanel";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import { Disclaimer } from "@/components/Disclaimer";

const TABS = ["Positions", "Pending Orders", "Trade History", "Risk", "AI Auto Trading"] as const;
type Tab = (typeof TABS)[number];

export function TradingDashboardView() {
  const trading = useBinanceTrading();
  const [activeSymbol, setActiveSymbol] = useState("BTCUSDT");
  const [tab, setTab] = useState<Tab>("Positions");

  const currentPosition = trading.positions.find((p) => p.symbol === activeSymbol);

  if (trading.loading) {
    return (
      <div className="space-y-4">
        <div className="glow-card h-14 animate-pulse" />
        <SkeletonGrid count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ConnectionStatusBar status={trading.status} />
      <AccountSummaryCards account={trading.account} positions={trading.positions} market={trading.status?.market ?? "futures"} />

      {trading.actionError && (
        <div className="rounded-md border border-down/40 bg-down/10 px-4 py-2.5 text-sm text-down">
          {trading.actionError}
          <button onClick={trading.clearActionError} className="ml-3 text-xs underline">
            Tutup
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <LiveTradingChart symbol={activeSymbol} status={trading.status} position={currentPosition} />

          <div className="glow-card p-4">
            <div className="mb-3 flex flex-wrap gap-1.5 border-b border-line pb-3">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t ? "bg-signal/15 text-signal-glow" : "text-ink-muted hover:text-ink"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {trading.status?.market === "spot" && tab !== "Pending Orders" && tab !== "Trade History" && (
              <p className="mb-3 rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-xs text-amber">
                {tab} butuh posisi berleverage — hanya tersedia saat <code className="mono-num">BINANCE_MARKET=futures</code>. Server ini sedang terhubung ke
                Binance Spot.
              </p>
            )}

            {tab === "Positions" && (
              <PositionsTable positions={trading.positions} onClose={trading.closePosition} onTrailingStop={trading.setTrailingStop} onBreakeven={trading.moveToBreakeven} />
            )}
            {tab === "Pending Orders" && <OpenOrdersTable orders={trading.openOrders} onCancel={trading.cancelOrder} />}
            {tab === "Trade History" && <TradeHistoryTable symbol={activeSymbol} />}
            {tab === "Risk" && <RiskPanel positions={trading.positions} equity={trading.account?.totalMarginBalance ?? 0} />}
            {tab === "AI Auto Trading" && (
              <AutoTradePanel settings={trading.autoTrader} decisionLog={trading.decisionLog} onUpdateSettings={trading.updateAutoTraderSettings} onRunNow={trading.runTickNow} />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <OrderPanel
            defaultSymbol={activeSymbol}
            market={trading.status?.market ?? "futures"}
            onSymbolChange={setActiveSymbol}
            onPlaceOrder={trading.placeOrder}
            onCalculateRisk={trading.calculateRisk}
          />
          <EmergencyControls emergencyStopped={trading.status?.emergencyStopped ?? false} onCloseAll={trading.closeAllPositions} onSetEmergencyStop={trading.setEmergencyStop} />
          <NewsRiskPanel />
        </div>
      </div>

      <Disclaimer>
        ElVoid AI Trading Engine mengeksekusi order <strong className="font-medium">sungguhan</strong> di Binance Testnet (atau Live, jika{" "}
        <code className="mono-num">BINANCE_MODE=live</code> dikonfigurasi). Ini bukan nasihat keuangan — sinyal AI adalah analisis berbasis aturan, bukan
        jaminan profit. Selalu pahami risiko leverage sebelum mengaktifkan Live Mode.
      </Disclaimer>
    </div>
  );
}
