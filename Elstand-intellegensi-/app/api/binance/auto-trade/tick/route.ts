import { NextResponse } from "next/server";
import { runAutoTraderTick } from "@/lib/binance/autoTrader";
import { resolveBinanceConfig } from "@/lib/binance/credentials";
import { withRouteErrorHandling } from "@/lib/binance/routeHelpers";

// ---------------------------------------------------------------------------
// This is the "every minute" heartbeat for both Auto Trading and Trade
// Monitor. Two ways it gets called:
//   1. Client-side, automatically: the Trading Dashboard polls this route
//      via POST once a minute while open (see lib/hooks/useBinanceTrading.ts)
//      — this is what makes Auto Trading work out of the box, on any
//      hosting plan, no extra setup required.
//   2. Server-side cron (optional, for when the dashboard isn't open):
//      Vercel Cron can hit this as a GET with an
//      `Authorization: Bearer $CRON_SECRET` header — but per-minute cron
//      cadence needs a Vercel Pro plan; Hobby only allows once-a-day cron
//      and will refuse to deploy a `* * * * *` schedule. Pro users can add
//      `{ "crons": [{ "path": "/api/binance/auto-trade/tick", "schedule": "* * * * *" }] }`
//      to vercel.json themselves. Self-hosted/Hobby deployments can instead
//      point any external scheduler (cron-job.org, GitHub Actions, etc.) at
//      this same URL.
// If CRON_SECRET isn't set, the GET path stays open — fine for local/dev
// use or an external scheduler, but production deployments exposed to the
// public internet should set it.
// ---------------------------------------------------------------------------

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }
  return withRouteErrorHandling("auto-trade:tick", async () => {
    const cfg = await resolveBinanceConfig();
    const summary = await runAutoTraderTick(cfg);
    return summary;
  });
}

export async function POST() {
  return withRouteErrorHandling("auto-trade:tick-manual", async () => {
    const cfg = await resolveBinanceConfig();
    const summary = await runAutoTraderTick(cfg);
    return summary;
  });
}
