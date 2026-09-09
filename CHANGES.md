# Phase 8.5 — Delta 2: PEPE symbol mapping + External Intelligence symbol-format fix

Continuation of Phase 8.5 finalization. Delta 1 (schema drift + silent
persistence failure) is already deployed and production-verified. This
delta fixes two independent, code-confirmed root causes found during the
same audit. **Not yet deployed — production verification pending.**

## Files touched (3, all directly required — nothing unrelated)

- `lib/binance.ts`
- `lib/ai/wiring/externalIntelligenceGate.ts`
- `scripts/phase8/cognitive-trace-fixtures.ts` (fixture assertion update — see "Regression" below; not required for deploy, included for repo consistency)

## 1. PEPE — Binance Futures ticker mismatch (root cause of INPUT-only stall)

**Root cause:** Binance Futures lists PEPE under the scaled ticker
`1000PEPEUSDT`, not `PEPEUSDT` (same convention as 1000SHIB, 1000LUNC —
used for tokens whose unit price would otherwise round to ~0 at normal
tick sizes). Every direct `${symbol}USDT` pair construction in
`lib/binance.ts` built the wrong, non-existent `PEPEUSDT` ticker, so every
Futures call for PEPE (klines, aggTrades, depth, open interest, funding
history, long/short ratio, CVD) has failed with `400 Invalid symbol` since
PEPE was added to the watchlist. This is the confirmed reason PEPE never
progressed past the Cognitive Trace INPUT stage: `assembleOracleContext()`
correctly degrades a failed `getKlines()` to `candles: []` (via
`Promise.allSettled`), which correctly trips the existing
`candles.length >= 30` insufficient-history gate — so the *symptom* was
already handled honestly (`NO_ASSESSMENT`, not a crash); the *candle fetch
itself* was the bug.

**Fix:** Added one canonical, single-source-of-truth helper:

```ts
const FUTURES_SYMBOL_OVERRIDES: Record<string, string> = { PEPE: "1000PEPEUSDT" };
export function toFuturesPair(symbol: string): string {
  const base = symbol.toUpperCase().replace(/USDT$/, ""); // idempotent — see below
  return FUTURES_SYMBOL_OVERRIDES[base] ?? `${base}USDT`;
}
```

Verified **no pre-existing canonical mapping helper existed anywhere else**
in the repo before this (checked: `canonicalSymbol`, `normalizeSymbol`,
`toBinanceSymbol`, `resolveSymbol`, `symbolToPair`, `contractSymbol`,
`futuresTicker` — zero matches outside this new code).

Applied at all 11 pair-construction sites in `lib/binance.ts`:
`getKlines`, `getKlinesRange`, `getRecentTrades`, `getAggTradesRange`,
`getAggTradesFromId`, `getOpenInterestHistory`, `getFundingRateHistory`,
`getLongShortRatio`, `getCvdSeries` — direct, unambiguous, Futures-only.

`get24hTicker` and `getOrderBookDepth` have a Futures-then-Spot fallback
using the **same** `pair` variable for both legs. These were split into
`futuresPair` (now `toFuturesPair(symbol)` — fixes PEPE) and `spotPair`
(left as the original plain `${symbol}USDT` ticker) — Binance Spot's
actual PEPE listing convention was **not verified** (no live network
access from the audit sandbox), so the Spot leg is deliberately left
unchanged rather than guessed at. `WATCHLIST` (open-interest bulk fetch)
entry corrected `"PEPEUSDT"` -> `"1000PEPEUSDT"`.

**Idempotent by design:** `toFuturesPair()` strips a trailing `USDT`
before the override lookup, so it is safe whether a caller passes the
short form (`"BTC"`, `"PEPE"` — the real production convention, see
`orchestrator.ts`) or an already-full pair (`"BTCUSDT"` — the convention
`scripts/phase8/external-intelligence-gate-fixtures.ts` already used).
This was found and fixed *during* fixture validation (see below) rather
than assumed.

**Not touched:** `lib/elvoid/watchlist.ts` (still lists the short form
`"PEPE"` — correct, unrelated to the Futures ticker). No Oracle grading,
risk, qualification, or decision-authority logic touched.

## 2. External Intelligence — symbol-format mismatch (evidenceSatisfied always false)

