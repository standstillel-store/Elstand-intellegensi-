# ELSTAND INTELLIGENCE — ElVoid AI Crypto Terminal

A dark, terminal-styled crypto intelligence dashboard: a live crypto
heatmap, AI trade signals with a full reasoning breakdown, a rule-based
pump/dump/rugpull/smart-money Token Scanner, whale flow, funding rates,
market sentiment, an economic calendar, and **ElVoid AI Paper Trader** — a
transparent signal engine with a full paper-trading simulator — aggregated
from free public APIs. Built with Next.js 14 (App Router) + TypeScript +
Tailwind + Framer Motion + Supabase.

## Before you launch this publicly — please read

**No system — this one included — can reliably predict which coin will 10x
or 100x, or whether a signal will hit Take Profit or Stop Loss.** Crypto
markets are driven by hype, liquidity, and sometimes outright manipulation.
What this app actually does is surface **transparent, rule-based signals**
from public data — a research aid and a paper-trading sandbox, not a
crystal ball.

If you plan to share this with other people:
- Keep every "not financial advice" / "paper trading only" disclaimer
  visible (they're already in the UI — please don't remove them).
- Don't market scores or ElVoid AI signals as guarantees. A signal with 78%
  confidence should read as "worth a closer look," never as "will win."
- **ElVoid AI Paper Trader never touches real funds and is never connected
  to a real exchange.** It's a simulation with a virtual wallet — keep it
  that way if you extend it. **Portfolio** is the same paper wallet viewed
  through an allocation lens, not a real wallet-connect integration.
  **Live Trading is a separate feature** (see below) that does place real
  orders against Binance Testnet or Live — don't confuse the two pages.
- The rugpull-risk heuristic is a starting point (liquidity ratios, pool
  age, whale exits, negative news), not a security audit. Always tell users
  to verify independently (check contract, liquidity lock, team, audits).
- The **SMT (Smart Money Divergence)** reasoning line is an intentionally
  simplified proxy — it compares 24h/7d relative strength against BTC,
  not a full cross-pair swing-structure comparison. It's labeled clearly in
  the UI so it's never mistaken for more precision than it has.
- **DXY** on the Market Overview strip is the Fed's Broad Trade-Weighted
  USD Index (FRED series `DTWEXBGS`), used as a free proxy for the ICE US
  Dollar Index — not the literal DXY ticker. Labeled as such in the UI.
- **Trade Grade (A+/A/B/C)** and **Probability TP/SL** are both derived
  from Confidence and (when enough history exists) strategy calibration —
  not a separately trained model, and not a promise. Please keep them
  framed as estimates in any UI copy you add.
- **Alerts** are recomputed from the live snapshot every time the bell
  polls (~60s) — there's no persisted alert history or push-notification
  delivery. A closed browser tab means no alerts are seen until it's
  reopened.

## Security note on API keys

Whatever keys you use, keep them only in `.env.local` (already git-ignored)
and never in client-side code or anything you commit/share. If any key was
ever typed into a chat conversation, treat it as potentially exposed and
rotate it from the provider's dashboard before relying on this in
production.

## What's wired up

| Source | Used for | Key needed? |
|---|---|---|
| CoinGecko | Market data, prices, market cap, 1h/24h/7d change | No |
| Binance Futures | Funding rate, open interest, and OHLCV candles (ElVoid AI) | No |
| Alternative.me | Fear & Greed index | No |
| GeckoTerminal | DEX volume, liquidity & FDV (eth, bsc, solana, base, arbitrum) | No |
| DefiLlama | Stablecoin Supply market-overview card | No |
| FRED (St. Louis Fed) | DXY (Broad USD Index proxy) & M2 Money Supply | Yes — free |
| Alchemy | Whale transfer feed (curated ERC-20 watchlist) | Yes — free tier |
| NewsAPI.org | News feed, feeds rugpull "negative press" + ElVoid AI News Sentiment | Yes — free tier (localhost only; use a paid tier or GNews for production) |
| ForexFactory calendar feed | Economic calendar (FOMC/CPI/NFP-style high-impact events) | No |
| Supabase | Persistence for ElVoid AI Paper Trader (signals, journal, statistics, wallet, trade screenshots) | Yes — free tier |
| Binance Spot/Futures Testnet (or Live) | **Live Trading** page — real account balance, positions, orders, and order execution | Yes — free Testnet key |

