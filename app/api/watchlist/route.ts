import { NextResponse } from "next/server";
import { getWatchlist, addWatchlistCoin } from "@/lib/elvoid/watchlist";
import { listSignals } from "@/lib/elvoid/signals";

// GET /api/watchlist — every tracked coin plus its latest signal (any status),
// so the AI Signal -> Watchlist tab can show side / confidence / status /
// timestamp per row without a second round trip per coin.
export async function GET() {
  const [items, signals] = await Promise.all([
    getWatchlist(),
    // listSignals() already orders by created_at desc, so the first hit per
    // coin below is guaranteed to be the latest one — no extra sort needed.
    listSignals({ limit: 300 }),
  ]);

  const latestByCoin = new Map<string, (typeof signals)[number]>();
  for (const s of signals) {
    if (!latestByCoin.has(s.coin)) latestByCoin.set(s.coin, s);
  }

  const watchlist = items.map((item) => {
    const latest = latestByCoin.get(item.coin);
    return {
      coin: item.coin,
      added_at: item.added_at,
      latestSignal: latest
        ? {
            side: latest.side,
            confidence: latest.confidence,
            status: latest.status,
            trade_grade: latest.trade_grade,
            created_at: latest.created_at,
          }
        : null,
    };
  });

  return NextResponse.json({ watchlist });
}

export async function POST(req: Request) {
  let body: { coin?: string };
  try {
    body = (await req.json()) as { coin?: string };
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const result = await addWatchlistCoin(body.coin ?? "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ coins: result.coins });
}