**Root cause:** `DERIVATIVES_WATCHLIST` (`lib/binance.ts`) is a list of
full pairs (`"BTCUSDT"`, `"PEPEUSDT"`, ...). `gatherRealEvidence()` in
`externalIntelligenceGate.ts` compared it against `symbol` — the plain
short form (`"BTC"`) — via `DERIVATIVES_WATCHLIST.includes(symbol)`. This
never matched for **any** symbol, for as long as the module has existed.
The one documented "real, live fetch path" capability (`funding_rate`) was
therefore never actually reachable — confirmed live in production before
this fix: `{"shouldResearch":true,"evidenceSatisfied":false,...}` for BTC
even though funding data was genuinely available. A second instance of
the identical bug existed one line below: `snapshot.find(f => f.symbol
=== symbol)` (comparing `f.symbol` — Binance's real `"BTCUSDT"` — against
the short `symbol`).

**Fix:** Both comparisons now use `toFuturesPair(symbol)` (imported from
`lib/binance.ts` — the same helper, not a duplicate):

```ts
const pair = toFuturesPair(symbol);
if (!needsDerivatives || !DERIVATIVES_WATCHLIST.includes(pair)) return evidence;
...
const own = snapshot.find((f) => f.symbol === pair);
```

**Symbol isolation preserved** — verified by fixture #10 (below), which
specifically checks a BTC gate call never treats ETH's funding row as its
own evidence. Nothing else in this function changed: still exactly one
live fetch path, still wrapped in try/catch with an honest degrade on
failure, still zero fabrication, still no BUY/SELL/EXECUTE-shaped field
anywhere in `ExternalIntelligenceSignal`, still never mutates the
canonical `assessment`.

## Validation performed (this sandbox — no live network/deploy access)

- `tsc --noEmit` (whole project): zero new diagnostics introduced by
  either fix. Pre-existing `RequestInit`/`next` noise (missing
  `node_modules`) confirmed identical before/after via `git stash` diff
  (13 occurrences, both times, in `lib/binance.ts` alone).
- **`scripts/phase8/external-intelligence-gate-fixtures.ts` — actually
  executed** (via `npx tsx`, working around the missing-`node_modules`
  environment by temporarily marking the sandbox copy as an ES module —
  a local test-runner aid only, reverted before packaging; not part of
  this delta). Result: **28/28 passed**, including:
  - #10 — symbol isolation (BTC gate call never uses ETH's funding row)
  - #12 — fetch failure never throws, never fabricates a fallback
  - #15 — no random/mock/fake/bullish/bearish token in production code
  - One failure surfaced *during* this run before the idempotent-helper
    change (fixture passes `"BTCUSDT"`, not `"BTC"`) — fixed by making
    `toFuturesPair()` idempotent rather than special-casing the fixture.
- **Full regression: all 36 `scripts/phase8/*.ts` fixture scripts run**,
  compared against a true pre-edit baseline via `git stash`:
  - **1 new failure**, fully expected and intentional:
    `cognitive-trace-fixtures.ts` check #14 asserted the *old*
    `.catch(() => {})` discard pattern from Delta 1's fix — updated here
    to assert the corrected `.then(logPersistenceFailure).catch(logPersistenceThrew)`
    pattern instead. Re-verified: 16/16 pass after the update.
  - **5 pre-existing failures, unchanged count before/after** (confirmed
    via `git stash`, not assumed): `autonomous-context-fixtures.ts` #20,
    `autonomous-learning-fixtures.ts` #14a, `decision-learning-lifecycle-fixtures.ts`
    #7/#8, `decision-outcome-fixtures.ts` #30/#32 (all four of these last
    three are the same root cause — a fixture regex requiring
    `.catch(` immediately adjacent to the lifecycle call in
    `paperTrader.ts`, which has always had a `.then()` in between —
    pre-existing, unrelated to this delta, not touched here per
    "minimal change"), `learning-validation-fixtures.ts` #19,
    `macro-intelligence-fixtures.ts` #12.
  - No other script in the 36-script suite regressed.

## NOT done in this delta (explicitly out of scope)

- **`evaluateAndPersistDecision()` automatic-retry wiring** (the
  evaluation-pipeline-coverage root cause) — deliberately not wired here.
  The codebase's own comments, repeated verbatim across 7 files, mark
  this as requiring a "future, separately-approved change." Flagged in
  chat for an explicit decision rather than silently wired or silently
  dropped.
- No Oracle/risk/qualification/decision-authority logic touched.
- No UI/dashboard changes.

## Deploy + verify (unchanged from Delta 1's process)

Extract at repo root (paths match exactly), commit, push `main` as usual
— Vercel's existing git integration builds and deploys. Production is
NOT considered fixed until a real post-deploy autonomous cycle shows,
for PEPE specifically: INPUT -> ANALYSIS -> EVIDENCE/CONFLICT -> DECISION
(not just source code review) — and for External Intelligence: the gate
was called, symbol match succeeded, an available capability was actually
detected, and an unavailable one still reports honestly false.
