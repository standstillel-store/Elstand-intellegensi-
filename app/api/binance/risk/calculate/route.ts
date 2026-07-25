import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { calculateRisk, MAX_RISK_PERCENT } from "@/lib/binance/riskManager";
import { getFuturesAccount } from "@/lib/binance/futuresClient";
import { getSpotAccount } from "@/lib/binance/spotClient";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

interface RiskBody {
  symbol?: string;
  entryPrice?: number;
  stopPrice?: number;
  side?: "LONG" | "SHORT";
  riskPercent?: number;
  leverage?: number;
  /** Optional override — otherwise pulled live from the account (Futures margin balance, or Spot USDT-equivalent balance). */
  accountEquity?: number;
}

async function resolveEquity(cfg: Awaited<ReturnType<typeof resolveBinanceConfig>>): Promise<number> {
  if (cfg.market === "spot") {
    const account = await getSpotAccount(cfg);
    // Spot has no single "equity" figure the way Futures margin balance is one number —
    // approximate with USDT-denominated free+locked balance, which is what a risk % of
    // "account size" means for an unleveraged spot account trading against USDT pairs.
    const usdt = account.balances.find((b) => b.asset === "USDT");
    return usdt?.total ?? 0;
  }
  const account = await getFuturesAccount(cfg);
  return account.totalMarginBalance;
}

export async function POST(req: Request) {
  return withRouteErrorHandling("risk:calculate", async () => {
    const body = (await req.json().catch(() => null)) as RiskBody | null;
    if (!body?.symbol || !body.entryPrice || !body.stopPrice || !body.side) {
      return badRequest("symbol, entryPrice, stopPrice, dan side wajib diisi.");
    }

    const cfg = await resolveBinanceConfig();
    const accountEquity = body.accountEquity ?? (await resolveEquity(cfg));
    const result = await calculateRisk(
      {
        symbol: body.symbol.toUpperCase(),
        entryPrice: body.entryPrice,
        stopPrice: body.stopPrice,
        side: body.side,
        accountEquity,
        riskPercent: body.riskPercent ?? MAX_RISK_PERCENT,
        leverage: body.leverage ?? 1,
      },
      cfg
    );
    return { ...result, accountEquity, maxRiskPercent: MAX_RISK_PERCENT };
  });
}
