import { AppShell } from "@/components/AppShell";
import { getWhaleTransfers } from "@/lib/alchemy";
import { getTopMarkets } from "@/lib/coingecko";
import { buildWhaleBuying, buildWhaleSelling } from "@/lib/scanner-categories";
import { WhaleActivityView } from "@/components/whale/WhaleActivityView";

export const metadata = {
  title: "Whale Activity | ELSTAND INTELLIGENCE",
};

export const revalidate = 60;

export default async function WhalePage() {
  const markets = await getTopMarkets(150).catch(() => []);
  const priceBySymbol: Record<string, number> = {};
  for (const m of markets) priceBySymbol[m.symbol.toLowerCase()] = m.current_price;
  const transfers = await getWhaleTransfers(priceBySymbol).catch(() => []);

  const buying = buildWhaleBuying(transfers);
  const selling = buildWhaleSelling(transfers);

  return (
    <AppShell title="Whale Activity" subtitle="Transfer on-chain besar terbaru — feed langsung dari Alchemy.">
      <WhaleActivityView transfers={transfers} buying={buying} selling={selling} />
    </AppShell>
  );
}
