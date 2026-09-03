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
| Groq + OpenRouter (free models) | AI Router for free-text chat questions — see "AI chat dock" below | Optional — free tier, no card |

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

## AI chat dock — free, no paid LLM API

The chat — both the floating dock on every page and the inline **ElVoid AI
Chat** panel on the Home dashboard's right rail — still runs structured
questions ("analisa BTC", "whale activity", "risk tertinggi", "ringkasan
market") entirely on this app's own **rule-based Intelligence Engine**
(`lib/analysis.ts`): it reads the same live snapshot the dashboard renders
and turns it into a structured answer — Market Summary, Whale Activity, Risk
Analysis, Momentum, News Impact, Final Conclusion — with **zero API cost and
no key required**. Both surfaces share one hook (`lib/hooks/useElVoidChat.ts`)
so there's a single source of truth for the chat logic.

**Phase 3.0 — AI Router (`lib/ai/router.ts`):** free-text questions the
Intelligence Engine doesn't recognize now get a real conversational reply
via a small router instead of falling straight to a market snapshot:

```
User message
   -> Groq (retry once on failure)
   -> OpenRouter, walking a priority list of FREE models (Qwen -> Mistral -> Llama -> one extra free fallback)
   -> if every attempt fails: "AI sedang sibuk. Silakan coba beberapa saat lagi."
```

- **Free only, by design.** No Gemini, Claude, GPT, or any paid API is ever
  called by this router — only Groq's and OpenRouter's free tiers. The
  optional paid providers in `lib/ai/provider.ts` (OpenAI/Claude/Gemini/
  DeepSeek/local) still exist for anyone who explicitly sets
  `AI_CHAT_PROVIDER` to one of them, but they're dormant otherwise — adding
  one later is a config change, not a rewrite.
- **Auto-failover is invisible.** Which provider answered is only ever
  written to the server console (`[AI Router] Provider: ...`), never
  returned to the browser.
- **15s timeout per attempt**, one retry on Groq, then OpenRouter's free
  models are tried in order — a stale/retired free-model id just fails fast
  and moves to the next one.
- **30-60s response cache** (`AI_ROUTER_CACHE_TTL_MS`, default 45s) keyed on
  the message text, so identical/duplicate questions in a short window don't
  re-hit any API.
- **Zero-config default unchanged:** with no `GROQ_API_KEY` or
  `OPENROUTER_API_KEY` set at all, free-text questions fall back to the same
  free rule-based market snapshot as before this phase — nothing breaks for
  anyone who hasn't added the keys yet.
- **Streaming (optional, additive):** `app/api/chat/stream/route.ts` exposes
  the same router as a real Server-Sent-Events endpoint for a future
  frontend to adopt. The current chat UI (dock/panel/mobile bar) is
  untouched and still calls the plain JSON `/api/chat` endpoint.

To enable it, add to `.env.local`:
```
GROQ_API_KEY=your-groq-key           # https://console.groq.com — free, no card
OPENROUTER_API_KEY=your-openrouter-key  # https://openrouter.ai — free, no card
```
Both are optional and independent — set just one and the router simply
skips the other. Advanced overrides (rarely needed): `GROQ_MODEL` (default
`openai/gpt-oss-120b`), `OPENROUTER_FREE_MODELS` (comma-separated, default
is the Qwen/Mistral/Llama/Nemotron list above — OpenRouter's free lineup
rotates over time, so this is the one thing worth revisiting occasionally).

Without an LLM configured, chat still won't handle open-ended conversation
the way ChatGPT would for free-text questions — it's an interpreter over the
data. ElVoid AI Paper Trader's signal engine follows the same rules-first
philosophy and is untouched by this phase: plain, explainable rules over
live data, no black box.

## ELVOID PRO ORACLE — Cognitive Layer (Phase 8.0.1 / 8.0.2 / 8.0.3 / 8.0.4 / 8.0.5)

`app/api/elvoid-pro/oracle/route.ts` runs a deterministic pipeline — real
market data in, a canonical trading decision out:

```
Market/Data Layer
        v
Deterministic Oracle Analysis (confluence -> risk plan -> grading)
        v
Canonical Oracle Decision (OracleAssessment: side/grade/confidence/riskStatus)
        v
Scenario (7.5) / Contradiction (7.6) / Arbitration (7.7) / Risk Intelligence (7.8)
        v
Cognitive Observation (Phase 8.0.1 — read-only)
        v
Cognitive Working Memory (Phase 8.0.2 — request-scoped, internal-only)
        v
Cognitive Hypothesis Engine (Phase 8.0.3 — deterministic reframing, public)
        v
Cognitive Conflict Resolution (Phase 8.0.4 — coherence classification, public summary)
        v
Cognitive Decision Context (Phase 8.0.5 — internal assembly only)
        v
Decision Outcome Capture (NEW, Phase 8.1.0 — decision-time snapshot into
                           the isolated ELVOID Learning Database)
        v
Future Evaluation / Learning / Agent layers
        v
Optional LLM Narrative (Phase 7.9 Reasoning)
```

The **Cognitive Layer** (`lib/ai/cognitive/`) is a downstream,
context-only observer of that pipeline. It never overrides, mutates, or
duplicates the canonical decision, never fetches data or calls an LLM
itself, and its failure never breaks the Oracle route.

- **Phase 8.0.1 — Cognitive Observation.** A `CognitiveObservation` is an
  immutable snapshot answering one question: *"what does the Oracle
  already know right now?"* — it is a copy of the canonical assessment's
  key fields, the same normalized evidence the pipeline already computed,
  which context modules (MTF/regime/liquidity/scenarios/contradictions/
  arbitration/risk intelligence) were actually available, and an honest
  aggregate quality (`real` / `mixed` / `degraded` / `unavailable`). It is
  not a trading signal, not a second decision engine, and not an LLM
  opinion.
- **Phase 8.0.2 — Cognitive Working Memory** (`lib/ai/cognitive/memory.ts`).
  A minimal, **request-scoped**, in-process state container built from a
  `CognitiveObservation` — nothing more. Purely functional and
  immutable/append-only: `createWorkingMemory(observation)` builds an
  initial `{ observation, notes: [] }` value, and `appendMemoryEntry(memory,
  entry)` returns a brand-new memory value with the entry appended, never
  mutating the one passed in. It exists **only** for the duration of a
  single Oracle request — there is no module-level `Map`/`Set`/singleton
  anywhere in `memory.ts`, no persistence, no database, no cache, and no
  sharing across requests or users. It remains **internal-only
  infrastructure**: `route.ts` builds it defensively after
  `cognitiveObservation`, but it is deliberately **not** included in the
  API's JSON response.
- **Phase 8.0.3 — Cognitive Hypothesis Engine** (`lib/ai/cognitive/hypothesis.ts`).
  A **thin, deterministic reframing layer** over the Scenario (7.5),
  Contradiction (7.6), and Arbitration (7.7) modules — not a second
  confluence/grading/signal engine, and not an LLM. `buildHypotheses()`
  reuses `Scenario.thesis`/`direction`/`supportingEvidence`/
  `opposingEvidence` verbatim, reuses `arbitration.alignment` to derive
  each hypothesis's `status` (`ACTIVE`/`SUPPORTED`/`CHALLENGED`/
  `REJECTED`), and reuses `firingClustersFor()` (evidence.ts) plus
  `contradictions.hasUnresolvedGenuineContradiction` to derive each
  hypothesis's `uncertainty` (`LOW`/`MEDIUM`/`HIGH` — deliberately never a
  number, and never a reuse or rename of `assessment.confidence`). At most
  **3 hypotheses** are ever produced, from exactly 3 possible generation
  paths (`scenario_primary`, `scenario_alternative`, and an optional
  `contradiction`-origin hypothesis for a genuinely unresolved, non-
  duplicate contradiction) — never one per evidence item, never a ranked-
  and-truncated pool. Proxy/unavailable-quality backing evidence can only
  ever push `uncertainty` toward `HIGH`, never `LOW`. No hypothesis ever
  carries an `entry`/`stopLoss`/`takeProfit`/`order`/`positionSize` field —
  a hypothesis is an interpretation, never an execution instruction. Pure,
  synchronous, zero LLM/network/database calls; `reasoning.ts` stays
  untouched and does not read hypotheses in this phase. Unlike Working
  Memory, `hypotheses` **is** included in the API's JSON response — it has
  a plausible frontend audience Working Memory doesn't.