Everything degrades gracefully: if a key is missing or an API call fails,
that widget just shows an empty/"not configured" state instead of crashing
the page. `FRED_API_KEY` is the only genuinely optional one — without it the
DXY and M2 cards simply show a placeholder.

## Binance Testnet/Live Trading Engine (Live Trading page)

A separate page (`/trading`, sidebar → **Live Trading**) that connects to
your own Binance account via API key and places real orders — on Binance's
**Testnet** by default (free fake funds, real order matching engine), or
**Live** if you deliberately set `BINANCE_MODE=live`. Everything here is
new code under `lib/binance/*` and `app/api/binance/*`; it doesn't touch
the existing `lib/binance.ts` (the key-less public market-data feed the
rest of the dashboard already used for funding/OI/candles).

**Setup**
1. Create a free key at [testnet.binancefuture.com](https://testnet.binancefuture.com)
   (Futures — recommended, this is what Long/Short/leverage/trailing-stop
   need) or [testnet.binance.vision](https://testnet.binance.vision) (Spot).
2. Add `BINANCE_API_KEY` / `BINANCE_SECRET_KEY` to `.env.local` (see the
   table in `.env.local.example` for `BINANCE_MODE` / `BINANCE_MARKET`).
3. Run `supabase/schema.sql` again (it's additive — safe to re-run) to get
   the `bn_*` tables the Auto Trader, order audit log, and position
   metadata need. Without Supabase, manual trading still works fully; only
   AI Auto Trading and the decision journal need it.
4. Open `/trading`. Auto Trading is **off** by default — turn it on
   explicitly from the AI Auto Trading tab once you're ready.

**What it can do**
- Read: account balance, open positions (with live PnL & liquidation
  price), open orders, order history, trade history, current price,
  candlesticks, order book — all live from your Testnet/Live account.
- Trade: Market, Limit, Stop (stop-limit), Stop Market, Take Profit
  (limit), Take Profit Market, Trailing Stop — Open Long / Open Short,
  cancel order, close a position (full or partial), Emergency Close All
  Positions (also pauses Auto Trading).
- Manage a position: Move SL to Break Even, Partial/Multiple Take Profit
  (two native Binance conditional orders — a partial reduce-only TP1, a
  `closePosition` TP2 that mops up the remainder), Scale Out (partial
  close), Dynamic SL/TP.
- Risk: every entry is sized from **Risk % → position size**, hard-capped
  at 1% of account equity — the order is rejected, not silently resized,
  if it can't be sized within that cap after exchange lot-size rounding.
  See `lib/binance/riskManager.ts`.
- AI Auto Trading: once a minute (client-side while the dashboard is open —
  see the cron note below), it re-runs the **same ElVoid AI scan/signal
  engine** the rest of the app uses (`lib/elvoid/engine.ts` — RSI, EMA
  20/50/200, market structure, liquidity sweep, order block, FVG, funding,
  open interest, SMT divergence, MACD, news sentiment, whale activity,
  ...), fed with live candles from your actual trading venue. A trade only
  opens if it clears **two hard gates**: at least 5 scanners agreeing on
  direction, and Risk:Reward ≥ 1:3 (otherwise the tick logs "NO TRADE" and
  moves on — it never forces an entry). Every open position is re-evaluated
  the same way, plus Auto Exit checks (structure break, CHOCH, order-flow
  reversal via Binance's own taker-buy/sell kline field, EMA misalignment,
  liquidity sweep against the position, and a combined
  News+PriceAction+Structure+OrderFlow reversal check — sentiment alone
  never closes a trade). See `lib/binance/autoTrader.ts` and
  `lib/binance/exitConditions.ts`.
- Every AI decision (entry, rejection, exit, breakeven) is written to
  `bn_auto_trader_log` and shown in the Decision Journal — nothing happens
  silently.

**Cron note.** The Trading Dashboard polls
`/api/binance/auto-trade/tick` client-side once a minute while open — Auto
Trading works out of the box on any host/plan with no extra setup. For a
server-side heartbeat that runs even with the dashboard closed, Vercel Cron
can also hit that route, but **per-minute cadence requires Vercel Pro**
(Hobby only allows once-a-day cron and will refuse to deploy `* * * * *`).
Pro users can add a `crons` entry to `vercel.json` themselves; anyone else
can point an external scheduler (cron-job.org, GitHub Actions, ...) at the
same URL with an `Authorization: Bearer $CRON_SECRET` header.

**Security.** API secret never reaches the browser — every signed Binance
call happens in a server Route Handler. The recommended setup is plain env
vars (never touch a database); Settings → **Binance Trading API** offers an
optional AES-256-GCM-encrypted database-stored alternative (behind
`ENCRYPTION_KEY`) for rotating keys without a redeploy. Every order gets a
unique client order ID, a short double-submit cooldown, and a per-symbol
in-process lock so two near-simultaneous requests can't double an entry.

**Honest scope notes, in the same spirit as the disclaimers above:**
- The AI Auto Trader is a **rule-based technical-analysis system**, not a
  trained ML model and not a profitability guarantee — same caveat as
  every ElVoid AI signal elsewhere in this app.
- The estimated liquidation price (shown pre-trade, in the Risk Panel) uses
  Binance's real per-symbol maintenance-margin brackets but the standard
  single-position/isolated-margin/no-added-margin/no-funding
  simplification every retail tool makes — Binance's own `liquidationPrice`
  field on an already-open position is always the authoritative number,
  and that's what the Positions table displays.
- "Order Flow" is a proxy built from Binance kline data's own taker-buy/sell
  volume field (real exchange data), not raw tick-by-tick footprint data.
- One-way position mode is assumed (one net position per symbol) — Binance
  hedge mode (simultaneous Long+Short on one symbol) isn't supported.
- In Spot mode (`BINANCE_MARKET=spot`), the Order Panel switches to plain
  Buy/Sell (no leverage, no SL/TP bracket auto-attach — place a separate
  Stop/Take-Profit order afterward if wanted), and the Positions / Risk /
  AI Auto Trading tabs show a clear "Futures only" note instead of
  attempting something that doesn't apply to Spot — balances, market data,
  and manual order placement/cancellation work fully either way.

## What's new in the AI Trading Terminal upgrade (2026-07, part 2)

- **Live chart on AI Signal** — the `/ai-signal` page now opens on a **Chart
  Analysis** tab (the old watchlist-scan UI moved to a **Watchlist Signals**
  tab, unchanged): a Lightweight Charts candlestick + volume chart with
  EMA20/EMA50, six timeframes (1m/5m/15m/1H/4H/1D), and live updates via
  Binance's public kline WebSocket (no key needed). ElVoid AI draws Entry
  (🟢), Stop Loss (🔴), TP1 (🟣), TP2 (🟡), and TP3 (🔵) directly on the chart
  as price lines.
- **MACD** joins the scanner set, and **Stablecoin Flow** (market-wide, from
  the same DefiLlama source as the Market Overview card) is now a reasoning
  line too — both presentational-only, same rule as the other extended
  scanners (see `lib/elvoid/scanners.ts`).
- **Trade Grade (A+/A/B/C)** and **Probability TP / Probability SL** are new
  fields on every signal — both pure re-reads of Confidence + corroboration
  count + strategy-calibration history, never a separate model. See the
  doc-comments on `computeTradeGrade`/`estimateProbabilities` in
  `lib/elvoid/engine.ts` for exactly how each is derived, and please keep
  the "estimate, not a guarantee" framing if you extend these.
- **"Analisis BTC" in ElVoid AI Chat** now replies with a **Buka Chart**
  button that opens the Chart Analysis tab for that symbol, live-drawn setup
  included — both the floating dock and the inline right-rail panel support
  this (`lib/hooks/useElVoidChat.ts`'s `ChatAction` type).
- **Market / Limit / Stop orders** — Paper Trader now supports all three.
  Market fills immediately (unchanged). Limit and Stop go to a new
  **Pending Orders** table until price actually reaches the trigger
  (checked on every Sync) or 48h passes (auto-expires). See the doc-comment
  on `evaluatePendingOrders` in `lib/elvoid/paperTrader.ts` for the exact
  trigger formulas — both are derived from the signal's own entry/sl, no
  extra price column needed.
- **AI Auto-Execute** (Settings, off by default) — when enabled, freshly
  scanned signals meeting a chosen minimum Trade Grade are automatically
  opened as Market orders. Opt-in, and always visible in Settings with the
  exact grade threshold shown.
- **Post-trade AI Review** — every closed trade in AI Journal now gets a
  short, rule-based "why it won/lost, mistakes, recommendations" readout
  (`lib/elvoid/review.ts`) generated from the trade's own recorded data
  (confidence, duration, realized R:R, which reasoning categories fired at
  entry) — no LLM, same philosophy as everything else here.
- **AI Learning** is more visible now: the Performance tab shows how many
  closed trades the strategy calibration is based on, plus new Average Hold
  Time and Average Confidence stats.
- **Alerts** — a bell icon in the top nav (every page) surfaces Liquidity
  Sweep / BOS-CHoCH from live signals, large whale transfers, extreme
  funding rates, and directional news, refreshed every 60s
  (`lib/alerts.ts`, `/api/alerts`). These are recomputed from the live
  snapshot each time, not a persisted/pushed notification system.
- **Performance**: the chart is loaded via `next/dynamic({ ssr: false })`
  (`components/ai-signal-pro/ChartAnalysisView.tsx`) since Lightweight
  Charts needs a real DOM/canvas and has no reason to be in the initial
  server-rendered bundle.

## What's new in the terminal redesign (2026-07, part 1)

- **Top Navigation** — logo, ElVoid AI search (type a symbol to open the
  Token Analyzer from anywhere), live BTC/ETH/SOL ticker, profile menu.
  Global, on every page (`components/layout/TopNav.tsx`).
- **Market Overview strip** — Fear & Greed, BTC Dominance, Altseason Index,
  Total Market Cap, Macro Event, Stablecoin Supply, DXY, M2 — eight cards,
  always visible, no accordion.
- **Crypto Heatmap** — a big, central, bucketed-treemap heatmap. Green =
  bullish, red = bearish, purple = high rugpull risk, blue = smart-money
  accumulation. Click any tile to open the Token Analyzer.
- **Token Analyzer** — a slide-over drawer (`components/token-analyzer/`)
  with price, liquidity, FDV, volume, Pump/Dump/Rugpull/Smart Money scores,
  AI summary, news, and related economic-calendar events. Opens from the
  heatmap, the Token Scanner, or the search bar.
- **AI Signal Panel redesign** — LONG/SHORT, Confidence, Entry, SL,
  TP1/TP2/TP3, RR per target, Timeframe, Status (Running/Win/Loss), and a
  10-item **AI Reasoning** checklist (Support/Resistance, Order Block,
  Liquidity Sweep, SMT, BOS/CHoCH, Fair Value Gap, Volume Confirmation,
  Funding, Open Interest, Whale Flow) — `components/ai-signal-pro/SignalCardPro.tsx`.
- **Token Scanner** — 7 live categories: Top Pump Candidate, Top Dump
  Candidate, Top Rugpull Risk, Smart Money Accumulation, High Momentum,
  Whale Buying, Whale Selling (`lib/scanner-categories.ts`, `/scanner`).
- **Paper Trader** — added explicit Max Drawdown / Total Trade stat cards
  and a trade **screenshot** field (Supabase Storage — see setup below).
- **AI Journal** — now has a Performance tab (merged from the old
  `/ai-performance` page) plus strategy and timeframe filters and inline
  screenshot viewing.
- **Portfolio** (`/portfolio`) — new page: an allocation view over the
  Paper Trader wallet's open positions.
- Framer Motion throughout: live-updating numbers, card hover glow, loading
  skeletons, staggered entrance animation, animated confidence/score bars.

## AI chat dock — free, no LLM API

The chat — both the floating dock on every page and the inline **ElVoid AI
Chat** panel on the Home dashboard's right rail — runs entirely on this
app's own **rule-based Intelligence Engine** (`lib/analysis.ts`): it reads
the same live snapshot the dashboard renders and turns it into a structured
answer — Market Summary, Whale Activity, Risk Analysis, Momentum, News
Impact, Final Conclusion — with **zero API cost and no key required**. Ask
it things like "analisa BTC", "whale activity", "risk tertinggi", or
"ringkasan market". Both surfaces share one hook (`lib/hooks/useElVoidChat.ts`)
so there's a single source of truth for the chat logic.

It does not use a language model, so it won't handle open-ended conversation
the way ChatGPT would — it's an interpreter over the data, not a chatbot.
That's the tradeoff for keeping it free. ElVoid AI Paper Trader's signal
engine follows the exact same philosophy: plain, explainable rules over live
data, no black box, no per-request LLM cost.

## Setup

```bash
npm install
cp .env.local.example .env.local
# open .env.local and fill in the keys you want (see table above) —
# CoinGecko/Binance/Fear&Greed/GeckoTerminal/ForexFactory/DefiLlama work with no key
npm run dev
```

Open http://localhost:3000.

### Setting up Supabase for ElVoid AI Paper Trader & AI Journal

Without Supabase, Paper Trader still generates signals and computes trades
for a single session, but nothing is remembered after a server restart.
To persist it:

1. Create a free project at https://supabase.com.
2. Open the SQL Editor and run the contents of `supabase/schema.sql` once —
   it creates `ai_signals`, `ai_journal`, `ai_statistics`, and
   `paper_wallet`, and is safe to re-run (including on a database created
   before this redesign — the `alter table ... add column if not exists`
   lines backfill `tp3`, `timeframe`, `scans`, `extra_reasoning`, and
   `screenshot_url`).
3. In your Supabase project settings, copy the **Project URL** and the
   **service_role key** (Settings → API).
4. Add them to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
5. **For trade screenshots**: in the Supabase dashboard, go to Storage →
   New bucket → name it `trade-screenshots` → set it **Public**. No policy
   setup needed — uploads go through `/api/paper-trader/journal/screenshot`,
   a server route using the service-role key.
6. Restart `npm run dev`. Check **Settings** in the app — it shows live
   connection status for Supabase, Alchemy, NewsAPI, and FRED without
   exposing any key.

The service-role key is used **server-side only** (Route Handlers / Server
Components) and bypasses Row Level Security by design — never expose it to
the browser or use the anon key for these tables. See the RLS note at the
bottom of `supabase/schema.sql`.

### Optional: FRED for DXY & M2

1. Register a free key at https://fred.stlouisfed.org/docs/api/api_key.html.
2. Add `FRED_API_KEY=your-key` to `.env.local`.
3. Without it, the DXY and M2 cards on the Market Overview strip show a
   "belum dikonfigurasi" placeholder instead of breaking.

## Deploying

This is a standard Next.js app, so it deploys as-is to Vercel, Railway,
Render, or any Node host:

```bash
npm run build
npm start
```

On Vercel: push to a git repo, import it, and add the same environment
variables from `.env.local` in the project's Settings → Environment
Variables (never commit the real `.env.local` file itself).

Note: the in-memory cache in `lib/cache.ts` helps most on a long-running
server. On serverless platforms, each cold start gets a fresh cache, so
you'll lean more on the free tiers' own rate limits — the numbers used here
(45–120s TTLs; 6–12h for the slow-moving DXY/M2 macro series) are
conservative but adjust if you hit limits.

## Project structure

```
app/
  page.tsx                Home dashboard — desktop terminal layout + MobileHome
  layout.tsx               Root layout, fonts, metadata, Token Analyzer provider
  globals.css               Terminal theme, glow/skeleton/heatmap primitives
  ai-signal/                 AI Signal scanner page
  paper-trader/               ElVoid AI Paper Trader dashboard
  ai-journal/                  Trade history + Performance tabs
  ai-performance/                Redirects to /ai-journal (merged in 2026-07)
  scanner/                         Token Scanner — 7 live categories
  portfolio/                        Paper wallet allocation view
  whale/                              Full whale transfer feed, buy/sell split
  news/                                Full news feed with sentiment filter
  economic-calendar/                    Full week of macro events
  settings/                              Risk %, integration status, reset
  trading/                                Live Trading — Binance Testnet/Live dashboard
  methodology/                            How scoring + ElVoid AI works
  api/
    ticker/                                          BTC/ETH/SOL for TopNav
    klines/                                            Candle data for the AI Signal chart
    market/ funding/ feargreed/ dex/ news/ whales/    Data source proxies
    pump-candidates/ rugpull-risk/                    Combined + scored lists
    alerts/                                           Liquidity sweep/whale/funding/news alerts
    chat/                                             Rule-based AI chat (+ open_chart action)
    ai-signals/ (+ scan/ + analyze-chart/)              Generate/list/analyze signals
    paper-trader/ (wallet/ execute/ cancel/ close/       Paper trading engine — Market/Limit/Stop
                   sync/ reset/ stats/ journal/screenshot/) orders, screenshots
    ai-journal/                                        Journal entries
    ai-performance/                                    Analytics report
    settings/status/                                   Integration status
    token-analysis/                                     Token Analyzer data
    binance/ (status/ account/ positions/ orders/        Live Trading — real Binance Testnet/Live
              trades/ price/ klines/ orderbook/ order/     account, order execution, risk calc,
              position/close/ position/close-all/           AI Auto Trader tick + settings + log
              leverage/ risk/calculate/ trailing-stop/
              breakeven/ auto-trade/ auto-trade/tick/
              auto-trade/log/ emergency-stop/ credentials/)
components/
  layout/                 TopNav (global top bar)
  ui/                      GlowCard, Badge, LiveDot, Skeleton, AnimatedNumber
  heatmap/                  CryptoHeatmap
  token-analyzer/            Context + slide-over drawer
  market/                     MarketOverviewStrip
  ai-signal-pro/                SignalCardPro, TradingChart (Lightweight Charts),
                                ChartAnalysisView (chart + AI reasoning + order entry)
  alerts/                        AlertsBell (top nav notification dropdown)
  right-rail/                    ElVoid AI Chat, AI Summary, Macro/Whale Alert,
                                  Economic Calendar mini, Breaking News mini
  scanner/                         Token Scanner teaser (Home) + full view
  portfolio/                        Allocation view
  whale/                              Whale Activity view (buy/sell split)
  paper-trader/ ai-journal/ ai-performance/ settings/ news/  Feature components
  trading/                                                     Live Trading dashboard widgets
                                                                 (Order Panel, Positions, Risk,
                                                                  AI Auto Trader, Emergency Controls)
lib/                      API clients, types, formatting, scoring engine
  elvoid/                 ElVoid AI: scanners, engine, paper trading, math, review
  binance/                 Live Trading Engine: signed Spot/Futures Testnet/Live client,
                             risk manager, order guard, auto-trader, exit conditions, news gate
  scanner-categories.ts    Token Scanner's 7 categories (dump/momentum/whale/smart money)
  stablecoins.ts            DefiLlama stablecoin supply
  macro.ts                   FRED DXY-proxy & M2
  alerts.ts                   Liquidity sweep/BOS-CHoCH/whale/funding/news alert detection
  dashboardSnapshot.ts         Aggregates everything the Home dashboard needs
  hooks/useElVoidChat.ts        Shared chat hook (dock + inline panel + chart action)
  hooks/useBinanceTrading.ts     Live Trading dashboard's data + actions hook
supabase/
  schema.sql              Run once in the Supabase SQL editor (includes bn_* Binance tables)
```

## Extending the scoring engine

The Token Scanner's pump/rugpull/dump/smart-money "intelligence" lives in
`lib/scoring.ts` and `lib/scanner-categories.ts` — plain functions that take
arrays of already-fetched data and return a scored, sorted, reasoned list.
No black box: every point added to a score has a comment explaining why.

ElVoid AI Paper Trader's engine lives in `lib/elvoid/`:
- `indicators.ts` — EMA/RSI/ATR/MACD, swing points, support/resistance clustering, trend, volume anomaly.
- `scanners.ts` — the original 9 directional scan categories (feed Confidence) plus 7 extended,
  presentational-only reasoning scanners (Fair Value Gap, Order Block, Funding, Open Interest, SMT,
  MACD, Stablecoin Flow) that power the AI Reasoning checklist without touching the confidence math.
- `engine.ts` — orchestrates the scanners into a LONG/SHORT signal with Entry/SL/TP1/TP2/TP3/Confidence/
  Trade Grade/Probability TP/SL.
- `paperTrader.ts` — wallet, Market/Limit/Stop order lifecycle, pending-order triggers, TP/SL evaluation, statistics.
- `review.ts` — rule-based post-trade "why it won/lost" generator for AI Journal.
- `performance.ts` — strategy/coin/setup analytics, hold-time/confidence averages, and the confidence-calibration feed.
- `service.ts` — wires live data sources (including BTC's own change % for SMT and stablecoin flow)
  into the engine for one coin at any timeframe, or the whole watchlist at 4h.

That's the first place to look if you want to tune weights, add new
scanners, or adjust thresholds.

## What's intentionally left as an MVP

- **Rugpull detection** doesn't yet check holder concentration or contract
  verification/honeypot status — those need extra on-chain calls per token.
  Token Analyzer's **Holders** and **Next Unlock** fields are left `null`
  (never a fabricated number) until a provider is wired in.
- **SMT (Smart Money Divergence)** is a simplified 24h/7d-vs-BTC proxy, not
  a full cross-pair swing-structure comparison — see the note at the top of
  this README.
- **Liquidation Heatmap** was requested but isn't wired up — every free
  liquidation-heatmap source (Coinglass, etc.) requires a paid API tier, and
  this app's rule is to never fabricate placeholder data. Settings will show
  a "not connected" state if you add this later.
- **Open Interest** alerts/reasoning use a single snapshot value (no OI
  history), so they only ever say "OI is large and lines up with the
  current move" — never "OI is rising/falling", which would need historical
  OI data this app doesn't fetch.
- **Stop order trigger** and **Probability TP/SL** are both intentionally
  simple, documented formulas (see the doc-comments in
  `lib/elvoid/paperTrader.ts` and `lib/elvoid/engine.ts`) rather than a
  learned model — consistent with this app's "plain, explainable rules"
  approach, but worth knowing if you're tuning them.
- **Whale feed** watches a small starter list of major ERC-20 contracts on
  Ethereum mainnet — extend `lib/alchemy.ts`'s `WATCHLIST`, or add another
  Alchemy network URL, to cover more chains/tokens.
- **ElVoid AI's watchlist** (`lib/elvoid/watchlist.ts`) covers 15 liquid
  Binance Futures pairs — add symbols there to scan more coins, as long as
  they have a `<SYMBOL>USDT` pair on Binance Futures.
- **Paper Trader position sizing** is risk-based (risk % of equity ÷ stop
  distance) rather than fixed lot sizes — realistic for comparing setups,
  but doesn't model slippage, fees, or partial fills beyond the TP1→breakeven
  rule.
- **Portfolio** reflects the paper-trading wallet only — there's no real
  exchange or on-chain wallet-connect integration in this app.
