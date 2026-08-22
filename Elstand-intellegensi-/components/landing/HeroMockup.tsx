const HEAT_CELLS = [
  { symbol: "BTC", pct: 2.4, up: true },
  { symbol: "ETH", pct: 1.1, up: true },
  { symbol: "SOL", pct: -0.8, up: false },
  { symbol: "BNB", pct: 0.6, up: true },
  { symbol: "XRP", pct: -1.9, up: false },
  { symbol: "ADA", pct: 3.2, up: true },
  { symbol: "DOGE", pct: -0.3, up: false },
  { symbol: "AVAX", pct: 1.7, up: true },
];

export function HeroMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-signal/10 blur-3xl" aria-hidden="true" />

      <div className="glow-card w-full max-w-md overflow-hidden p-0 sm:max-w-lg">
        {/* Chrome */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-down/70" />
          <span className="h-2 w-2 rounded-full bg-amber/70" />
          <span className="h-2 w-2 rounded-full bg-up/70" />
          <span className="eyebrow ml-2 text-[10px] tracking-[0.15em] text-ink-faint">ELSTAND AI TERMINAL</span>
          <span className="live-dot ml-auto bg-up" />
          <span className="mono-num text-[10px] text-ink-faint">LIVE</span>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {/* Heatmap swatch */}
          <div className="grid grid-cols-4 gap-1.5">
            {HEAT_CELLS.map((cell) => (
              <div
                key={cell.symbol}
                className={`rounded-md border px-1.5 py-2 text-center ${
                  cell.up ? "border-up/30 bg-up/10" : "border-down/30 bg-down/10"
                }`}
              >
                <p className="mono-num text-[10px] font-semibold text-ink">{cell.symbol}</p>
                <p className={`mono-num text-[10px] ${cell.up ? "text-up" : "text-down"}`}>
                  {cell.up ? "+" : ""}
                  {cell.pct}%
                </p>
              </div>
            ))}
          </div>

          {/* Sparkline */}
          <div className="panel px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ink-muted">BTC/USDT · 4H</span>
              <span className="mono-num text-[11px] text-up">+2.4%</span>
            </div>
            <svg viewBox="0 0 240 56" className="mt-1.5 h-10 w-full" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                points="0,40 20,38 40,42 60,30 80,33 100,22 120,26 140,16 160,20 180,10 200,14 220,6 240,9"
                fill="none"
                stroke="#22C55E"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Sample AI signal card */}
          <div className="rounded-lg border border-signal/30 bg-signal/5 p-3.5 shadow-glow-signal">
            <div className="flex items-center justify-between">
              <span className="eyebrow text-[10px] tracking-[0.15em] text-ink-faint">SAMPLE · AI SIGNAL</span>
              <span className="rounded-full bg-up/15 px-2 py-0.5 text-[10px] font-medium text-up">Bullish</span>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-ink-faint">Support</p>
                <p className="mono-num text-xs text-ink">$108,400</p>
              </div>
              <div>
                <p className="text-[10px] text-ink-faint">Resistance</p>
                <p className="mono-num text-xs text-ink">$114,200</p>
              </div>
              <div>
                <p className="text-[10px] text-ink-faint">Risk</p>
                <p className="mono-num text-xs text-amber">Medium</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
