const ASSETS = [
  { symbol: "BTC/USDT", pct: 2.4 },
  { symbol: "ETH/USDT", pct: 1.1 },
  { symbol: "SOL/USDT", pct: -0.8 },
  { symbol: "BNB/USDT", pct: 0.6 },
  { symbol: "XRP/USDT", pct: -1.9 },
  { symbol: "ADA/USDT", pct: 3.2 },
  { symbol: "AVAX/USDT", pct: 1.7 },
  { symbol: "DOGE/USDT", pct: -0.3 },
];

function Row() {
  return (
    <div className="flex shrink-0 items-center gap-8 pr-8">
      {ASSETS.map((a) => (
        <div key={a.symbol} className="mono-num flex shrink-0 items-center gap-2 text-xs">
          <span className="text-ink-faint">{a.symbol}</span>
          <span className={a.pct >= 0 ? "text-up" : "text-down"}>
            {a.pct >= 0 ? "+" : ""}
            {a.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function TickerStrip() {
  return (
    <div className="overflow-hidden border-y border-line/70 bg-bg-surface/60 py-3" aria-hidden="true">
      <div className="flex w-max animate-ticker">
        <Row />
        <Row />
      </div>
    </div>
  );
}
