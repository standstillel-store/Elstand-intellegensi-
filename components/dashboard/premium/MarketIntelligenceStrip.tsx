import { formatPct, formatUsd, timeAgo } from "@/lib/format";
import { DataStateBadge, DataUnavailable } from "@/components/ui/DataStateBadge";
import { Sparkline } from "@/components/intelligence/ui/Sparkline";
import { LiveDot } from "@/components/ui/LiveDot";
import type { PremiumIntelligenceSnapshot } from "@/lib/intelligence/premium";

function toneFor(n: number | undefined): "up" | "down" | "neutral" {
  if (n === undefined || n === 0) return "neutral";
  return n > 0 ? "up" : "down";
}
function toneClass(t: "up" | "down" | "neutral") {
  return t === "up" ? "text-up" : t === "down" ? "text-down" : "text-ink-faint";
}

function Tile({
  label,
  state,
  value,
  changeLabel,
  changeTone = "neutral",
  spark,
  note,
  asOf,
}: {
  label: string;
  state: "real" | "proxy" | "unavailable";
  value?: string;
  changeLabel?: string;
  changeTone?: "up" | "down" | "neutral";
  spark?: number[];
  note?: string;
  asOf?: string;
}) {
  return (
    <div className="rounded-md border border-line/70 bg-bg-surface/50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow text-[9.5px] leading-tight text-ink-muted">{label}</span>
        <DataStateBadge state={state} compact title={note ?? (asOf ? `As of ${asOf}` : undefined)} />
      </div>
      {state === "unavailable" || !value ? (
        <div className="mt-1.5">
          <DataUnavailable />
        </div>
      ) : (
        <>
          <div className="mono-num mt-1 truncate text-[15px] font-semibold text-ink">{value}</div>
          <div className="mt-1 flex h-[18px] items-center justify-between gap-2">
            {changeLabel ? <span className={`mono-num text-[11px] ${toneClass(changeTone)}`}>{changeLabel}</span> : <span />}
            {spark && spark.length > 1 ? (
              <span className="w-12 shrink-0">
                <Sparkline series={spark} tone={changeTone} height={16} />
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export function MarketIntelligenceStrip({ snapshot }: { snapshot: PremiumIntelligenceSnapshot }) {
  const { usDebt, dxy, sp500, nasdaq, us10y, fedFunds, cryptoGlobal, btc, eth } = snapshot;

  const debtChange =
    usDebt.data?.changeUsdYoy !== undefined ? `${usDebt.data.changeUsdYoy >= 0 ? "+" : "-"}${formatUsd(Math.abs(usDebt.data.changeUsdYoy))} (YoY)` : undefined;

  const fedFundsValue = fedFunds.data ? `${fedFunds.data.lower.toFixed(2)}–${fedFunds.data.upper.toFixed(2)}%` : undefined;
  const fedFundsChange = fedFunds.data?.lastChange
    ? `${fedFunds.data.lastChange.bps >= 0 ? "+" : ""}${fedFunds.data.lastChange.bps}bps · ${new Date(fedFunds.data.lastChange.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" })}`
    : undefined;

  return (
    <section className="panel p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="eyebrow text-[11px] text-ink-muted">Global Market Intelligence</h2>
        <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
          <LiveDot />
          <span>Real-time · Updated {timeAgo(snapshot.asOf)}</span>
        </div>
      </div>

      {/* Primary row — headline metrics (matches the terminal's front-strip reference). */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Tile
          label="US National Debt"
          state={usDebt.state}
          value={usDebt.data ? formatUsd(usDebt.data.valueUsd) : undefined}
          changeLabel={debtChange}
          changeTone={usDebt.data?.changeUsdYoy !== undefined ? (usDebt.data.changeUsdYoy > 0 ? "down" : "up") : "neutral"}
          asOf={usDebt.data?.asOf}
        />
        <Tile
          label="Dollar Index (DXY)"
          state={dxy.state}
          value={dxy.data ? dxy.data.value.toFixed(2) : undefined}
          changeLabel={dxy.data?.changePct !== undefined ? formatPct(dxy.data.changePct) : undefined}
          changeTone={toneFor(dxy.data?.changePct)}
          spark={dxy.data?.series}
          asOf={dxy.data?.asOf}
        />
        <Tile
          label="S&P 500"
          state={sp500.state}
          value={sp500.data ? formatUsd(sp500.data.price) : undefined}
          changeLabel={sp500.data?.changePct !== undefined ? formatPct(sp500.data.changePct) : undefined}
          changeTone={toneFor(sp500.data?.changePct)}
          note={sp500.note}
        />
        <Tile
          label="Total Crypto Mcap"
          state={cryptoGlobal.state}
          value={cryptoGlobal.data ? formatUsd(cryptoGlobal.data.totalMarketCapUsd) : undefined}
          changeLabel={cryptoGlobal.data ? formatPct(cryptoGlobal.data.changePct24h) : undefined}
          changeTone={toneFor(cryptoGlobal.data?.changePct24h)}
        />
        <Tile
          label="BTC Dominance"
          state={cryptoGlobal.state}
          value={cryptoGlobal.data ? `${cryptoGlobal.data.btcDominance.toFixed(2)}%` : undefined}
        />
      </div>

      {/* Secondary row — remaining macro + crypto detail from the brief (Nasdaq, US10Y, Fed Funds, BTC, ETH, 24H change). */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Nasdaq (QQQ)"
          state={nasdaq.state}
          value={nasdaq.data ? formatUsd(nasdaq.data.price) : undefined}
          changeLabel={nasdaq.data?.changePct !== undefined ? formatPct(nasdaq.data.changePct) : undefined}
          changeTone={toneFor(nasdaq.data?.changePct)}
          note={nasdaq.note}
        />
        <Tile
          label="US 10Y Yield"
          state={us10y.state}
          value={us10y.data ? `${us10y.data.value.toFixed(2)}%` : undefined}
          changeLabel={us10y.data?.changeBps !== undefined ? `${us10y.data.changeBps >= 0 ? "+" : ""}${us10y.data.changeBps}bps` : undefined}
          changeTone={toneFor(us10y.data?.changeBps)}
          asOf={us10y.data?.asOf}
        />
        <Tile label="Fed Funds Rate" state={fedFunds.state} value={fedFundsValue} changeLabel={fedFundsChange} changeTone="neutral" asOf={fedFunds.data?.asOf} />
        <Tile
          label="BTC"
          state={btc.state}
          value={btc.data ? formatUsd(btc.data.price) : undefined}
          changeLabel={btc.data?.change24h !== undefined ? formatPct(btc.data.change24h) : undefined}
          changeTone={toneFor(btc.data?.change24h)}
          spark={btc.data?.series}
        />
        <Tile
          label="ETH"
          state={eth.state}
          value={eth.data ? formatUsd(eth.data.price) : undefined}
          changeLabel={eth.data?.change24h !== undefined ? formatPct(eth.data.change24h) : undefined}
          changeTone={toneFor(eth.data?.change24h)}
          spark={eth.data?.series}
        />
        <Tile
          label="24H Market Change"
          state={cryptoGlobal.state}
          value={cryptoGlobal.data ? formatPct(cryptoGlobal.data.changePct24h) : undefined}
          changeTone={toneFor(cryptoGlobal.data?.changePct24h)}
        />
      </div>
    </section>
  );
}
