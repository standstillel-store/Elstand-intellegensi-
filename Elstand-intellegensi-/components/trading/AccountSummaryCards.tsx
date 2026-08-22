"use client";
import { Wallet, TrendingUp, ShieldAlert, Layers } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { formatUsd, formatPct } from "@/lib/format";
import { MAX_RISK_PERCENT_CLIENT } from "@/lib/binance/constantsClient";
import type { PositionInfo, BinanceMarket } from "@/lib/binance/types";
import type { AccountSummary } from "@/lib/hooks/useBinanceTrading";

export function AccountSummaryCards({ account, positions, market }: { account: AccountSummary | null; positions: PositionInfo[]; market: BinanceMarket }) {
  const avgLeverage = positions.length ? positions.reduce((sum, p) => sum + p.leverage, 0) / positions.length : 0;
  const marginRatio = account && account.totalMarginBalance > 0 ? (account.usedMargin / account.totalMarginBalance) * 100 : 0;
  const isFutures = market === "futures";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard label="Wallet Balance" value={account ? formatUsd(account.totalWalletBalance) : "—"} icon={Wallet} />
      {isFutures ? (
        <>
          <StatCard label="Available Margin" value={account ? formatUsd(account.availableMargin) : "—"} icon={Wallet} />
          <StatCard
            label="Used Margin"
            value={account ? `${formatUsd(account.usedMargin)} (${marginRatio.toFixed(0)}%)` : "—"}
            icon={Layers}
            tone={marginRatio > 70 ? "down" : "neutral"}
          />
          <StatCard
            label="Unrealized PnL"
            value={account ? formatUsd(account.totalUnrealizedProfit) : "—"}
            icon={TrendingUp}
            tone={!account ? "neutral" : account.totalUnrealizedProfit > 0 ? "up" : account.totalUnrealizedProfit < 0 ? "down" : "neutral"}
          />
          <StatCard label="Open Positions" value={String(positions.length)} icon={Layers} hint={positions.length ? `Avg leverage ${avgLeverage.toFixed(1)}x` : undefined} />
        </>
      ) : (
        <StatCard label="Available (USDT)" value={account ? formatUsd(account.availableMargin) : "—"} icon={Wallet} hint="Spot — tanpa leverage/posisi" />
      )}
      <StatCard label="Max Risk / Trade" value={formatPct(MAX_RISK_PERCENT_CLIENT)} icon={ShieldAlert} hint="Hard cap — trade ditolak jika terlampaui" />
    </div>
  );
}