- **Phase 8.0.4 — Cognitive Conflict Resolution** (`lib/ai/cognitive/conflict.ts`).
  A **meta-resolution layer**, not a decision engine — it answers *"how
  coherent is the intelligence system's own interpretation right now,"*
  never *"which market direction is correct."* `resolveCognitiveConflict()`
  classifies the current cycle into exactly one of four bounded states —
  `INSUFFICIENT_CONTEXT` / `CONFLICTED` / `CAUTIOUS` / `CONSISTENT` — via a
  deterministic, first-match-wins precedence table (no weighted scoring, no
  voting, no confidence averaging). It reuses
  `contradictions.hasUnresolvedGenuineContradiction` and
  `arbitration.alignment`/`.alternativeIsActiveOpposition` **directly**,
  never rescanning raw contradiction/evidence data and never re-deriving
  arbitration's own logic. **Conflict is not risk**: `riskIntelligence.overall`
  and `.factors` are never read here at all — only
  `riskIntelligence.contextQuality` (for the `INSUFFICIENT_CONTEXT` tier).
  A `HIGH`-risk, contradiction-free, strongly-supported cycle correctly
  resolves to `CONSISTENT`, not `CONFLICTED` — volatility/invalidation-
  distance danger and internal intelligence disagreement are different
  questions and are kept strictly separate. **Conflict is not per-hypothesis
  uncertainty**: `CognitiveHypothesisSet` is accepted for architectural
  completeness but is never counted or voted on — three hypotheses existing
  does not by itself imply conflict. `CognitiveWorkingMemory` is likewise
  accepted but carries no independent authority — it is pure transport, per
  Phase 8.0.2's own design. `CONFLICTED` specifically requires a
  **conjunction**: a genuine unresolved contradiction *and* either a
  `CONFLICTED` arbitration alignment or active opposition from the
  alternative scenario — a lone weak signal on either side is deliberately
  insufficient. `arbitration.alignment === "NOT_APPLICABLE"` (no canonical
  side to evaluate coherence around) resolves to `INSUFFICIENT_CONTEXT` by
  explicit design, never `CAUTIOUS`. Pure, synchronous, zero LLM/network/
  database calls, zero mutation of any input. Only a summarized
  `{ state, reasons }` shape is exposed in the API response — the internal
  `contributingFactors` field-level detail stays internal-only, matching
  Working Memory's own "don't expose raw internal taxonomy" precedent.
