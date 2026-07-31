import { Suspense } from "react";
import { getOrderBookDepth } from "@/lib/binance";
import { getFearGreed } from "@/lib/alternativeme";
import { getWhaleTransfers } from "@/lib/alchemy";
import { getTopMarkets } from "@/lib/coingecko";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { Container, LandingEyebrow } from "./shared";
import { TradingViewMiniChart } from "./TradingViewMiniChart";

// Section 2 of the Phase 5 brief — "Live Market Preview." Every card here
// pulls from a real source that already exists in this codebase (or, for
// order-book depth, a small new public-endpoint function added alongside
// this section — see lib/binance.ts). Per the brief's own strict rule: if a
// source is unavailable, the card shows "Connecting Oracle…", never a
// plausible-looking fake number.

function Card({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`landing-glass flex h-[260px] flex-col rounded-xl p-4 ${className}`}>
      <span className="eyebrow mb-3 text-[9px] tracking-[0.2em] text-ink-faint">{title}</span>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function ConnectingOracle({ label = "Connecting Oracle…" }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <span className="live-dot" aria-hidden="true" />
      <span className="eyebrow text-[9px] tracking-[0.15em] text-ink-faint">{label}</span>
    </div>
  );
}

async function OrderbookCard() {
  try {
    const book = await getOrderBookDepth("BTC", 8);
    const maxQty = Math.max(...book.bids.map((b) => b.qty), ...book.asks.map((a) => a.qty), 1);
    return (
      <div className="grid h-full grid-cols-2 gap-3 text-[11px]">
        <div className="flex flex-col gap-1">
          <span className="mono-num mb-1 text-[9px] text-up">BID</span>
          {book.bids.slice(0, 7).map((b) => (
            <div key={b.price} className="relative h-5 overflow-hidden rounded-sm bg-up/5">
              <div className="absolute inset-y-0 right-0 bg-up/20" style={{ width: `${(b.qty / maxQty) * 100}%` }} />
              <div className="mono-num relative flex h-full items-center justify-between px-1.5 text-[10px] text-ink-muted">
                <span>{b.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <span className="mono-num mb-1 text-[9px] text-down">ASK</span>
          {book.asks.slice(0, 7).map((a) => (
            <div key={a.price} className="relative h-5 overflow-hidden rounded-sm bg-down/5">
              <div className="absolute inset-y-0 left-0 bg-down/20" style={{ width: `${(a.qty / maxQty) * 100}%` }} />
              <div className="mono-num relative flex h-full items-center justify-between px-1.5 text-[10px] text-ink-muted">
                <span>{a.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch {
    return <ConnectingOracle />;
  }
}

async function FearGreedCard() {
  try {
    const { now } = await getFearGreed();
    const tone = now.value < 25 ? "down" : now.value > 75 ? "up" : "amber";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <RadialGauge value={now.value} size={104} tone={tone} label="F&G" sublabel={now.classification} />
      </div>
    );
  } catch {
    return <ConnectingOracle />;
  }
}

async function WhaleCard() {
  try {
    const markets = await getTopMarkets(60);
    const priceBySymbol = Object.fromEntries(markets.map((m) => [m.symbol.toUpperCase(), m.current_price]));
    const transfers = await getWhaleTransfers(priceBySymbol);
    const latest = transfers.slice(0, 3);
    if (latest.length === 0) return <ConnectingOracle label="Waiting For Live Data…" />;
    return (
      <div className="flex h-full flex-col justify-center gap-2.5">
        {latest.map((t) => (
          <div key={t.hash} className="flex items-center justify-between border-b border-landing-line pb-2 text-[11px] last:border-0">
            <div className="flex flex-col">
              <span className="text-ink">{t.asset}</span>
              <span className="text-[9px] uppercase tracking-wide text-ink-faint">{t.direction.replace("-", " ")}</span>
            </div>
            <span className="mono-num text-landing-cyan-glow">
              ${t.valueUsd >= 1_000_000 ? `${(t.valueUsd / 1_000_000).toFixed(1)}M` : `${(t.valueUsd / 1_000).toFixed(0)}K`}
            </span>
          </div>
        ))}
      </div>
    );
  } catch {
    return <ConnectingOracle />;
  }
}

export function LiveMarketPreview() {
  return (
    <section id="intelligence" className="bg-landing-bg py-20 sm:py-28">
      <Container>
        <LandingEyebrow>Live Market Preview</LandingEyebrow>
        <h2 className="mt-4 max-w-xl font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
          Not a screenshot. Real widgets, reading real markets right now.
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="BTC/USDT · TradingView">
            <TradingViewMiniChart symbol="BINANCE:BTCUSDT" />
          </Card>

          <Card title="Order Book · BTC">
            <Suspense fallback={<ConnectingOracle />}>
              <OrderbookCard />
            </Suspense>
          </Card>

          <Card title="Fear & Greed Index">
            <Suspense fallback={<ConnectingOracle />}>
              <FearGreedCard />
            </Suspense>
          </Card>

          <Card title="Whale Activity">
            <Suspense fallback={<ConnectingOracle label="Waiting For Live Data…" />}>
              <WhaleCard />
            </Suspense>
          </Card>
        </div>
      </Container>
    </section>
  );
}
