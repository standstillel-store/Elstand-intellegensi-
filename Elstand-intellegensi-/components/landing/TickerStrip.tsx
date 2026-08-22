import { getTopMarkets } from "@/lib/coingecko";

// Phase 5.2 — was hardcoded numbers with no "SAMPLE" label (flagged in the
// Phase 5 audit as the one landing element that should just go live, since
// the real data source already exists). Now a real async Server Component:
// fetches CoinGecko markets (already cached — see lib/cache.ts and the
// `next: { revalidate: 60 }` on the fetch inside lib/coingecko.ts), no new
// dependency, no client JS shipped for this strip at all.

const SYMBOLS = ["btc", "eth", "sol", "bnb", "xrp", "ada", "avax", "doge"];

type TickerAsset = { symbol: string; pct: number };

function Row({ assets }: { assets: TickerAsset[] }) {
  return (
    <div className="flex shrink-0 items-center gap-8 pr-8">
      {assets.map((a) => (
        <div key={a.symbol} className="mono-num flex shrink-0 items-center gap-2 text-xs">
          <span className="text-ink-faint">{a.symbol}</span>
          <span className={a.pct >= 0 ? "text-up" : "text-down"}>
            {a.pct >= 0 ? "+" : ""}
            {a.pct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// Instant, synchronous — used both as the Suspense fallback (so the fetch
// below never blocks the Hero's first paint) and as the honest empty-state
// if the fetch fails outright.
export function TickerStripFallback() {
  return (
    <div className="border-y border-landing-line bg-landing-surface/60 py-3 text-center">
      <span className="eyebrow text-[10px] tracking-[0.15em] text-ink-faint">Connecting to live market data…</span>
    </div>
  );
}

export async function TickerStrip() {
  let assets: TickerAsset[] = [];

  try {
    const markets = await getTopMarkets(100);
    assets = SYMBOLS.map((sym) => {
      const m = markets.find((c) => c.symbol.toLowerCase() === sym);
      if (!m) return null;
      const pct = m.price_change_percentage_24h_in_currency;
      if (typeof pct !== "number") return null;
      return { symbol: `${sym.toUpperCase()}/USDT`, pct };
    }).filter((a): a is TickerAsset => a !== null);
  } catch {
    assets = [];
  }

  // No fake numbers if the fetch fails — honest "connecting" state instead,
  // same principle already established elsewhere in this app (SimulatedTag /
  // "Waiting for API Connection").
  if (assets.length === 0) {
    return <TickerStripFallback />;
  }

  return (
    <div className="overflow-hidden border-y border-landing-line bg-landing-surface/60 py-3" aria-hidden="true">
      <div className="flex w-max animate-ticker">
        <Row assets={assets} />
        <Row assets={assets} />
      </div>
    </div>
  );
}
