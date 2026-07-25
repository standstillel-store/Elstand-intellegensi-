import { NextResponse } from "next/server";
import { getTrendingPools, getNewPools } from "@/lib/geckoterminal";
import { getWhaleTransfers } from "@/lib/alchemy";
import { getTopMarkets } from "@/lib/coingecko";
import { getNews } from "@/lib/newsapi";
import { buildRugpullRisks } from "@/lib/scoring";

export async function GET() {
  try {
    const [trending, fresh, markets, news] = await Promise.all([
      getTrendingPools(),
      getNewPools(),
      getTopMarkets(150),
      getNews().catch(() => []),
    ]);

    const priceBySymbol: Record<string, number> = {};
    for (const m of markets) priceBySymbol[m.symbol.toLowerCase()] = m.current_price;
    const whales = await getWhaleTransfers(priceBySymbol).catch(() => []);

    const negativeTitles = news.filter(
      (n) => n.sentiment === "negative" || /rug|scam|exploit|hack/i.test(n.title)
    );
    const newsFlagWords = new Set<string>();
    for (const n of negativeTitles) {
      for (const w of n.title.toLowerCase().match(/[a-z0-9]+/g) ?? []) newsFlagWords.add(w);
    }

    const pools = [...trending, ...fresh];
    const risks = buildRugpullRisks(pools, whales, newsFlagWords);
    return NextResponse.json({ risks });
  } catch {
    return NextResponse.json({ risks: [], error: "rugpull_scoring_failed" }, { status: 502 });
  }
}