- **Phase 8.0.5 — Cognitive Decision Context** (`lib/ai/cognitive/context.ts`).
  A pure **assembly boundary, not a thinking layer**: `buildDecisionContext()`
  bundles the already-computed `CognitiveObservation`, `CognitiveHypothesisSet`,
  the internal (untrimmed) `CognitiveConflictState`, and a narrow
  `{overall, contextQuality}` read of `RiskIntelligence` into one structured
  `CognitiveDecisionContext` object — nothing is recomputed, re-ranked,
  re-counted, or reclassified. `observation` anchors the context: if it's
  `null`, the whole function returns `null` rather than fabricating an
  empty context; every other field is independently nullable. Hypotheses
  and conflict are carried through **by reference**, unchanged — both are
  already immutable-by-contract Phase 8.0.3/8.0.4 outputs. `riskIntelligence.factors`
  never crosses this boundary — only `.overall`/`.contextQuality` are
  copied. `CognitiveWorkingMemory` is deliberately excluded — it's pure
  transport that adds no canonical intelligence beyond what `observation`
  already carries. Pure, synchronous, zero timestamps, zero LLM/network/
  database calls, zero persistence of any kind. **Internal infrastructure
  only** — like Working Memory, `decisionContext` is built defensively in
  `route.ts` but is deliberately **not** included in the API's JSON
  response, since every field it carries is already independently exposed
  elsewhere in that same response. Its purpose is solely to save a future
  downstream consumer (evaluation/learning/agent layers, not yet built)
  from having to re-thread four separate parameters itself.

## AI Signal Intelligence & Background Autonomous Runtime (Phase 8.3.0.1)

ELVOID Pro's autonomous runtime (`runAutonomousBatch()`, Phase 8.2.9)
analyzes every symbol in the existing watchlist through one shared
intelligence pipeline, decides EXECUTE/WAIT/REJECT per symbol
independently, and persists the outcome — this phase adds a bounded
**latest-state snapshot** for the new **AI Signal Intelligence** tab to
read, and a genuinely browser-independent trigger for the batch itself.

- **Snapshot storage** (`autonomous_intelligence_snapshot` table, Learning
  DB — see `supabase/learning/schema.sql`). One row per symbol, upserted
  every autonomous cycle by `lib/ai/autonomousSnapshot/repository.ts`.
  Every field is a verbatim copy of an already-computed Oracle/confluence/
  macro/event/memory value — this table computes nothing and is never a
  second decision authority. EXECUTE, WAIT, and REJECT are all persisted.
