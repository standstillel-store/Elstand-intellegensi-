import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { getFuturesAccount } from "@/lib/binance/futuresClient";
import { getSpotAccount } from "@/lib/binance/spotClient";
import { withRouteErrorHandling } from "@/lib/binance/routeHelpers";

export async function GET() {
  return withRouteErrorHandling("account", async () => {
    const cfg = await resolveBinanceConfig();

    if (cfg.market === "spot") {
      const account = await getSpotAccount(cfg);
      // Spot has no single "equity" the way Futures margin balance is one number, and no
      // margin/leverage/unrealized-PnL concept at all — approximate account size with the
      // USDT balance (what a risk % of "account size" means for an unleveraged spot account
      // trading USDT pairs), and report margin/PnL as 0 rather than inventing figures.
      const usdt = account.balances.find((b) => b.asset === "USDT");
      const equity = usdt?.total ?? 0;
      return {
        market: "spot" as const,
        mode: cfg.mode,
        account,
        summary: { totalWalletBalance: equity, totalMarginBalance: equity, totalUnrealizedProfit: 0, availableMargin: equity, usedMargin: 0 },
      };
    }

    const account = await getFuturesAccount(cfg);
    return {
      market: "futures" as const,
      mode: cfg.mode,
      account,
      summary: {
        totalWalletBalance: account.totalWalletBalance,
        totalMarginBalance: account.totalMarginBalance,
        totalUnrealizedProfit: account.totalUnrealizedProfit,
        availableMargin: account.availableBalance,
        usedMargin: account.totalInitialMargin,
      },
    };
  });
}