- **Read API**: `GET /api/elvoid-pro/autonomous/snapshots` returns every
  symbol's latest snapshot. Read-only — it calls
  `listAutonomousIntelligenceSnapshots()` and nothing else; loading the AI
  Signal Intelligence page never triggers a fresh Oracle analysis.
- **Background trigger, independent of the browser tab.** `vercel.json`'s
  own cron for `/api/elvoid-pro/autonomous/tick` only runs once a day —
  same Hobby-plan cron-frequency limit documented on
  `app/api/binance/auto-trade/tick` and `app/api/whale/indexer/run`
  above. That cadence does not satisfy "keeps running with the browser
  closed", so `.github/workflows/elvoid-autonomous-tick.yml` calls the
  same existing tick route on a schedule (every 15 minutes) from GitHub's
  own runners — genuinely server-side, and it works the same regardless
  of which Vercel plan is deployed underneath, so it doesn't need to wait
  on that answer. It contains no analysis/decision/execution logic of its
  own; `runAutonomousBatch()`'s existing runtime lock
  (`lib/ai/autonomousRuntime/lock.ts`) already makes an overlapping
  client-tick/GitHub-Actions/Vercel-Cron call a safe no-op. Requires two
  repo secrets — see that workflow file's header comment for setup
  (`ELVOID_PRO_BASE_URL`, `CRON_SECRET`). The client-side
  `useAutonomousRuntimeTick.ts` hook remains as an additional, optional
  foreground trigger/freshness mechanism — it is no longer the only way
  the runtime advances.
- **Known limitation, stated honestly**: GitHub Actions' free-tier
  scheduler is best-effort and can delay a queued run by several minutes
  under load — this is a GitHub platform characteristic, not a gap in
  this repo's own lock/dedup logic. If the deployment is confirmed to be
  on Vercel Pro, a tighter `vercel.json` cron entry (e.g. `*/10 * * * *`)
  can be added as a second, redundant trigger — the runtime lock makes
  that safe.
- **Mini chart** (Phase 8.3.0.1 §6, Option A): each snapshot also carries
  a small, bounded `sparkline` array — real closing prices lifted
  verbatim from that cycle's `OracleContext.candles` (the same Binance
  candles the Oracle pipeline already fetched to grade the symbol, capped
  to the most recent 24 points by `orchestrator.ts::buildSparkline()`).
  No second per-card market request, no decorative/fake line — null when
  too little real data existed that cycle.
- **Failure-mode behavior, stated explicitly** (every answer below is
  read directly off `app/api/elvoid-pro/autonomous/tick/route.ts` and
  `lib/ai/autonomousRuntime/lock.ts`, not assumed):
  - *A GitHub Actions run fires late*: harmless — the tick just runs
    whenever the request lands; no correctness impact, only cadence.
  - *Two invocations overlap* (client tick + GitHub Actions + Vercel
    Cron landing close together): the runtime lock makes the second (and
    third) call a safe no-op — `{ ran: false, reason: "already_running" }`,
    HTTP 200, no duplicate batch.
  - *The tick endpoint itself throws*: caught, returns
    `{ ok: false, ... }` at HTTP 500 — visible as a failed step in the
    GitHub Actions run log. No partial/half-written decision, since each
    symbol's cycle inside the batch is independently isolated. The next
    scheduled tick (15 minutes later) simply tries again.
  - *`CRON_SECRET` is not set on the Vercel deployment*: the route's own
    `isAuthorizedCron()` intentionally stays open in that case (documented
    in the route's own header comment, unchanged this phase) — anyone who
    knows the deployment URL could trigger a tick. Not a live-trading risk
    (paper-trade only), but worth setting `CRON_SECRET` in production.
  - *The GitHub repo secrets are not configured*: the workflow's own
    `ELVOID_PRO_BASE_URL` check fails fast with a clear log line rather
    than silently doing nothing — see the workflow file.
  - *Hobby plan's 10-second function cap*: `maxDuration = 60` on the tick
    route only takes effect on Pro+ — Hobby still hard-caps each
    invocation at 10s, so a single tick may not finish analyzing every
    watchlist symbol before being killed. This is not a correctness bug —
    each symbol's cycle is isolated, so a truncated run just leaves the
    remaining symbols for the next tick 15 minutes later — but it does mean
    "every symbol refreshed every 15 minutes" is only guaranteed on a plan
    where one invocation can complete the full batch.

## Decision Outcome Capture & ELVOID Learning Database (Phase 8.1.0)

Phase 8.1 ("Self-Evaluation & Adaptive Learning") begins here, with the
smallest correct first step: **capturing** a decision's context alongside
its eventual outcome. It does **not** evaluate whether a decision was
good or bad, does not score correctness, does not detect failure
patterns, and does not learn anything — those are explicitly deferred to
Phase 8.1.1 onward.

### Why a separate database

```
MAIN SUPABASE                          ELVOID LEARNING DATABASE (NEW)
├── Authentication / Users             (a SEPARATE Supabase project)
├── Wallet / Earn / Rewards            │
├── ai_signals  ←── canonical ─────────┼──┐
├── ai_journal  ←── decision/action    │  │  logical reference only —
├── Paper Trading    & outcome         │  │  NEVER a SQL foreign key
└── Application Operational Data       │  │  across projects
                                        │  v
                                        └── decision_experiences
                                              (source_signal_id = ai_signals.id)
```

Main Supabase remains the **sole canonical authority** for `ai_signals`
(decision/action) and `ai_journal` (outcome) — nothing about this phase
changes that, duplicates it, or reinterprets it. The **ELVOID Learning
Database** is a dedicated, isolated Supabase project that stores a
learning *projection* of that history — never a replacement, never a
second trading authority. Keeping it in its own project means a future
Phase 8.1.2+ pattern-detection workload, a learning-data schema change, or
even a full reset of learning data can never touch operational, financial,
or auth tables, and vice versa.

Required environment variables (server-side only — see `.env.example`):
```
ELVOID_LEARNING_SUPABASE_URL=
ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY=
```
No anon key exists for this project — only server-side code ever connects
to it, matching `lib/supabaseData.ts`'s own `DATA_SUPABASE_URL`/
`DATA_SUPABASE_SERVICE_ROLE_KEY` precedent for a second Supabase project
in this repo. `ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY` must never reach
a `"use client"` component, an API response, or a log line — identical
rule to `SUPABASE_SERVICE_ROLE_KEY`. `lib/ai/learning/db.ts`'s client
reads *only* these two vars and **never** falls back to the Main Supabase
or Data Supabase clients if they're unset — it returns `null` and every
caller degrades gracefully (the capture is skipped; trading is never
affected).

### Decision Experience lifecycle

```
GET /api/elvoid-pro/oracle
   -> CognitiveDecisionContext (Phase 8.0.5, internal)
   -> normalizeLearningContext() -> LearningContextSnapshot (small, flat, frozen)
   -> included in the response as `learningContext` (additive field only)

client round-trips `learningContext` alongside the existing `assessment`/
`risk`/`confluence` fields (same mechanism, same trust level as today)

POST /api/elvoid-pro/execute-signal
   -> executeOracleSignal(..., learningContext)
   -> ai_signals row inserted (Main DB, unchanged)
   -> best-effort, fire-and-forget: captureDecisionExperience()
        -> decision_experiences row (Learning DB) — idempotent on
           UNIQUE(source_signal_id); never blocks or fails the trade
```

A `LearningContextSnapshot` is intentionally small and flat — grade,
confidence, hypothesis statuses/uncertainty, conflict state, risk
severity/context quality — never the raw evidence arrays, internal
conflict factors, or full nested Cognitive Layer objects. It is `null`
whenever the originating decision has no Cognitive Layer context, which
is true today for every normal AI Signal-sourced decision (only the
ELVOID PRO Oracle path currently builds a `CognitiveDecisionContext` at
all) — this is a valid, expected state, never fabricated.

**Immutability:** once written, a `decision_experiences` row's decision
fields (`grade`/`confidence`/`learning_context`/etc.) are never updated.
Outcome fields are written **at most once**, later, via a conditional
`UPDATE ... WHERE outcome_result IS NULL` — so a future change to
`hypothesis.ts`'s or `conflict.ts`'s classification rules can never
silently reinterpret a historical decision. A record always represents
*what ELVOID knew at decision time*, never *what current ELVOID would
think about that old decision*.

**Not yet implemented (explicitly deferred):** decision-quality scoring,
good-vs-bad-decision classification, failure pattern detection, decision
memory retrieval, adaptive constraints, learning validation, and any
autonomous execution policy. This phase only captures; it does not judge.

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
