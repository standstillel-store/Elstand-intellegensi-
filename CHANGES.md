# ELVOID PRO — Phase 7 Changelog

## Phase 7.0 — Baseline + Runtime Audit

### Objective
Trace the real runtime path of the Elvoid Pro decision pipeline before changing anything, and confirm standard Elvoid AI (`/ai signal`) is architecturally separate.

### Findings
- `/api/elvoid-pro/oracle` → `assembleOracleContext` → `computeConfluence` → `buildOracleRiskPlan` → `gradeConfluence` → `buildMarketInsight`.
- `/api/elvoid-pro/insights` reuses the same `assembleOracleContext` + `computeConfluence` output (5s in-process cache) and only adds `classifyMarketRegime` + `detectAllPatterns` — it does not compute a second decision.
- `/api/elvoid-pro/execute-signal` computes nothing; it persists an `assessment`+`risk` the client already has.
- Single source of truth per value: `side`/`confidence`/`grade` all come from `gradeConfluence()`; `entry`/`SL`/`TP` come from the separate `buildOracleRiskPlan()`.
- Standard Elvoid AI (`lib/elvoid/engine.ts` + `lib/ai/core/modules/oracle.ts`) is a fully separate module tree with its own LLM wrapper that never re-derives `side`/`confidence` from the model — it always echoes the deterministic signal's own numbers.
- UI: `AISignalPanel.tsx` → `/api/ai-signals` (standard AI). `OraclePanel.tsx` → `/api/elvoid-pro/oracle`. `InsightsPanel.tsx` → `/api/elvoid-pro/insights`. Confirmed as two separate systems, not two competing engines inside Pro.
- Gap confirmed: `OracleContext` is single-timeframe only (one `candles` series, one `interval` param) — no HTF/MTF/LTF concept exists yet (Phase 7.2 scope). `classifyMarketRegime` exists but does not yet reweight evidence (Phase 7.3 scope).

### Files Modified
None (read-only audit).

### Tests
None yet — no test runner installed in the repo (`package.json` has only `dev`/`build`/`start`/`lint`). Deferred to a lightweight script (see 7.1) instead of introducing Jest/Vitest, per instruction.

### Regression Status
N/A — no code changed.

### Known Limitations
No test framework; baseline verification uses a standalone script instead (see Phase 7.1).

---

## Phase 7.1 — Evidence Normalization

### Objective
Make per-factor evidence explicit (source/direction/strength/quality/cluster) without creating a second confluence/decision engine, and establish a baseline snapshot to detect regressions across the rest of Phase 7.

### Architecture
- New file `lib/ai/oracle/evidence.ts`: a pure, read-only adapter. `normalizeEvidence(confluence, timeframe?)` maps each existing `ConfluenceFactor` 1:1 into a `NormalizedEvidence` record. Direction is derived per-factor from `longWeight`/`shortWeight` comparison (ties, including 0/0, normalize to `NEUTRAL` — never forced to a side). `cluster` reuses the existing `CLUSTERS` grouping from `grading.ts` (now exported, not redefined) so "structure vs orderflow vs context" independent-evidence-cluster logic has exactly one definition in the codebase.
- No new data fetching. No new scoring. `confluence.dominantSide` and `gradeConfluence()`'s output remain the only decision-level values; this file cannot produce or influence one.
- `timeframe` and `invalidation` fields are optional and left unset/undefined for now — no per-factor invalidation level or multi-timeframe data exists upstream yet, and this adapter must not invent either ahead of Phase 7.2.
- Added `scripts/phase7/baseline.ts` + `scripts/phase7/alias-loader.mjs`: a standalone, dev-only script (not part of the Next.js app) that runs the real `computeConfluence → buildOracleRiskPlan → gradeConfluence` pipeline against a deterministic synthetic candle fixture (seeded, no `Math.random`), and additionally exercises the new `normalizeEvidence`/`firingClustersFor` to confirm the adapter reports the same factor count as `confluence.factors` and does not alter `grade`/`side`/`confidence`. The alias-loader only maps the repo's `@/` tsconfig path (and bare relative TS specifiers) to real file paths so the script can run under plain `node --experimental-strip-types` without installing a bundler/ts-node (no network/npm install available in this environment). Output saved to `scripts/phase7/baseline.snapshot.json` for before/after comparison in later sub-phases.

### Files Modified
- `lib/ai/oracle/grading.ts` — one-line change: `const CLUSTERS` → `export const CLUSTERS` (zero logic change, confirmed via git diff: 1 insertion/1 deletion, same line).

### Files Added
- `lib/ai/oracle/evidence.ts`
- `scripts/phase7/baseline.ts`
- `scripts/phase7/alias-loader.mjs`
- `scripts/phase7/baseline.snapshot.json`

### What Was Preserved
- `computeConfluence()` remains the only evidence engine.
- `longWeight`/`shortWeight` values are read, not recomputed.
- Independent evidence cluster concept (`structure`/`orderflow`/`context`) — single definition, reused not duplicated.
- Real/proxy/unavailable quality passthrough, unchanged.
- Existing contradiction detection (`ConfluenceResult.contradictions`) — exposed via `existingContradictions()` passthrough, not reimplemented.
- Standard Elvoid AI, `/api/ai-signals`, and standard AI UI — zero files touched (confirmed by `git diff --stat`).

### What Was Added
- `NormalizedEvidence` type + `normalizeEvidence()` adapter.
- `firingClustersFor()` helper (read-only convenience over the same cluster grouping grading.ts already enforces internally).
- `existingContradictions()` passthrough helper.
- A runnable, deterministic baseline script + saved snapshot for future regression comparison.

### Tests / Checks
- `npm run lint` / `tsc --noEmit` / `next build`: **not run** — `node_modules` is not installed in this environment and there is no network access to run `npm install`. This is an environment limitation, not a code omission.
- In lieu of the above: ran `scripts/phase7/baseline.ts` twice against the fixture; output was byte-identical both runs (deterministic). Confirmed `normalizedEvidenceCount === confluence.factors.length` (8 === 8) and `grade`/`side`/`confidence`/`risk` values match what `gradeConfluence`/`buildOracleRiskPlan` alone would produce (evidence.ts does not participate in their computation).
- Verified via `git diff --stat` that only `lib/ai/oracle/grading.ts` (1-line, non-functional change) was modified among existing files; everything else is new, additive files.

### Regression Status
No behavioral change to the Pro pipeline. No change to standard Elvoid AI.

### Known Limitations
- No real test framework in the repo; regression checking for Phase 7 currently relies on the manual baseline script, not automated CI-run tests. Recommend revisiting once npm install is possible in a networked environment.
- `timeframe` on `NormalizedEvidence` is currently always the single interval passed in — real HTF/MTF/LTF separation is Phase 7.2, not yet implemented.
- `invalidation` on `NormalizedEvidence` is always `undefined` — no per-factor invalidation level exists upstream yet.

**Baseline factor-count note (from approval message):** the synthetic baseline reports `normalizedEvidenceCount = 8` (one per `ConfluenceSource`), while UI/product terminology elsewhere references "20 confluence factors." Per instruction, not touched yet — the 8 sources in `confluence.ts` are source-level factors; the "20" figure likely refers to a different counting unit (e.g. individual scanner functions across `lib/elvoid/scanners.ts`, or the standard Elvoid AI's own `scans`+`extraReasoning` count in `lib/elvoid/engine.ts`, which is a separate system entirely per Phase 7.0). Actual reconciliation deferred to whichever later sub-phase first needs an exact count (likely 7.5 Scenario Engine or 7.7 Decision Arbitration) — flagged here so it isn't lost.

---

## Phase 7.2 — Multi-Timeframe Intelligence

### Objective
Give Elvoid Pro real HTF/MTF/LTF context so a lower-timeframe move against the higher-timeframe structure is not misread as a full reversal — without creating a second directional decision.

### Existing Infrastructure Discovered (Step 1 audit)
- `lib/market-data/timeframeHistory.ts` already defines the app's full supported-interval set: `1m, 5m, 15m, 1h, 4h, 1d` (`TIMEFRAME_HISTORY_DAYS`), shared by the chart engine and `/api/klines`.
- `lib/binance.ts`'s `getKlines(symbol, interval, limit)` is the single kline-fetch function already used by `dataAdapters.ts` for the anchor timeframe — it has its own keyed 60s in-process cache (`lib/cache.ts`'s `cached()`, key `bn:klines:{pair}:{interval}:{limit}`). No second fetch/cache layer was built; Phase 7.2 calls this exact function for the two additional (HTF/LTF) timeframes.
- No multi-timeframe concept existed anywhere in `lib/ai/oracle/*` prior to this phase — confirmed via the Phase 7.0 audit (`OracleContext` was single-`candles`-series only).
- Structure-derivation primitives (`findSwingPoints`, `detectTrend`, `scanMarketStructure`, `scanTrend`, `findSupportResistance` — all in `lib/elvoid/indicators.ts` / `lib/elvoid/scanners.ts`) were already used for the anchor timeframe by `confluence.ts`'s `marketStructureFactor()`. Phase 7.2 reuses these exact functions against additional candle series instead of writing a new structure algorithm.

### Timeframe Mapping (documented, deterministic — `lib/ai/oracle/mtf.ts::TIMEFRAME_MAP`)
| Anchor | HTF | LTF |
|---|---|---|
| 1m | 15m | — |
| 5m | 1h | 1m |
| 15m | 4h | 5m |
| 1h | 1d | 15m |
| 4h | 1d | 1h |
| 1d | — | 4h |

An anchor with no mapped side (1m has no HTF, 1d has no HTF) reports that side as unavailable rather than guessing a neighbor.

### Data Fetching Changes
- `buildMtfContext(symbol, anchorInterval, anchorCandles, currentPrice)`: the anchor/MTF slot reuses `anchorCandles` the caller already fetched (**zero extra fetch** for MTF). Only HTF and LTF (when mapped) trigger a `getKlines()` call each — **at most 2 additional Binance requests per Oracle call**, both going through the existing 60s cache, so repeated requests for the same symbol+interval within 60s cost nothing extra.
- A failed/missing HTF or LTF fetch (`.catch(() => [])`) or too little candle history (`< 20` candles) marks that slice `available: false` with a `quality`-style reason string — never a fabricated bias.

### MTF Context Structure (`lib/ai/oracle/mtf.ts`)
```
MtfContext {
  anchorInterval, htf: TimeframeSlice | null, mtf: TimeframeSlice, ltf: TimeframeSlice | null,
  relationship: MtfRelationship, relationshipEvidence: string
}
TimeframeSlice { timeframe, available, bias: LONG|SHORT|NEUTRAL, strength, evidence, protectiveLevel }
```
`bias` per slice is derived exactly the way `marketStructureFactor()` derives the anchor's bias today (same scanners, same weight scale) — it is evidence/context, not the Pro decision.

### Timeframe Relationship Logic (`classifyMtfRelationship`)
Pure, descriptive-only function → one of: `ALIGNED_BULLISH/BEARISH`, `PULLBACK_IN_UPTREND/DOWNTREND`, `CONTINUATION_AFTER_PULLBACK_BULLISH/BEARISH`, `HTF_THESIS_THREATENED_BULLISH/BEARISH`, `NEUTRAL_OR_MIXED`, `INSUFFICIENT_DATA`. Never returns LONG/SHORT and is never consumed by `gradeConfluence()`.

"HTF structural level broken" is measured, not guessed: the nearest real protective S/R level (`findSupportResistance()`, same function `risk.ts` uses) for the HTF's own bias, checked against the live current price.

**Documented limitation:** "bearish/bearish displacement" (spec Case C) is approximated as "LTF agrees with the break direction," since no separate displacement-magnitude detector exists yet. This keeps the check evidence-based without inventing a new signal, and is called out in the relationship's own evidence string. A true `TRUE_THESIS_INVALIDATION` verdict is explicitly deferred to Phase 7.6.

### Unavailable-Data Behavior
- HTF unavailable + MTF/LTF available → `INSUFFICIENT_DATA`, explicit reason, no fabricated HTF bias (spec Case D — verified by fixture 5).
- Only anchor timeframe available (both neighbors unavailable) → `INSUFFICIENT_DATA`, current single-timeframe Oracle behavior otherwise fully preserved (spec Case E — verified by fixture 7).
- One neighbor available, one not → relationship is still computed from what IS available rather than being blocked outright (fixture 6).

### Files Modified
- `app/api/elvoid-pro/oracle/route.ts` — 8 lines added: import + one additional `await buildMtfContext(...).catch(() => null)` call, `mtf` added to the JSON response. Confluence/risk/grading/insight computation lines are byte-for-byte unchanged.
- `components/elvoid-pro/AISignal/OraclePanel.tsx` — 28 lines added: an optional `mtf` field on the response type and a small read-only "Multi-Timeframe Context" section (HTF/MTF/LTF bias + relationship label) rendered only when `data.mtf` is present. No existing markup restructured.

### Files Added
- `lib/ai/oracle/mtf.ts` — the MTF module described above.
- `scripts/phase7/mtf-fixtures.ts` — offline fixture tests for `classifyMtfRelationship()` covering spec Step 11 cases 1–7.

### Tests / Checks
- `scripts/phase7/mtf-fixtures.ts`: **7/7 passed** (cases 1–7 from spec, including HTF-unavailable, LTF-unavailable, and both-unavailable). Run:
  `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/mtf-fixtures.ts`
- Re-ran `scripts/phase7/baseline.ts` and diffed against the Phase 7.1 recorded snapshot: **byte-identical** — `grade`, `side`, `confidence`, `risk`, `dominantSide` all unchanged, confirming MTF context did not alter grading/confluence in any way.
- `npm run lint` / `tsc --noEmit` / `next build`: still not runnable in this sandbox (no `node_modules`, no network for `npm install`) — same environment limitation noted in Phase 7.1. `getKlines()` itself (the live Binance fetch) is therefore **not exercised** by the offline fixtures either; only the pure relationship-classification logic is tested here.
- `git diff --stat`: confirms only `app/api/elvoid-pro/oracle/route.ts` and `components/elvoid-pro/AISignal/OraclePanel.tsx` touched among existing files, both additive. No file under `lib/elvoid/`, `lib/ai/core/`, `/api/ai-signals`, or standard AI UI modified.

### Regression Status
No change to `gradeConfluence()`, `computeConfluence()`, `buildOracleRiskPlan()`, confidence, or grade — confirmed via identical baseline snapshot. `/api/elvoid-pro/insights` and `/api/elvoid-pro/execute-signal` were not touched at all in this sub-phase (MTF was only wired into the Oracle route per Step 9's primary target); `execute-signal` remains persistence/validation only.

### Performance Considerations
- Up to 2 additional Binance kline requests per Oracle call (HTF + LTF), both cached 60s the same way the anchor already is. For the common case of a page mounting Oracle+Insights together within the existing 5s `assembleOracleContext` cache window, HTF/LTF requests are not duplicated across those two panels' Oracle-route calls within that same 60s window either.
- No new polling, no new background jobs, no change to existing rate-limit handling — reuses `getKlines()`'s existing `Promise`-based error handling (`.catch(() => [])` here) rather than adding new retry/backoff logic.

### Known Limitations
- MTF context is only wired into `/api/elvoid-pro/oracle`, not `/api/elvoid-pro/insights` (deliberately out of scope for 7.2 per Step 9 — insights already reuses the anchor confluence and doesn't need its own MTF call yet).
- "Displacement" is approximated via LTF directional agreement rather than a dedicated magnitude/velocity measure (documented in `mtf.ts`'s own comments).
- Live `getKlines()` network path is untested in this sandbox (no network access) — only the deterministic relationship-classification logic has fixture coverage. Recommend a manual smoke-test against a live/staging symbol before considering 7.2 fully verified in production.
- The Phase 7.1 "8 vs 20 factors" terminology question (see note above) remains open and is not addressed by 7.2.

---

## Phase 7.3 — naming clarification

Due to an account/session transition, "Phase 7.3" ended up covering two unrelated pieces of work under one number:

- **Phase 7.3A — ELVOID PRO UI Hierarchy.** Removed the Standard Elvoid AI Signal card from the Elvoid Pro page only (Standard Elvoid AI engine, `/ai-signal`, `/api/ai-signals`, and `lib/elvoid/engine.ts` untouched); promoted the Pro Oracle card to canonical primary; `OraclePanel.tsx` redesigned to surface decision/confidence/Entry/TP/SL/Timeframe/Confluence/Reason/Confirmations/Risk-Invalidation/MTF context. No fabricated TP1/TP2/TP3, no WAIT state introduced. Pro Oracle backend logic itself unchanged in this sub-phase.
- **Phase 7.3B — Regime-Aware Interpretation** (below). The item the original roadmap label actually meant, and the part that was missing from this repository snapshot.

## Phase 7.3B — Regime-Aware Interpretation

### Why this was discovered missing
Step 1 audit for Phase 7.4 found `OracleInsight.marketRegime` / `OracleSignalSnapshot.marketRegime` were plain display strings (a concatenation of the market-structure and microstructure confluence factors' evidence text), not the output of any classifier. No `classifyMarketRegime()` existed anywhere in `lib/ai/oracle/`, and grading/confluence had zero regime input. `lib/ai/insights/regime.ts` exists but belongs to the unrelated `lib/ai/insights/engine.ts` subsystem and was deliberately not reused or imported.

### Existing primitives reused (no duplicate math)
- `lib/elvoid/indicators.ts::detectTrend()` — EMA alignment + swing structure. Same function `mtf.ts`'s `deriveTimeframeSlice()` already calls per timeframe.
- `lib/elvoid/indicators.ts::calcAdx()` — Wilder's ADX/+DI/-DI, including its own `trendStrength: weak(<20) | developing(20-39) | strong(>=40)` bands.
- The ADX ≥ 20 "real trend vs. chop" cutoff already established by `adxFactor()` in `lib/elvoid/scanners.ts` — reused verbatim, not re-derived.

### New file: `lib/ai/oracle/regime.ts`
`classifyMarketRegime(candles, timeframe, mtf?)` — pure function, no fetch:

**Classification rules** (deterministic, bounded):
1. ADX not computable (`candles.length < 29`, i.e. `calcAdx(14)`'s own `period*2+1` floor) → `VOLATILE_UNCLEAR`, `quality: "unavailable"`.
2. ADX `< 20` → `RANGING`, regardless of what EMA/swing structure alone suggests. This is what stops a low-ADX chop with a mildly-sloped EMA from being reported as a strong trend.
3. ADX `>= 20` and `detectTrend()`'s direction agrees with the dominant DI (`uptrend` + `+DI > -DI`, or `downtrend` + `-DI > +DI`) → `TRENDING_UP` / `TRENDING_DOWN`, `strength` = raw ADX value.
4. ADX `>= 20` but direction and dominant DI disagree (including `detectTrend()` reading `sideways` while ADX indicates a real trend) → `VOLATILE_UNCLEAR`. Two independently-computed reads disagreeing is reported as genuine ambiguity, never forced either way.

**Output schema**
```
RegimeContext {
  type: "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "VOLATILE_UNCLEAR"
  strength: number       // raw ADX (0-100); 0 for RANGING (no "strength of chop" to report)
  quality: "real" | "proxy" | "unavailable"
  evidence: string       // ADX values + trend detail, human-readable
  timeframe: string
  mtfAlignment: "ALIGNED" | "MIXED" | "UNAVAILABLE"
}
```

### MTF interaction
`computeMtfAlignment()` compares the regime's implied side (`TRENDING_UP` → LONG, `TRENDING_DOWN` → SHORT) against Phase 7.2's already-built `MtfContext.htf`/`.ltf` biases — no new fetch, no new directional decision. `RANGING`/`VOLATILE_UNCLEAR` always report `UNAVAILABLE` (no directional thesis to check alignment against). Any available HTF/LTF slice disagreeing with the regime's side → `MIXED`; all available and agreeing → `ALIGNED`; none available → `UNAVAILABLE`.

### Context-only behavior (unchanged per spec)
`gradeConfluence()`, `computeConfluence()`, confidence, `dominantSide`, and the risk plan are **not modified**. `regime.ts` is called in `app/api/elvoid-pro/oracle/route.ts` *after* `assessment`/`risk` are already computed, wrapped in try/catch (falls back to `null`), and is passed only into `buildMarketInsight()` and the route's JSON response as a new top-level `regime` field. `OracleInsight.marketRegime` (the pre-existing string field) now sources its text from the real classifier's evidence line when available, falling back to the old structure/microstructure concat only when the classifier returned nothing (or `quality: "unavailable"`) — same field name, same type, backward compatible. A new optional `OracleInsight.regime?: RegimeContext` field carries the structured output.

### Files changed
- **New:** `lib/ai/oracle/regime.ts`
- **New:** `scripts/phase7/regime-fixtures.ts`
- `app/api/elvoid-pro/oracle/route.ts` — added `classifyMarketRegime()` call (try/catch-wrapped) after `mtf` is built; `regime` added to the JSON response; `buildMarketInsight()` now receives it as a third, optional argument.
- `lib/ai/oracle/insight.ts` — `buildMarketInsight()` gained an optional `regime` parameter; `marketRegime` string now prefers the classifier's evidence text; new optional `regime` field added to `OracleInsight`.

No changes to `lib/elvoid/engine.ts`, `/api/ai-signals`, `lib/ai/oracle/grading.ts`, `lib/ai/oracle/confluence.ts`, or `lib/ai/oracle/risk.ts`.

### Tests (`scripts/phase7/regime-fixtures.ts`, pure/offline)
1. Clean uptrend + strong ADX → `TRENDING_UP` ✅
2. Clean downtrend + strong ADX → `TRENDING_DOWN` ✅
3. Sideways + low ADX → `RANGING` ✅
4. Directional structure but weak ADX → `RANGING` (not falsely trending) ✅ — required a specially-constructed oscillating-but-drifting synthetic candle series, since ADX measures directional *persistence* rather than magnitude: a monotonic tiny drift alone still saturates ADX toward 100 even at negligible amplitude, so the fixture generator reverses high/low direction bar-to-bar (cancelling +DM/-DM) while keeping a slow net EMA drift.
5. Insufficient candles for ADX → `VOLATILE_UNCLEAR`, `quality: "unavailable"` ✅
6. HTF aligned with anchor → `mtfAlignment: "ALIGNED"` ✅
7. HTF/LTF mixed → `mtfAlignment: "MIXED"` ✅
8. MTF unavailable (`null`) → `mtfAlignment: "UNAVAILABLE"` ✅

All 8/8 passed. Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/regime-fixtures.ts`

### Regression
- Phase 7.1 baseline (`scripts/phase7/baseline.ts`): identical grade (`NO_TRADE`), side (`null`), confidence (`0`), risk plan, and normalized-evidence counts — unaffected, since `regime.ts` isn't imported by anything in the grading/confluence path.
- Phase 7.2 MTF fixtures (`scripts/phase7/mtf-fixtures.ts`): all 7/7 still pass unchanged — `mtf.ts` itself was not modified, only consumed (read-only) by the new `regime.ts`.
- Diff check: only `app/api/elvoid-pro/oracle/route.ts` and `lib/ai/oracle/insight.ts` modified among existing files (both additive), plus the two new files above. `lib/elvoid/engine.ts` and `/api/ai-signals` confirmed byte-identical/untouched.

### Performance
Zero new network requests. `classifyMarketRegime()` runs against `context.candles` (already fetched by `assembleOracleContext()`) and the `mtf` object (already fetched by Phase 7.2's `buildMtfContext()`), both already resident in memory at the call site in `route.ts`. No new polling, no new cache layer.

### Known limitations
- `strength` is the raw ADX value (0–100) rather than a normalized 0–100 "confidence" scale of its own — documented, not a separate invented metric.
- `mtfAlignment` only ever compares against HTF/LTF *bias*, not magnitude/strength of that bias — consistent with `classifyMtfRelationship()`'s own descriptive-only, non-decision nature in `mtf.ts`.
- `RegimeContext.quality` currently only ever produces `"real"` or `"unavailable"` (never `"proxy"`) — no proxy/degraded regime data source exists yet to justify that value; kept as `OracleDataQuality` for type consistency with the rest of the pipeline in case one is added later.
- As with Phase 7.2, `tsc --noEmit` / `next build` could not be run against a fully installed `node_modules` in this sandbox (no network for `npm install`); a manual smoke-test of `/api/elvoid-pro/oracle` against a live symbol is recommended before considering 7.3B fully verified in production.

### Phase 7.8 — Risk Intelligence (planning note, preserved)
Future scope, not started: Entry range + TP1/TP2/TP3 + SL + R:R + invalidation + scenario-dependent targets, replacing the current single entry/SL/TP `OracleRiskPlan`. Depends on Phase 7.5 (Scenario Engine) and Phase 7.7 (Decision Arbitration) landing first, per the dependency chain: 7.4 → 7.5 → 7.6 → 7.7 → 7.8.

---

## Phase 7.4 — Liquidity + Order Flow Intelligence

**Context/evidence generation only. This phase does NOT change the Pro decision** — `computeConfluence()`, `gradeConfluence()`, confidence, `dominantSide`, and `buildOracleRiskPlan()` are all unmodified and untouched by this phase's output.

### Step 1 audit findings
Before writing anything new, audited what already exists and already feeds `computeConfluence()` in `lib/ai/oracle/confluence.ts`:
- `smc_ict` factor already runs `scanLiquiditySweep()` (wick pierces a prior swing high/low, closes back beyond it) tied to real `findSwingPoints()` output — a genuine "sweep at a meaningful structural level" detector, not a raw-wick heuristic.
- `tpo` factor already reads POC/VAH/VAL acceptance/rejection from `ctx.tpo`.
- `footprint` factor already reads delta ratio + imbalance-cell count.
- `orderbook` factor already reads live bid/ask depth imbalance.
- `liquidity` factor already reads a traded-volume high-volume-node "magnet" (tagged `quality: "proxy"`, correctly never claimed as real resting liquidity).
- `gradingTypes.ts`'s `CLUSTERS` map already groups `footprint`/`orderbook`/`liquidity` into one `"orderflow"` cluster — **Step 10's correlation protection already existed** before this phase; not rebuilt.
- `lib/elvoid/scanners.ts::scanLiquidityPool()` exists (equal-high/equal-low clustering) but was only wired into **Standard** `lib/elvoid/engine.ts`, never Oracle — reusable read-only.

**What was actually missing** (the real gap this phase fills):
1. No comparison anywhere between order-flow direction (footprint delta) and what price actually did in response — `footprintFactor()` scores delta magnitude in isolation. No absorption/exhaustion concept existed.
2. Liquidity sweep was binary (detected / not) — no RECLAIM vs BREAK vs REJECTION distinction once a sweep occurred.
3. No unified, rankable list of "meaningful market locations" — swing highs/lows, pools, and TPO VAH/VAL/POC existed as separate scattered reads with no common schema for Phase 7.5 to consume.

### New file: `lib/ai/oracle/liquidityOrderFlow.ts`
Three functions, all pure over the already-assembled `OracleContext` — **zero new fetches**.

#### 1. `buildLiquidityZones(ctx): LiquidityZone[]`
```
LiquidityZone {
  type: "SWING_HIGH" | "SWING_LOW" | "LIQUIDITY_POOL" | "VAH" | "VAL" | "POC"
  price: number
  side: "LONG" | "SHORT"        // expected resting-liquidity side
  strength: number              // 0-10, source-specific
  source: "swing" | "liquidity_pool" | "tpo"
  evidence: string
  quality: "real" | "proxy" | "unavailable"
  distanceFromPrice: number
}
```
- `SWING_HIGH`/`SWING_LOW`: most recent 5 per side from `findSwingPoints()` (already reused elsewhere in the pipeline).
- `LIQUIDITY_POOL`: swings clustered using the **same 0.4% tolerance `scanLiquidityPool()` uses internally** (not a new threshold). `scanLiquidityPool()` itself is still called and its bias/weight/text folded into the matching zone's evidence — it just can't supply a numeric price on its own (`ScanResult` has no price field), so the clustering step is re-expressed locally over already-computed `SwingPoint[]`, not re-deriving the swing detection itself.
- `VAH`/`VAL`/`POC`: read directly off `ctx.tpo`'s last session — zero extra computation.
- Deduplication: overlapping zones within `0.5x ATR(14)` (the same ATR series `smcIctFactor()` already computes) are merged, keeping the higher-strength zone and noting the overlap in its evidence rather than emitting near-duplicate entries.
- Insufficient candles (`< 20`) → empty array, never fabricated zones.

#### 2. `classifyLiquidityEvent(ctx): LiquidityEvent`
```
LiquidityEvent {
  type: "SWEEP" | "RECLAIM" | "BREAK" | "REJECTION" | "NO_CLEAR_EVENT"
  side: "LONG" | "SHORT" | null
  level: number | null
  evidence: string
  quality: "real" | "unavailable"
}
```
`scanLiquiditySweep()` is reused as the sole trigger (replayed against the last few candle slices to find the most recent trigger candle, without altering its own logic). What's new: inspecting the `FOLLOW_THROUGH_CANDLES = 3` candles *after* that trigger:
- Holds beyond the level **and** meaningfully continues (`> 0.3x ATR` net move) → `BREAK` (acceptance/continuation, not a reversal).
- Holds beyond the level without strong continuation → `RECLAIM`.
- Fails to hold, closes back through the level → `REJECTION`.
- Sweep found but fewer than 3 follow-through candles exist yet → `SWEEP` (reported honestly as unconfirmed, never forced into one of the above).
- No sweep trigger found at all → `NO_CLEAR_EVENT`.

#### 3. `buildOrderFlowPriceResponse(ctx): OrderFlowPriceResponse`
The core new analytical primitive — genuinely does not exist elsewhere.
```
OrderFlowPriceResponse {
  interpretation: "BUYING_PRESSURE" | "SELLING_PRESSURE" | "ABSORPTION" | "EXHAUSTION" | "NO_CLEAR_FLOW"
  deltaDirection: "buy" | "sell" | "neutral"
  deltaMagnitude: number
  priceDisplacement: number
  evidence: string
  quality: "real" | "unavailable"
}
```
Compares footprint delta over the same `OBSERVATION_WINDOW = 5` candles `footprintFactor()` already uses against actual price displacement over the exact same candle window (matched by timestamp):
- Delta ratio `< 0.05` (footprintFactor()'s own "near-balanced" cutoff) → `NO_CLEAR_FLOW`.
- Delta direction confirmed by displacement `> 0.5x ATR` in the same direction → `BUYING_PRESSURE`/`SELLING_PRESSURE`.
  - Within that, if the later half of the window's delta collapses to `< 40%` of the earlier half despite price having already extended → `EXHAUSTION` instead (flow losing effectiveness after the move, not still building).
- Delta confirmed direction but displacement `<= 0.5x ATR` or opposite → `ABSORPTION` (flagged as "potential", never asserted as certain).
- Missing/insufficient footprint or candle data → `NO_CLEAR_FLOW`, `quality: "unavailable"`.

All thresholds (`0.5x ATR`, the `0.05` delta-ratio cutoff, the `0.4%` pool tolerance) are reused from existing conventions already in `confluence.ts`/`scanners.ts`/`regime.ts` — none invented new for this phase.

### Evidence quality handling
`liquidity` zones stay `quality: "real"` when sourced from swings/TPO (both built off real candles) — the existing `proxy` tag on the *confluence* liquidity-volume-map factor is untouched and not conflated with this new zone list, which is swing/pool/TPO-derived, not traded-volume-derived. Nothing here upgrades a proxy read into a real one.

### Oracle response wiring
`app/api/elvoid-pro/oracle/route.ts`: calls `buildLiquidityOrderFlowContext(context)` after `assessment`/`risk`/`insight` are already computed, wrapped in try/catch (falls back to `null` on any failure, same pattern as `regime` in 7.3B), and returned as a new sibling `liquidityOrderFlow` field: `{ zones, event, priceResponse }`. Not read by `computeConfluence()`, `gradeConfluence()`, `insight.ts`, or `risk.ts` — kept fully separate per spec.

### Files changed / added
- **New:** `lib/ai/oracle/liquidityOrderFlow.ts`
- **New:** `scripts/phase7/liquidity-orderflow-fixtures.ts`
- `app/api/elvoid-pro/oracle/route.ts` — added the wiring block above.

No changes to `lib/ai/oracle/confluence.ts`, `grading.ts`, `gradingTypes.ts`, `risk.ts`, `execute.ts`, `insight.ts`, `mtf.ts`, `regime.ts`, `lib/elvoid/engine.ts`, or `/api/ai-signals`.

### Tests (`scripts/phase7/liquidity-orderflow-fixtures.ts`, pure/offline, real builders)
Uses the actual `buildFootprintByCandle()`/`buildTpoSessions()` builders (same functions `dataAdapters.ts` calls) against synthetic candles/trades — not hand-mocked Maps — so fixtures exercise the real integration.

**Zones:** swing liquidity ✅, pool liquidity (2 equal highs cluster) ✅, VAH/VAL/POC from TPO ✅, overlapping/duplicate levels dedupe ✅, unavailable source (insufficient candles → 0 zones) ✅.
**Events:** sweep+reclaim ✅, sweep+break/continuation ✅, rejection after failed follow-through ✅, insufficient follow-through (reports plain `SWEEP`, not forced) ✅, no sweep → `NO_CLEAR_EVENT` ✅.
**Price response:** positive delta + positive displacement → `BUYING_PRESSURE` ✅, negative delta + negative displacement → `SELLING_PRESSURE` ✅, positive delta + weak/no displacement → `ABSORPTION` ✅, negative delta + opposite displacement → `ABSORPTION` ✅, insufficient footprint → `NO_CLEAR_FLOW` ✅, balanced/conflicting delta → `NO_CLEAR_FLOW` ✅.

**16/16 passed.** Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/liquidity-orderflow-fixtures.ts`

Note: constructing the "varied swing prices" fixture required a deterministic drift+oscillation candle generator rather than a simple alternating zig-zag — a plain periodic zig-zag produces swing highs/lows within the same 0.4% pool tolerance of each other, collapsing everything into one `LIQUIDITY_POOL` zone after dedup rather than exercising distinct `SWING_HIGH`/`SWING_LOW`/`VAH`/`VAL`/`POC` types. Documented in the fixture file itself.

### Regression
- Phase 7.1 baseline: identical (`NO_TRADE`/`null`/`0`/unchanged risk plan/8 normalized factors).
- Phase 7.2 MTF fixtures: 7/7 still pass, unchanged.
- Phase 7.3B regime fixtures: 8/8 still pass, unchanged.
- Diff check: only `app/api/elvoid-pro/oracle/route.ts` modified among existing files (additive), plus the two new files above. `lib/elvoid/engine.ts` and `/api/ai-signals` confirmed untouched.

### Standard Elvoid AI
Untouched. `scanLiquidityPool()` and `scanLiquiditySweep()` are imported **read-only** from `lib/elvoid/scanners.ts` — that file itself was not modified, and `lib/elvoid/engine.ts` (which also calls `scanLiquidityPool()` for Standard signals) was not touched at all.

### Performance
Zero new network requests. All three functions operate on `context.candles`, `context.tpo`, and `context.footprint` — already fetched/built once per request by Phase 1's `assembleOracleContext()`. No new polling, no new cache layer.

### Known limitations
- `LIQUIDITY_POOL` zones only surface pools built from swing clustering (≥2 touches within 0.4%) — does not yet incorporate FVG edges or Order Block edges as zone types (spec listed these as "possible", not required); deferred since `smcIctFactor()`'s FVG/OB scanners don't currently expose numeric zone prices any more than `scanLiquidityPool()` does for pools — would need the same "expose price" treatment as pools got here if added later.
- `classifyLiquidityEvent()` only ever classifies the single most recent sweep trigger within its lookback window, not a full history of all sweeps in the candle series.
- `EXHAUSTION` detection (delta collapsing in the second half of the observation window) is a bounded heuristic (`<40%` of the earlier half), not a formal statistical test — documented in code comments as conservative/directional evidence, not a certainty claim, consistent with `ABSORPTION`'s own "potential, not asserted" framing.
- As with 7.2/7.3B, `tsc --noEmit`/`next build` could not run against a fully installed `node_modules` in this sandbox (no network for `npm install`) — recommend a live smoke-test of `/api/elvoid-pro/oracle` against a real symbol before considering 7.4 fully verified in production.

---

## Phase 7.5 — Scenario Engine

**Context/evidence generation only. Does NOT change the Pro decision** — `computeConfluence()`, `gradeConfluence()`, confidence, `dominantSide`, and `buildOracleRiskPlan()` are all unmodified. PRIMARY's direction always follows the already-decided `assessment.side`; this phase never re-decides direction.

### Step 1 audit findings
Scenario-shaped fields already existed but were shallow presentation strings, not a real model:
- `insight.primaryScenario`/`alternativeScenario` (`insight.ts`) **already existed** — `primaryScenario` was just `` `${side}: ${top 3 supportingEvidence}` ``; `alternativeScenario` was either `confluence.contradictions` text or leftover opposite-side firing text. Neither had a trigger, its own invalidation, or regime/MTF compatibility.
- `assessment.invalidation` (`grading.ts::buildInvalidation()`) **already existed** — a single string from either the TPO or market-structure factor's evidence for the graded side. Generic, never referenced Phase 7.4's liquidity events (didn't exist yet when written).
- `detectPatterns()` (`insight.ts`) already does real conditional logic (2+ markers must co-occur) but produces a label, not a scenario with trigger/invalidation.
- Conclusion: scenario logic can consume `assessment`/`confluence`/`regime`/`mtf`/`liquidityOrderFlow` directly — all already computed in `route.ts` before any scenario stage, zero refetch.

### New file: `lib/ai/oracle/scenario.ts`
`buildScenarios(assessment, confluence, regime?, mtf?, liquidityOrderFlow?): ScenarioContext` — pure, zero new fetch, zero new scoring.

```
Scenario {
  id, role: PRIMARY|ALTERNATIVE, direction: LONG|SHORT
  thesis: string
  supportingEvidence: { source, detail }[]   // detail copied verbatim from the originating module
  opposingEvidence: { source, detail }[]
  trigger: string
  invalidation: string
  strength: number                            // 0-100, readout of assessment.confidence — never independently scored
  regimeCompatibility: COMPATIBLE | REQUIRES_STRONGER_EVIDENCE | DEGRADED
  mtfCompatibility: ALIGNED | MIXED | UNAVAILABLE
}
ScenarioContext { primary: Scenario|null, alternative: Scenario|null, contextQuality: real|mixed|degraded|insufficient, note? }
```

**PRIMARY** — built only when `assessment.grade !== "NO_TRADE"` and `assessment.side` exists; direction is always `assessment.side`, never re-decided. Supporting evidence = `assessment.supportingEvidence` + any Phase 7.4 liquidity event/price-response signal that agrees directionally (including a REJECTION of the *opposite* side's failed sweep, which is itself mean-reversion support for this side). Trigger/invalidation reuse `assessment.invalidation` verbatim, enriched with the actual swept level from `liquidityOrderFlow.event.level` when it exists and matches direction — no new numeric level is ever invented.

**ALTERNATIVE** — only constructed when genuine opposing evidence exists: confluence contradictions, an MTF relationship indicating LTF/HTF disagreement (`PULLBACK_IN_*`, `CONTINUATION_AFTER_PULLBACK_*`, `HTF_THESIS_THREATENED_*`), an opposing liquidity event (RECLAIM/BREAK/REJECTION on the other side), or order-flow ABSORPTION/EXHAUSTION of the primary's own supporting delta. If none found → `alternative: null`, never forced to fill a slot. Its supporting evidence is exactly the opposing signals found; its opposing evidence mirrors the primary's supporting evidence (each side genuinely opposes the other, not two independently invented lists). Wording distinguishes "Pullback within HTF structure" (when the signal is an MTF pullback relationship) from "Rejection/mean-reversion" (when it's a REJECTION event) from a plain "Reversal" label otherwise. `strength` is a conservative fraction of `assessment.confidence` (30-60% depending on how many independent opposing signals exist) — a competing minority hypothesis by construction, never an independent score.

**Compatibility mappings** (deterministic, table-driven):
- `regimeCompatibility`: no regime/`quality:"unavailable"` → `DEGRADED`. `VOLATILE_UNCLEAR` → always `DEGRADED`. `RANGING` → `REQUIRES_STRONGER_EVIDENCE` unless the scenario is backed by a REJECTION-of-the-opposite-side event (mean-reversion-flavored) → `COMPATIBLE`. `TRENDING_UP`/`TRENDING_DOWN` → `COMPATIBLE` when the scenario's direction agrees with the trend, else `REQUIRES_STRONGER_EVIDENCE`.
- `mtfCompatibility`: reuses Phase 7.3B's alignment check directly — `regime.ts` now exports `mtfAlignmentForSide(desired, mtf)` (the same logic `classifyMarketRegime()`'s internal `computeMtfAlignment()` already used, refactored to accept an explicit LONG/SHORT side rather than only the regime's own trend direction) so the ALTERNATIVE's alignment (a direction the regime itself doesn't necessarily point at) can be checked without duplicating the comparison. 7.3B fixtures re-run and confirmed byte-identical behavior after this refactor.

### Oracle response wiring
`app/api/elvoid-pro/oracle/route.ts`: calls `buildScenarios(assessment, confluence, regime, mtf, liquidityOrderFlow)` after all of those are already computed, wrapped in try/catch (falls back to `null`, same pattern as regime/liquidityOrderFlow), returned as a new sibling `scenarios` field. Not read by `computeConfluence()`, `gradeConfluence()`, `insight.ts`, or `risk.ts`.

### Files changed / added
- **New:** `lib/ai/oracle/scenario.ts`
- **New:** `scripts/phase7/scenario-fixtures.ts`
- `lib/ai/oracle/regime.ts` — exported `mtfAlignmentForSide()` (extracted from the existing private `computeMtfAlignment()`, behavior-preserving refactor, re-verified against all 8 Phase 7.3B fixtures).
- `app/api/elvoid-pro/oracle/route.ts` — added the wiring block above.

No changes to `confluence.ts`, `grading.ts`, `gradingTypes.ts`, `risk.ts`, `execute.ts`, `insight.ts`, `mtf.ts`, `liquidityOrderFlow.ts`'s own logic, `lib/elvoid/engine.ts`, or `/api/ai-signals`.

### Tests (`scripts/phase7/scenario-fixtures.ts`, pure/offline, hand-typed fixtures)
Covers all 10 requested cases plus 2 extra (no-forced-alternative, verbatim evidence traceability) — **12/12 passed**: bullish continuation, bearish continuation, bullish sweep+reclaim (trigger/invalidation reference the real level), bearish sweep+reclaim, sweep+opposing BREAK → alternative created referencing the real level, HTF bullish+LTF pullback → SHORT "Pullback" alternative (not worded as a full reversal), HTF bearish+LTF pullback → LONG pullback alternative, ranging market (plain continuation → `REQUIRES_STRONGER_EVIDENCE`; REJECTION-backed → `COMPATIBLE`), volatile/unclear → `DEGRADED`, `NO_TRADE` → `{primary:null, alternative:null, contextQuality:"insufficient"}`.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/scenario-fixtures.ts`

### Regression
- Phase 7.1 baseline: identical.
- Phase 7.2 MTF fixtures: 7/7 unchanged.
- Phase 7.3B regime fixtures: 8/8 unchanged (re-verified after the `mtfAlignmentForSide()` refactor).
- Phase 7.4 liquidity/order-flow fixtures: 16/16 unchanged.
- Diff check: only `app/api/elvoid-pro/oracle/route.ts` and `lib/ai/oracle/regime.ts` modified among existing files (both additive/refactor-only), plus the two new files above. `lib/elvoid/engine.ts` and `/api/ai-signals` confirmed untouched.

### Standard Elvoid AI
Untouched — `scenario.ts` imports only from other `lib/ai/oracle/*` modules (all already Oracle-only), never from `lib/elvoid/engine.ts`.

### Performance
Zero new network requests. Operates entirely on `assessment`/`confluence`/`regime`/`mtf`/`liquidityOrderFlow`, all already computed once per request earlier in `route.ts`.

### Known limitations
- Only ever produces at most one PRIMARY and one ALTERNATIVE (not a ranked list of N competing scenarios) — matches the spec's illustrative example shape; a richer N-scenario model is left for a later phase if needed.
- `regimeCompatibility`'s RANGING/mean-reversion detection only recognizes a REJECTION liquidity event as "mean-reversion-flavored" — it does not yet consider TPO value-area rejection or order-book-imbalance-based mean-reversion signals as alternate mean-reversion evidence.
- `strength`'s minority-hypothesis fraction (30-60% of primary confidence) is a documented, bounded heuristic, not a calibrated probability.
- As with prior 7.x sub-phases, `tsc --noEmit`/`next build` could not run against a fully installed `node_modules` in this sandbox (no network for `npm install`) — recommend a live smoke-test of `/api/elvoid-pro/oracle` before considering 7.5 fully verified in production.

---

## Phase 7.6 — Contradiction Classifier

**Reclassification layer only. Does NOT change the Pro decision** — `computeConfluence()` and `gradeConfluence()` are unmodified in behavior (only one internal function in `grading.ts` was extracted/exported, verified behavior-identical via regression). `hasUnresolvedGenuineContradiction` is a descriptive readout, never written back into `assessment`/grading.

### Step 1 audit findings
- `detectContradictions()` (`confluence.ts`, Phase 2) already existed but only detected two shapes: single-factor internal ambiguity, and **one hardcoded pair** (`market_structure` vs `footprint`). No general cross-source detection.
- `crossSourceContradictionStrength()`/`hasInternalAmbiguity()` (`grading.ts`) already consume that list to cap the grade — grading-critical, left untouched (only refactored for reuse, see below).
- **`lib/ai/oracle/mtf.ts` contained an explicit, literal forward-reference**: `HTF_THESIS_THREATENED_*`'s own evidence string ends with "Belum diklasifikasikan sebagai invalidasi penuh (lihat Contradiction Classifier, Phase 7.6)" — a real, evidenced signal (protective level actually broken + LTF actually confirms) that was deliberately left unclassified until now.
- `scenario.ts::collectOpposingSignals()` (Phase 7.5) already aggregates opposing evidence from confluence/mtf/liquidityOrderFlow into `scenarios.primary.opposingEvidence`, but as a flat list with no severity/genuineness tagging of its own.

### New file: `lib/ai/oracle/contradiction.ts`
`classifyContradictions(confluence, assessment, mtf?, scenarios?): ContradictionReport` — pure reclassification, reuses rather than re-detects.

```
ClassifiedContradiction {
  description: string        // verbatim from the originating module
  sources: ConfluenceSource[]
  severity: LOW | MODERATE | HIGH
  genuineness: GENUINE | DATA_GAP | SAME_CLUSTER
  origin: confluence | mtf_thesis_threatened | scenario_opposing_evidence
}
ContradictionReport { contradictions: ClassifiedContradiction[], hasUnresolvedGenuineContradiction: boolean }
```

- **Severity** reuses `grading.ts`'s own severe(>8)/moderate(3-8) thresholds verbatim via a newly-**exported** `contradictionMagnitude()` (extracted from the previously-private `crossSourceContradictionStrength()`, which now just loops and calls it — behavior-identical, re-verified via full regression) — no competing severity scale introduced.
- **Genuineness** is computed independently of severity, per constraint: `DATA_GAP` when any involved factor's `quality !== "real"`; `SAME_CLUSTER` when all involved sources map to the same `CLUSTERS` group (reused from `grading.ts`, not redefined) but the disagreement is still real and keeps whatever severity its magnitude earns; otherwise `GENUINE`.
- **HTF-threatened resolution**: only classified (`HIGH`/`GENUINE`) when `mtf.relationship` is `HTF_THESIS_THREATENED_BULLISH`/`_BEARISH` **and** `assessment.side` matches the threatened bias — a threat to the side that isn't even being traded is not surfaced. `classifyMtfRelationship()` itself already verified the broken protective level and LTF confirmation before assigning this relationship; this function only checks whether it applies to the traded side.
- **Deduplication**: keyed on sorted `sources` + exact `description` text (not `origin`), so the same underlying conflict surfacing via both `confluence.contradictions` and `scenarios.primary.opposingEvidence` collapses to one entry.

### Oracle response wiring
`app/api/elvoid-pro/oracle/route.ts`: calls `classifyContradictions(confluence, assessment, mtf, scenarios)` after all four are already computed, wrapped in try/catch (falls back to `null`, same pattern as prior sub-phases), returned as a new sibling `contradictions` field.

### Files changed / added
- **New:** `lib/ai/oracle/contradiction.ts`
- **New:** `scripts/phase7/contradiction-fixtures.ts`
- `lib/ai/oracle/grading.ts` — extracted and exported `contradictionMagnitude()` from the previously-private `crossSourceContradictionStrength()` (pure refactor, zero behavior change, confirmed via 7.1 baseline regression).
- `app/api/elvoid-pro/oracle/route.ts` — added the wiring block above.

No changes to `confluence.ts`, `gradingTypes.ts`, `risk.ts`, `execute.ts`, `insight.ts`, `mtf.ts`'s own logic, `regime.ts`, `scenario.ts`'s own logic, `lib/elvoid/engine.ts`, or `/api/ai-signals`.

### Tests (`scripts/phase7/contradiction-fixtures.ts`, pure/offline, hand-typed fixtures) — 8/8 passed
Genuine cross-source (different clusters, both real) → `GENUINE`/`HIGH`; same-cluster disagreement → `SAME_CLUSTER` genuineness while severity independently stays `HIGH` (proving the two axes don't collapse into each other); data-gap (one side `proxy`) → `DATA_GAP`; HTF-threatened matching the traded side → `HIGH`/`GENUINE`, and **not** classified when the threat is on the side that isn't even being traded; the same conflict surfacing via both `confluence.contradictions` and scenario opposing evidence → deduplicates to exactly 1 entry; no contradictions → empty report; internal single-factor ambiguity → fixed `LOW` severity, excluded from `hasUnresolvedGenuineContradiction`.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/contradiction-fixtures.ts`

### Regression
- Phase 7.1 baseline: identical.
- Phase 7.2 MTF fixtures: 7/7 unchanged.
- Phase 7.3B regime fixtures: 8/8 unchanged.
- Phase 7.4 liquidity/order-flow fixtures: 16/16 unchanged.
- Phase 7.5 scenario fixtures: 12/12 unchanged.
- Diff check: only `app/api/elvoid-pro/oracle/route.ts` and `lib/ai/oracle/grading.ts` (extract-only refactor) modified among existing files, plus the two new files above. `lib/elvoid/engine.ts` and `/api/ai-signals` confirmed untouched.

### Standard Elvoid AI
Untouched — `contradiction.ts` only imports from other `lib/ai/oracle/*` modules.

### Performance
Zero new network requests. Pure over `confluence`/`assessment`/`mtf`/`scenarios`, all already computed once per request.

### Known limitations
- Only `scenarios.primary.opposingEvidence` entries whose `source === "confluence"` are folded in and deduplicated against `confluence.contradictions`; `mtf`/`liquidityOrderFlow`-sourced opposing-evidence entries in `scenarios` are intentionally left for the caller to read directly off the `scenarios` field rather than re-wrapped here, since they aren't duplicates of anything in `confluence.contradictions` to begin with and forcing them through the same `ConfluenceSource[]`-shaped `sources` field would require inventing a source mapping that doesn't cleanly exist.
- `fromMtfThreat()` always attributes `sources: ["market_structure"]` for the HTF-threatened case, since that's the real underlying cluster (HTF/LTF structure), even though the specific factor object involved isn't literally one row in `confluence.factors` — documented as a deliberate cluster-level attribution, not a literal factor reference.
- As with prior 7.x sub-phases, `tsc --noEmit`/`next build` could not run against a fully installed `node_modules` in this sandbox (no network for `npm install`) — recommend a live smoke-test of `/api/elvoid-pro/oracle` before considering 7.6 fully verified in production.

---

## Phase 7.7 — Decision Arbitration

**Annotation only. `gradeConfluence()` remains the sole canonical authority** for `side`/`grade`/`confidence`/`riskStatus` — this phase never recomputes, overrides, or feeds back into it. Fixture 10 explicitly asserts `assessment` is byte-identical before/after arbitration.

### Step 1 audit findings (from the prior approved audit turn)
- `gradeConfluence()` (`grading.ts`) is the sole point where the decision becomes authoritative — called once in `route.ts`, consumed directly by `execute.ts` for real paper-trade execution.
- No arbitration-like logic existed anywhere; the only reference was `mtf.ts`'s own forward-pointing comment naming "Phase 7.7 Decision Arbitration" as the future consumer of its context.
- All of Phases 7.3B–7.6's outputs (`regime`, `mtf`, `scenarios`, `contradictions`) were already additive siblings in the route response, never written back into grading — the same discipline continues here.

### New file: `lib/ai/oracle/arbitration.ts`
`arbitrateDecision(assessment, regime?, mtf?, scenarios?, contradictions?): DecisionArbitration` — pure, read-only.

```
DecisionArbitration {
  canonicalSide, canonicalGrade          // direct copies of assessment fields, never recomputed
  alignment: NOT_APPLICABLE | CONFLICTED | UNSUPPORTED_CONTEXT | SUPPORTED_WITH_CAUTION | STRONGLY_SUPPORTED
  reasons: string[]
  hasUnresolvedGenuineContradiction, regimeCompatibility, mtfCompatibility, hasAlternativeScenario
  alternativeIsActiveOpposition: boolean
  caveat: string | null
}
```

**Precedence (checked in this exact order, per spec):**
1. `assessment.grade === "NO_TRADE"` → `NOT_APPLICABLE`.
2. `contradictions.hasUnresolvedGenuineContradiction` → `CONFLICTED` — wins even when regime/MTF/scenario are otherwise fully compatible (fixture 9).
3. Missing `regime`/`mtf`/`scenarios`, or `regimeCompatibility` `DEGRADED`/unavailable, or `mtfCompatibility` `UNAVAILABLE` → `UNSUPPORTED_CONTEXT`.
4. `regimeCompatibility === "REQUIRES_STRONGER_EVIDENCE"`, or `mtfCompatibility === "MIXED"`, or an alternative scenario exists **and is active opposition** → `SUPPORTED_WITH_CAUTION`.
5. Otherwise → `STRONGLY_SUPPORTED`.

**Adjustment implemented — contingency vs. active-opposition alternatives:** `scenarios.alternative !== null` does **not** automatically downgrade alignment. `isActiveOpposition()` reuses only fields `scenario.ts` already computed — each `ScenarioEvidenceRef.source` on the alternative's own `supportingEvidence` (the exact opposing signals that seeded it) plus `mtf.relationship`:
- If every seeding signal came from `mtf` **and** the relationship is an ordinary pullback (`PULLBACK_IN_UPTREND`/`PULLBACK_IN_DOWNTREND`) → **contingency**, does not downgrade (fixture 7: `STRONGLY_SUPPORTED` despite a live alternative).
- Any confluence-contradiction-sourced signal, any liquidityOrderFlow-sourced signal, or an `mtf`-sourced signal that is `HTF_THESIS_THREATENED_*` (already Phase 7.6's own `HIGH`/`GENUINE` case) → **active opposition**, downgrades to `SUPPORTED_WITH_CAUTION` (fixtures 5 and 6).

No new opposing-signal detector was written — this is purely a classification of which existing evidence type produced the alternative.

### Oracle response wiring
`app/api/elvoid-pro/oracle/route.ts`: calls `arbitrateDecision(assessment, regime, mtf, scenarios, contradictions)` after all four are already computed, wrapped in try/catch (falls back to `null`, same pattern as every prior sub-phase), returned as a new sibling `arbitration` field. `execute.ts`'s Execute Signal path is untouched — it still reads `OracleAssessment` directly, exactly as before.

### Files changed / added
- **New:** `lib/ai/oracle/arbitration.ts`
- **New:** `scripts/phase7/arbitration-fixtures.ts`
- `app/api/elvoid-pro/oracle/route.ts` — added the wiring block above.

No changes to `grading.ts`, `confluence.ts`, `gradingTypes.ts`, `risk.ts`, `execute.ts`, `insight.ts`, `mtf.ts`, `regime.ts`, `liquidityOrderFlow.ts`, `scenario.ts`, `contradiction.ts`, `lib/elvoid/engine.ts`, or `/api/ai-signals`.

### Tests (`scripts/phase7/arbitration-fixtures.ts`, pure/offline, hand-typed fixtures) — 10/10 passed
`NO_TRADE` → `NOT_APPLICABLE`; unresolved genuine contradiction → `CONFLICTED`; missing regime / `DEGRADED` regimeCompatibility → `UNSUPPORTED_CONTEXT`; `REQUIRES_STRONGER_EVIDENCE`/`MIXED` → `SUPPORTED_WITH_CAUTION`; active-opposition alternative (confluence-sourced, and separately HTF-threatened-sourced) → `SUPPORTED_WITH_CAUTION`; **ordinary-pullback-only alternative → `STRONGLY_SUPPORTED`, confirming the adjustment**; fully aligned with no alternative → `STRONGLY_SUPPORTED`; precedence check (`CONFLICTED` wins over an otherwise-compatible context); and a direct mutation check confirming `assessment` is byte-identical before/after.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/arbitration-fixtures.ts`

### Regression
- Phase 7.1 baseline: identical.
- Phase 7.2 MTF fixtures: 7/7 unchanged.
- Phase 7.3B regime fixtures: 8/8 unchanged.
- Phase 7.4 liquidity/order-flow fixtures: 16/16 unchanged.
- Phase 7.5 scenario fixtures: 12/12 unchanged.
- Phase 7.6 contradiction fixtures: 8/8 unchanged.
- Diff check: only `app/api/elvoid-pro/oracle/route.ts` modified among existing files, plus the new file above. `lib/elvoid/engine.ts` and `/api/ai-signals` confirmed untouched.

### Standard Elvoid AI
Untouched — `arbitration.ts` only imports from other `lib/ai/oracle/*` modules; `execute.ts`'s Execute Signal path was not modified.

### Performance
Zero new network requests. Pure over `assessment`/`regime`/`mtf`/`scenarios`/`contradictions`, all already computed once per request.

### Known limitations
- `alignment` is a 5-tier descriptive readout, not a numeric confidence-of-confidence score — deliberately, per the spec's own emphasis on annotation over a second scoring engine.
- The contingency-vs-active-opposition rule currently only distinguishes by evidence *source type* (mtf-pullback-only vs. everything else) — it does not weigh how many opposing signals exist or their individual strength; documented as a binary classification, not a graded one.
- As with prior 7.x sub-phases, `tsc --noEmit`/`next build` could not run against a fully installed `node_modules` in this sandbox (no network for `npm install`) — recommend a live smoke-test of `/api/elvoid-pro/oracle` before considering 7.7 fully verified in production.

---

## Phase 7.8 — Risk Intelligence

**Descriptive annotation only. Does NOT change the risk plan or grading** — `gradeConfluence()`, `assessment.side`/`.grade`/`.confidence`/`.riskStatus`, `risk.ts`, and `execute.ts` are all unmodified. `overall` is a plain `RiskSeverity` readout, never an execution gate, confidence adjustment, or hidden second grading engine. Fixture 11 directly asserts every input object is byte-identical before/after.

### Audit summary (from the prior approved audit turn)
- The only existing risk gate anywhere is `evaluateRisk()` in `grading.ts` (R:R `< 1` → `"invalid"`), consumed solely by `execute.ts`'s `riskStatus !== "valid"` check. No volatility classification, invalidation-distance measurement, or liquidity-proximity check existed anywhere.
- **Scope discrepancy flagged and resolved per your instruction**: the Phase 7.3B `CHANGES.md` planning note described a heavier TP1/TP2/TP3 + entry-range redesign of `OracleRiskPlan` itself — explicitly deferred, **not** implemented here. This phase is the additive interpretation layer only, consistent with constraint 9.
- No literal "Phase 7.8" forward-reference existed in code (unlike 7.6/7.7) beyond that self-authored planning note.

### New file: `lib/ai/oracle/riskIntelligence.ts`
`buildRiskIntelligence(context, risk, side, regime?, scenarios?, contradictions?, arbitration?, liquidityOrderFlow?): RiskIntelligence` — pure, read-only, zero new fetch.

```
RiskFactor { kind: STRUCTURAL|VOLATILITY|LIQUIDITY_PROXIMITY|CONTRADICTION|SCENARIO|CONTEXT, severity: LOW|MODERATE|HIGH, evidence, quality: real|proxy|unavailable, source }
RiskIntelligence {
  overall: RiskSeverity            // descriptive only — never an execution gate
  factors: RiskFactor[]
  invalidationDistanceAtr: number | null
  liquidityProximity: { nearestOpposingZone, withinRiskZone } | null
  contextQuality: real | mixed | degraded | insufficient
}
```

**Two new calculations, both reusing the existing 0.5x ATR convention** already established twice in `liquidityOrderFlow.ts` (zone-dedup radius, "meaningful price move" cutoff) — no new threshold invented:
- `invalidationDistanceAtr = |entry - stopLoss| / ATR(14)`. `< 0.5x` → `STRUCTURAL` `HIGH`; `< 1x` → `STRUCTURAL` `MODERATE`.
- `liquidityProximity`: checks whether `risk.stopLoss`/`.takeProfit` sits within `0.5x ATR` of a **real-quality, opposing-side** `LiquidityZone` (Phase 7.4) — only real zones count, proxy zones never produce this factor (fixture 9).

**One additional reused-not-invented convention added this phase**: `MIN_CANDLES_FOR_RELIABLE_ATR = 29`, the exact same `period*2+1` minimum already established as `MIN_CANDLES_FOR_ADX` in `regime.ts` (both `atr()` and `calcAdx()` are `EMA(14)`-based) — needed because `atr()`'s own EMA still returns a non-zero number well before it has enough samples to be reliable, so `atrValue <= 0` alone can't detect "insufficient history" (caught by fixture 3 on first run, fixed by reusing this precedent rather than inventing a new number).

**Everything else is a reclassification of already-computed verdicts, zero new detection**:
- `CONTRADICTION` factor ← `contradictions.hasUnresolvedGenuineContradiction` + the report's own `GENUINE`/non-`LOW` entries and their severities.
- `SCENARIO` factor ← `arbitration.alternativeIsActiveOpposition` (Phase 7.7) — only produced when the alternative is real active opposition, not a mere contingency, fixed `MODERATE`.
- `CONTEXT` factor ← `arbitration.alignment`: `CONFLICTED` → `HIGH`; `UNSUPPORTED_CONTEXT` → `MODERATE`, `quality: "unavailable"` (missing context is never treated as confirmed danger); `SUPPORTED_WITH_CAUTION`/`STRONGLY_SUPPORTED` → no `CONTEXT` factor (fixture 8 confirms a merely-cautious-but-not-conflicted arbitration doesn't manufacture one).

**Aggregation rule (`overall`)**: only `REAL`-quality factors can drive `overall` to `HIGH`; a `proxy`/`unavailable`-quality factor is capped at contributing `MODERATE` at most — per constraint 7, missing/proxy data never manufactures confirmed risk.

### Oracle response wiring
`app/api/elvoid-pro/oracle/route.ts`: calls `buildRiskIntelligence(context, risk, assessment.side, regime, scenarios, contradictions, arbitration, liquidityOrderFlow)` **after `arbitration`** (its natural dependency, per constraint 3), wrapped in try/catch (falls back to `null`, same pattern as every prior sub-phase), returned as a new sibling `riskIntelligence` field.

### Files changed / added
- **New:** `lib/ai/oracle/riskIntelligence.ts`
- **New:** `scripts/phase7/risk-intelligence-fixtures.ts`
- `app/api/elvoid-pro/oracle/route.ts` — added the wiring block above.

No changes to `grading.ts`, `gradingTypes.ts`, `risk.ts`, `execute.ts`, `confluence.ts`, `mtf.ts`, `regime.ts`, `liquidityOrderFlow.ts`, `scenario.ts`, `contradiction.ts`, `arbitration.ts`'s own logic, `lib/elvoid/engine.ts`, or `/api/ai-signals`.

### Tests (`scripts/phase7/risk-intelligence-fixtures.ts`, pure/offline, real ATR via synthetic candles) — 11/11 passed
Clean low-risk setup → `LOW`, no factors; tight SL (`<0.5x ATR`) → `STRUCTURAL` `HIGH`, overall `HIGH`; insufficient candle history for ATR → honestly `quality: "unavailable"`, capped `LOW` overall (not fabricated); TP near a real opposing liquidity zone → `LIQUIDITY_PROXIMITY` factor; genuine unresolved contradiction → `CONTRADICTION` `HIGH`; fully-missing context (regime/scenarios/contradictions/arbitration/liquidityOrderFlow all `null`) → `contextQuality: "degraded"`, zero fabricated factors from the missing pieces; active-opposition alternative scenario → `SCENARIO` `MODERATE`; merely-cautious (mixed MTF, not conflicted) arbitration → no `CONTEXT` factor manufactured; **proxy-quality liquidity zone → never counted as a proximity risk** (constraint 7 directly verified); no risk plan/side → `contextQuality: "insufficient"`, empty factors; and a full mutation-safety check across all 7 input objects.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/risk-intelligence-fixtures.ts`

### Regression
- Phase 7.1 baseline: identical.
- Phase 7.2 MTF fixtures: 7/7 unchanged.
- Phase 7.3B regime fixtures: 8/8 unchanged.
- Phase 7.4 liquidity/order-flow fixtures: 16/16 unchanged.
- Phase 7.5 scenario fixtures: 12/12 unchanged.
- Phase 7.6 contradiction fixtures: 8/8 unchanged.
- Phase 7.7 arbitration fixtures: 10/10 unchanged.
- Diff check: only `app/api/elvoid-pro/oracle/route.ts` modified among existing files, plus the new file above. `risk.ts`, `execute.ts`, `lib/elvoid/engine.ts`, and `/api/ai-signals` confirmed untouched.

### Standard Elvoid AI
Untouched — `riskIntelligence.ts` only imports from other `lib/ai/oracle/*` modules and `lib/elvoid/indicators.ts`'s already-shared `atr()` (same function `risk.ts` and `regime.ts` already both import read-only).

### Performance
Zero new network requests. Pure over `context.candles` (already fetched), `risk` (already computed), and the five already-computed 7.2–7.7 context objects.

### Known limitations
- `liquidityProximity` only checks `risk.stopLoss`/`.takeProfit` against zones from Phase 7.4's `buildLiquidityZones()` — it does not check the entry price itself, since entry proximity to a zone isn't a risk concern the same way SL/TP proximity is.
- The TP1/TP2/TP3 + entry-range risk-plan redesign remains explicitly deferred (per constraint 9) — `overall`/`factors` here describe risk around the existing single-TP `OracleRiskPlan`, not a richer multi-target plan.
- `MIN_CANDLES_FOR_RELIABLE_ATR` reuses `regime.ts`'s precedent exactly, but is technically a second copy of that same constant rather than an imported shared one — documented as intentional (keeps each module's honesty threshold self-contained and independently auditable) rather than introducing a cross-module dependency for a single primitive number.
- As with every prior 7.x sub-phase, `tsc --noEmit`/`next build` could not run against a fully installed `node_modules` in this sandbox (no network for `npm install`) — recommend a live smoke-test of `/api/elvoid-pro/oracle` before considering 7.8 fully verified in production.

---

## Phase 7.9 — LLM Reasoning

**Narrative/interpretation layer only. NEVER a decision engine.** `gradeConfluence()`, `assessment.side`/`.grade`/`.confidence`/`.riskStatus`/`.invalidation`, and every price level (`entry`/`stopLoss`/`takeProfit`) always come directly from `assessment`/`risk` — the model is never asked for them, they are structurally absent from the schema it's allowed to return (`RawReasoningResponse` has no such fields), and fixture E explicitly proves that even when a response volunteers them anyway, the assembled `OracleReasoning` never carries them.

### Audit summary (from the prior approved audit turn)
- No LLM reasoning layer existed anywhere in `lib/ai/oracle/`.
- `lib/ai/core/modules/oracle.ts` (**Standard's** own AI Oracle narrative module, used only by `/api/ai-signals`) already solved this exact class of problem for the deterministic ElVoid AI signal — used strictly as a **behavioral template**, never modified or imported.
- The underlying `callAiCore()`/`lib/ai/core/router.ts`/`lib/ai/core/llm.ts` are generic, already-reusable infrastructure — imported read-only.
- `/api/ai-signals` gates its optional LLM call behind `reserveEnergy("ai_reasoning")`/`settleEnergy`; the Pro Oracle route had zero AI Energy involvement. **Per your explicit decision, Pro Oracle reasoning is bundled into Pro membership — no AI Energy consumption added, `reserveEnergy()`/`settleEnergy()` untouched for Standard.**

### New file: `lib/ai/oracle/reasoning.ts`
`buildOracleReasoning(assessment, confluence, regime?, mtf?, liquidityOrderFlow?, scenarios?, contradictions?, arbitration?, riskIntelligence?): Promise<OracleReasoning>` — never throws, always resolves.

```
OracleReasoning {
  summary, thesis, supportingEvidence[], opposingEvidence[], riskAssessment, scenarioAssessment
  uncertainty: string | null
  caveats: string[]
  sourceRefs: string[]          // filtered to only identifiers that genuinely exist in the payload
  quality: real | mixed | degraded | unavailable   // clamped to a payload-derived ceiling, never model-claimed
  generatedBy: "ai" | "fallback"
}
```

- **New prompt constant** `ORACLE_PRO_REASONING_PROMPT` appended to `lib/ai/core/prompts.ts` (additive — `ORACLE_PROMPT`, `TECHNICAL_ANALYST_PROMPT`, and every other existing prompt untouched), explicitly instructing the model never to invent price levels, to respect `real`/`proxy`/`unavailable` quality tags, to only use source identifiers that exist in the data, and to express insufficient evidence via `uncertainty`/`caveats`.
- **Payload**: assembled from already-computed `assessment`/`regime`/`mtf`/`liquidityOrderFlow`/`scenarios`/`contradictions`/`arbitration`/`riskIntelligence` — **never `context.candles`** (fixture I verifies no `"candles"` key exists anywhere in the serialized payload). `liquidityOrderFlow.zones` trimmed to the **5 nearest** using the existing `distanceFromPrice` ordering `buildLiquidityZones()` already applies — sliced, not resorted (fixture H).
- **Strict type guard** (`isValidReasoningShape`) validates every required field/type before any response is trusted — malformed JSON, wrong field types, or a missing field all fail completely and fall back (fixtures B/C/D), never partially trusted.
- **Provenance validation**: `sourceRefs` returned by the model are filtered (`filterKnownSourceRefs`) against the actual set of `source`/`origin` identifiers present in the payload (`ScenarioEvidenceRef.source`, `ClassifiedContradiction.origin`, `RiskFactor.source`, plus the fixed top-level module names) — invented identifiers are silently dropped rather than trusted (fixture J).
- **Quality ceiling**: `computePayloadQualityCeiling()` derives the maximum honest `quality` from the payload itself (missing context → `degraded`; any non-`real` regime/zone/event/priceResponse/riskIntelligence quality → `mixed`; otherwise `real`). `clampQuality()` then caps whatever the model claims at this ceiling — a model claiming `"real"` over a payload containing a `proxy` zone is clamped down (fixture F), directly implementing "never let the model upgrade proxy/unavailable to real."
- **Deterministic fallback** (`deterministicFallback()`): built entirely from already-computed fields (gradeReason, primary/alternative scenario theses, riskIntelligence factors, arbitration caveat) — complete and correct with zero LLM involvement, `generatedBy: "fallback"`.

### Oracle response wiring
`app/api/elvoid-pro/oracle/route.ts`: calls `buildOracleReasoning(...)` **after `riskIntelligence`** (its natural dependency), `await`ed, wrapped in try/catch (falls back to `null` at the route level on top of `buildOracleReasoning()`'s own internal fallback — belt and suspenders, same pattern as every prior sub-phase), returned as a new sibling `reasoning` field. No AI Energy gating added to this route.

### Files changed / added
- **New:** `lib/ai/oracle/reasoning.ts`
- **New:** `scripts/phase7/reasoning-fixtures.ts`
- `lib/ai/core/prompts.ts` — added `ORACLE_PRO_REASONING_PROMPT` (additive only).
- `app/api/elvoid-pro/oracle/route.ts` — added the wiring block above.

No changes to `lib/ai/core/modules/oracle.ts`, `lib/ai/core/llm.ts`, `lib/ai/core/router.ts`, `ORACLE_PROMPT`/`TECHNICAL_ANALYST_PROMPT`/any other existing prompt, `lib/energyGate.ts`, `grading.ts`'s decision logic, `risk.ts`, `execute.ts`, `lib/elvoid/engine.ts`, or `/api/ai-signals`.

### Tests (`scripts/phase7/reasoning-fixtures.ts`, pure/offline where possible) — all cases A–L passed
**A** valid AI response → `generatedBy: "ai"`, fields copied through. **B** malformed (non-object) JSON → shape validation fails. **C** invalid schema (wrong field type) → fails. **D** missing required field → fails. **E** model volunteers `side`/`grade`/`confidence`/`entry`/`stopLoss`/`takeProfit`/`riskStatus`/`invalidation` → shape validation still passes (extra fields ignored, not required) **but the assembled `OracleReasoning` provably never carries any of them** (explicit key-absence check). **F** proxy-quality zone in payload → quality ceiling capped below `"real"`, and a model dishonestly claiming `"real"` is clamped back down. **G** fully missing context → fallback `quality: "degraded"` with a non-null `uncertainty`. **H** 12 zones in → trimmed to exactly 5, existing nearest-first order preserved. **I** payload serialization contains no `"candles"` key anywhere. **J** `sourceRefs` filtered to only identifiers that actually exist in the payload; an invented identifier is dropped. **K** all 8 deterministic input objects left byte-identical after both `assembleFromAiResult()` and `deterministicFallback()` run. **L** full end-to-end `buildOracleReasoning()` call — since no `GROQ_API_KEY`/`OPENROUTER_API_KEY` is configured in this sandbox, this naturally exercises the real `callAiCore()` → `null` → fallback path live, proving LLM unavailability never breaks the response.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase7/reasoning-fixtures.ts`

### Regression
- Phase 7.1 baseline: identical.
- Phase 7.2 MTF fixtures: 7/7 unchanged.
- Phase 7.3B regime fixtures: 8/8 unchanged.
- Phase 7.4 liquidity/order-flow fixtures: 16/16 unchanged.
- Phase 7.5 scenario fixtures: 12/12 unchanged.
- Phase 7.6 contradiction fixtures: 8/8 unchanged.
- Phase 7.7 arbitration fixtures: 10/10 unchanged.
- Phase 7.8 risk intelligence fixtures: 11/11 unchanged.
- Diff check: only `app/api/elvoid-pro/oracle/route.ts` and `lib/ai/core/prompts.ts` (additive) modified among existing files, plus the two new files above. `execute.ts`, `lib/elvoid/engine.ts`, `/api/ai-signals`, `lib/ai/core/modules/oracle.ts`, and `lib/energyGate.ts` confirmed untouched.

### Standard Elvoid AI
Untouched — `reasoning.ts` only imports the generic `callAiCore()` and the new (additive-only) prompt constant; `lib/ai/core/modules/oracle.ts` was used purely as a design reference, never modified or imported.

### Performance / cost
No new AI Energy accounting introduced (per explicit decision — bundled into Pro membership). Rate limiting/abuse protection explicitly deferred as a future concern, per your instruction. No caching introduced this phase, also per instruction. Zero new fetches beyond the single optional LLM call itself; no raw candles ever transmitted.

### Known limitations
- No caching/deduplication — every Oracle request that reaches this stage makes a fresh LLM attempt when a provider is configured. Flagged in the audit as a future cost concern, explicitly deferred per this turn's instructions.
- No AI Energy accounting and no execution gating — both explicitly out of scope per this turn's instructions.
- `sourceRefs` filtering is exact-string-match against known identifiers — a model that paraphrases a real source name slightly differently will have that ref dropped rather than fuzzy-matched; treated as the safer failure mode (silently losing a citation vs. accepting an unverifiable one).
- As with every prior 7.x sub-phase, `tsc --noEmit`/`next build` could not run against a fully installed `node_modules` in this sandbox (no network for `npm install`) — this was NOT claimed as production verification; recommend a live smoke-test of `/api/elvoid-pro/oracle` (both with and without an `AI_CHAT_PROVIDER`/`GROQ_API_KEY`/`OPENROUTER_API_KEY` configured) before considering 7.9 fully verified in production.

---

## Phase 8.0.1 — Cognitive Observation Layer

### Objective
Implement the first Cognitive Layer primitive — **Cognitive Observation**: a deterministic, immutable, read-only snapshot describing what the ELVOID PRO ORACLE already knows at a single point in time. Strictly downstream of the canonical Oracle decision; never a new trading signal, never a second decision engine.

### Architecture
```
Market/Data Layer
        v
Deterministic Oracle Analysis
        v
Canonical Oracle Decision
        v
Cognitive Observation (NEW — READ ONLY)
        v
Future Cognitive Modules
        v
Optional LLM Narrative
```

### New files
- **`lib/ai/cognitive/types.ts`** — `CognitiveEvidenceRef`, a plain type alias to the existing `NormalizedEvidence` (`lib/ai/oracle/evidence.ts`). No duplicate evidence schema.
- **`lib/ai/cognitive/contracts.ts`** — the `CognitiveObservation` interface:
  ```
  CognitiveObservation {
    generatedAt: string            // ISO — only naturally time-dependent field
    symbol: string
    sourceAssessment: Readonly<Pick<OracleAssessment, "side"|"grade"|"confidence"|"riskStatus"|"invalidation">>
    evidence: readonly CognitiveEvidenceRef[]
    context: {
      confluenceAvailable, mtfAvailable, regimeAvailable, liquidityAvailable,
      scenariosAvailable, contradictionsAvailable, arbitrationAvailable,
      riskIntelligenceAvailable: boolean
    }
    quality: "real" | "mixed" | "degraded" | "unavailable"   // reuses ReasoningQuality from reasoning.ts, not a new union
  }
  ```
  Carries an explicit top-of-file authority comment: downstream/read-only, never mutates `OracleAssessment`, never overrides canonical side/grade/confidence/riskStatus, never executes trades, not a trading signal.
- **`lib/ai/cognitive/observation.ts`** — `buildCognitiveObservation(input: BuildCognitiveObservationInput): CognitiveObservation`:
  - **Evidence**: calls the *existing* `normalizeEvidence(confluence, mtf?.anchorInterval)` (`evidence.ts`) — the only already-computed collection that is honestly `NormalizedEvidence`-shaped without fabricating `direction`/`strength`/`quality`/`cluster`. A defensive, order-preserving `dedupeEvidence()` pass (keyed on `source::evidence` text) guards against duplicate factors without ever sorting or mutating the source array. Scenario evidence refs / contradiction sources / risk factors are **not** forced into this schema — left in their own module's shape, per spec.
  - **Context availability**: `input.mtf/regime/liquidityOrderFlow/scenarios/contradictions/arbitration/riskIntelligence` each map `null`/`undefined` → `false`, `!!value` → `true`. Missing context is never interpreted as agreement.
  - **Quality aggregation** (deterministic, documented in-code):
    - `unavailable` — zero meaningful (non-`"unavailable"`-quality) evidence **and** zero context modules available.
    - `degraded` — any of the 8 context modules unavailable and no `"real"`-quality evidence exists, **or** all 8 modules available but no `"real"`-quality evidence exists.
    - `mixed` — some context missing but at least one `"real"`-quality evidence entry exists, **or** all context available with a mix of `"real"` and `"proxy"/"unavailable"` evidence.
    - `real` — all 8 context modules available **and** every evidence entry is `"real"`-quality (at least one entry).
    - Quality is never upgraded past what the actual evidence/context supports.
  - **Immutability**: `sourceAssessment` and `evidence` are freshly constructed objects/arrays — never live references into `assessment`/`confluence`. No input is ever written to.
  - **No recomputation**: takes only already-computed results as plain data; has no import path to `computeConfluence`/`gradeConfluence`/`buildOracleRiskPlan`/`buildMtfContext`/`classifyMarketRegime`/`buildLiquidityOrderFlowContext`/`buildScenarios`/`classifyContradictions`/`arbitrateDecision`/`buildRiskIntelligence`/`buildOracleReasoning`.
  - **No LLM**: zero import of `lib/ai/core/llm.ts`, zero call to `callAiCore()`.
  - Synchronous, pure, throws only on genuinely malformed input (caught defensively at the route level, same pattern as every 7.x sub-phase).
- **`scripts/phase8/cognitive-observation-fixtures.ts`** — dev-only, offline, no network/DB/LLM. 10 cases (see Tests below).

### Route wiring
`app/api/elvoid-pro/oracle/route.ts`:
- Added `buildCognitiveObservation({ symbol, assessment, confluence, mtf, regime, liquidityOrderFlow, scenarios, contradictions, arbitration, riskIntelligence })`, placed **after `riskIntelligence`, before Phase 7.9 Reasoning** (all intended deterministic inputs already exist at that point).
- Wrapped in the same `try { ... } catch { = null }` pattern as every prior 7.x sub-phase — `cognitiveObservation` becomes `null` on any internal failure and the rest of the pipeline (assessment/grading/risk/execution eligibility/existing reasoning/API response) is completely unaffected.
- Added `cognitiveObservation` as a new, additive sibling field in the JSON response. No existing response field renamed, removed, or restructured.

### Evidence reuse confirmation
`buildCognitiveObservation()` never redefines evidence detection — it exclusively consumes `normalizeEvidence()`'s output, which is itself `NormalizedEvidence[]` (`evidence.ts`, Phase 7.1, unmodified). Confirmed by fixture 5 (shape compatibility check) and fixture 9 (verbatim pass-through of a custom confluence factor's `source`/`evidence`/`strength`).

### Canonical authority preservation
`sourceAssessment` only ever copies `side`/`grade`/`confidence`/`riskStatus`/`invalidation` — no `cognitiveSide`/`cognitiveGrade`/`cognitiveConfidence`/`cognitiveRiskStatus` exists anywhere in the Cognitive Layer's types or output (fixture 8, explicit key-absence check on both the top-level observation and `sourceAssessment`). The original `assessment` object is provably unchanged after the call (fixture 8 + fixture 7).

### Input immutability verification
Fixture 7: all 9 inputs (`assessment`, `confluence`, `mtf`, `regime`, `liquidityOrderFlow`, `scenarios`, `contradictions`, `arbitration`, `riskIntelligence`) snapshotted via `JSON.stringify` before the call and re-compared byte-for-byte after — identical.

### Context degradation behavior
Fixture 2: all 6 optional context modules set to `null` → every corresponding `*Available` flag is `false`, `confluenceAvailable` stays `true` (it's a required input), and `quality` degrades honestly (`mixed` or `degraded`, never `real`). Fixture 4: only-`"unavailable"`-quality evidence plus all optional context missing → `quality === "degraded"`.

### Tests (`scripts/phase8/cognitive-observation-fixtures.ts`) — 10/10 passed
1. Complete real observation → created, canonical fields copied correctly, all context flags true, evidence collected, `quality === "real"`.
2. Missing optional context → no crash, flags false, quality degrades honestly.
3. Proxy evidence present alongside real → aggregate quality never upgrades to `"real"`.
4. Only unavailable-quality evidence + missing context → `quality === "degraded"`.
5. Evidence stays structurally compatible with `NormalizedEvidence` (no duplicate incompatible schema).
6. Determinism — same inputs called twice produce byte-identical output (ignoring `generatedAt`).
7. Input mutation safety — all 9 inputs byte-identical after the call.
8. Canonical authority safety — no forbidden `cognitive*` keys anywhere; original `assessment` unchanged.
9. No recomputation side effects — observation reflects exactly the supplied confluence factor, not an independently re-derived value.
10. Context-only resilience — documented as impractical to exercise at the true route level in this offline sandbox (the route also depends on a live Binance fetch via `assembleOracleContext`, unavailable here); function-level null-safety across every optional input is covered by cases 2 and 4 instead. Documented honestly rather than faked.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-observation-fixtures.ts`

### Regression
- Phase 7.1 baseline script: ran clean, output unchanged in shape (`dominantSide`/`grade`/`side`/`confidence`/etc. identical to before this phase).
- Phase 7.2 MTF fixtures: 7/7.
- Phase 7.3B regime fixtures: 8/8.
- Phase 7.4 liquidity/order-flow fixtures: 16/16.
- Phase 7.5 scenario fixtures: 13/13.
- Phase 7.6 contradiction fixtures: 8/8.
- Phase 7.7 arbitration fixtures: 12/12.
- Phase 7.8 risk intelligence fixtures: 11/11.
- Phase 7.9 reasoning fixtures: 14/14 (fallback path exercised live — no LLM key configured in this sandbox).
- Diff scope check (`git status --porcelain` after reverting `npm install`'s incidental `package-lock.json`/`tsconfig.tsbuildinfo` churn): only `app/api/elvoid-pro/oracle/route.ts` modified among existing tracked files, plus the new `lib/ai/cognitive/` directory, `scripts/phase8/`, and this README/CHANGES update. `git diff --stat` against every forbidden file (`grading.ts`, `confluence.ts`, `risk.ts`, `execute.ts`, `reasoning.ts`, `lib/elvoid/engine.ts`, `lib/ai/core/modules/oracle.ts`, `lib/ai/core/llm.ts`, `lib/ai/core/router.ts`, `lib/supabase.ts`) returned empty.

### Standard Elvoid AI
Confirmed unchanged — `git diff --stat` returned no output for `lib/elvoid/engine.ts`, `lib/ai/core/modules/oracle.ts`, and everything under `/api/ai-signals`. The Cognitive Layer imports only from `lib/ai/oracle/*` and `lib/ai/cognitive/*`; it never imports anything from Standard Elvoid AI's module tree.

### Typecheck / build
- `npx tsc --noEmit` — **clean, zero errors** (this sandbox had network access for `npm install`, unlike prior 7.x phases where this was previously unavailable — 624 packages installed successfully).
- `npx next build` — reached the webpack compile stage (past typecheck) but failed on `next/font`'s Google Fonts fetch (`fonts.googleapis.com` not in this sandbox's allowed egress list) — an unrelated, pre-existing sandbox network constraint on `app/layout.tsx`'s font imports, not a regression introduced by this phase. Not claimed as a passing production build.

### Known limitations
- `next build` could not fully complete in this sandbox due to blocked Google Fonts egress — recommend a live build check before deploying.
- Fixture case 10 (route-level failure isolation) is documented, not executed, since the route's other dependency (`assembleOracleContext`'s live Binance fetch) has no offline path in this sandbox.
- `npm install` was run in this sandbox to enable typecheck; its incidental `package-lock.json`/`tsconfig.tsbuildinfo` diffs were reverted via `git checkout` before finalizing the change set — the delivered ZIP does not include `node_modules/`, `.next/`, or any lockfile change.

### Scope check
NEW: `lib/ai/cognitive/types.ts`, `lib/ai/cognitive/contracts.ts`, `lib/ai/cognitive/observation.ts`, `scripts/phase8/cognitive-observation-fixtures.ts`.
MODIFIED: `app/api/elvoid-pro/oracle/route.ts`, `README.md`, `CHANGES.md`.
No other files changed.

---

## Phase 8.0.2 — Cognitive Working Memory

### Objective
Build a minimal, request-scoped Cognitive Working Memory layer: a deterministic, in-process state container that exists only during a single Oracle request lifecycle, so a future Hypothesis Engine (8.0.3) can read the current `CognitiveObservation`/evidence without re-deriving or re-fetching it. Explicitly NOT persistent memory, long-term memory, vector memory, RAG, caching, or a database.

### Architecture
```
cognitiveObservation (Phase 8.0.1)
        v
createWorkingMemory(observation)  -> { observation, notes: [] }
        v
appendMemoryEntry(memory, entry)  -> new { observation, notes: [...notes, entry] }   (0+ times, none yet in 8.0.2)
        v
[internal only — not returned in the API response]
        v
request handler returns -> memory goes out of scope, nothing persisted
```

### New file: `lib/ai/cognitive/memory.ts`
```
CognitiveMemoryEntry { text: string; relatedEvidenceSources?: readonly ConfluenceSource[] }
CognitiveWorkingMemory { observation: CognitiveObservation; notes: readonly CognitiveMemoryEntry[] }

createWorkingMemory(observation): CognitiveWorkingMemory        // pure — { observation, notes: [] }
appendMemoryEntry(memory, entry): CognitiveWorkingMemory        // pure — returns a NEW memory value; carries `observation` through by reference (already immutable-by-contract from 8.0.1), only `notes` gets a new array
```
- **No class, no mutation methods** (`update()`/`remove()` deliberately absent) — immutable, append-only functional style, matching every existing Phase 7/8.0.1 module.
- **No module-level `Map`/`Set`/singleton anywhere** — both exported functions are plain, synchronous, take/return data only. Confirmed structurally (fixture 11: the module's only exports are `createWorkingMemory`/`appendMemoryEntry`) and by direct source review — no `import` of `lib/supabase.ts`, no `fetch`, no LLM call.
- **Evidence is never re-collected** — `memory.observation.evidence` is the exact same array `buildCognitiveObservation()` (8.0.1) produced; `memory.ts` never imports `evidence.ts` or reconstructs a `NormalizedEvidence[]`.
- **No IDs, no timestamps, no `kind` union, no `content: any`, no `getEvidenceSnapshot()`/`getCanonicalSnapshot()` accessors** — per the approved minimal contract, direct field access (`memory.observation.evidence`, `memory.observation.sourceAssessment`) is sufficient and was used throughout the fixture suite.
- **No second quality calculation** — `quality` is reachable only via `memory.observation.quality` (and per-entry via `memory.observation.evidence[].quality`); `CognitiveWorkingMemory` itself has no `quality` field (fixture 8).
- **Canonical authority preserved** — `memory.observation.sourceAssessment` is the same read-only copy 8.0.1 already produced; `memory.ts` never renames or duplicates it into `cognitiveSide`/`cognitiveGrade`/`cognitiveConfidence`/`cognitiveRiskStatus` or any other shadow field (fixture 7).

### Route wiring
`app/api/elvoid-pro/oracle/route.ts`:
- Added `createWorkingMemory(cognitiveObservation)`, placed **after `cognitiveObservation`, before Phase 7.9 Reasoning** — only called `if (cognitiveObservation)` is truthy, since Working Memory has nothing to wrap around a failed observation.
- Wrapped in the same `try { ... } catch { = null }` pattern as every prior 7.x/8.x sub-phase — a bug here can never break the existing Oracle response.
- **`workingMemory` is deliberately NOT added to the JSON response.** It has no external consumer yet (Hypothesis Engine is Phase 8.0.3); returning `{ observation: {...repeats cognitiveObservation...}, notes: [] }` as a permanent response field would be redundant. The local variable is simply left unread past its `try` block — a plain function-local value, never assigned to any module-level store, so it is garbage-collected with the rest of the request's locals once the handler returns.

### Evidence reuse confirmation
`memory.ts` never imports `lib/ai/oracle/evidence.ts` and never constructs a `NormalizedEvidence`/`CognitiveEvidenceRef` itself — evidence is exposed exclusively through `memory.observation.evidence`, which is the identical array reference `cognitiveObservation.evidence` already held (fixture 2: `memory.observation.evidence === obs.evidence`).

### Canonical authority preservation
Fixture 7 asserts `side`/`grade`/`confidence`/`riskStatus`/`invalidation` values are unchanged after `createWorkingMemory`/`appendMemoryEntry`, and that no `cognitiveSide`/`cognitiveGrade`/`cognitiveConfidence`/`cognitiveRiskStatus` key exists anywhere on the resulting memory object or its `sourceAssessment`.

### Immutable append-only design — verified
- Fixture 3: `appendMemoryEntry()` returns a new object (`nextMemory !== memory`); the original memory's `notes` stays empty; the new memory contains the appended entry.
- Fixture 4: `memory.notes !== nextMemory.notes` (new array identity on every append).
- Fixture 5: `memory.observation === nextMemory.observation` (carried through unchanged — no re-copy needed since it was already immutable-by-contract from 8.0.1).
- Fixture 9: two independently created memory values (different observations) never share a `notes` array; appending to one never affects the other.
- Fixture 10: same observation + same append sequence run twice → byte-identical `JSON.stringify` output.

### Request-scoped lifecycle / no persistence
- No module-level `Map`/`Set`/`let`/`const` holds request data anywhere in `memory.ts` (fixture 11).
- `workingMemory` in `route.ts` is a plain local variable inside the `GET` handler — never assigned to anything outside that function's scope, so nothing survives past the request the way `lib/cache.ts` or `lib/ai/insights/history.ts`'s module-level `Map`s deliberately do (those are explicitly NOT reused here — see Phase 8.0.2 audit turn for the full comparison).
- No Supabase import, no `fetch`, no LLM call anywhere in `memory.ts` (fixture 11 + direct source review).

### Mutation safety
- Fixture 6: `JSON.stringify(observation)` unchanged after both `createWorkingMemory()` and `appendMemoryEntry()`.
- Fixture 12: the original `memory` value's `JSON.stringify` output is unchanged after calling `appendMemoryEntry(memory, entry)` on it (the call produces a new value; it never touches the one passed in).

### Files changed / added
- **New:** `lib/ai/cognitive/memory.ts`
- **New:** `scripts/phase8/cognitive-memory-fixtures.ts`
- `app/api/elvoid-pro/oracle/route.ts` — added the wiring block above (import + `try/catch` block only; `workingMemory` not added to the response object).
- `README.md` — expanded the "Cognitive Layer" section to document Phase 8.0.2 (kept 8.0.1's content, updated the pipeline diagram, added a Working Memory paragraph).
- `CHANGES.md` — this entry.

No changes to `lib/ai/oracle/evidence.ts`, `lib/ai/oracle/grading.ts`, `lib/ai/oracle/confluence.ts`, `lib/ai/oracle/risk.ts`, `lib/ai/oracle/execute.ts`, `lib/ai/oracle/reasoning.ts`, `lib/elvoid/engine.ts`, `lib/ai/core/modules/oracle.ts`, `lib/ai/core/llm.ts`, `lib/ai/core/router.ts`, `/api/ai-signals`, `lib/supabase.ts`, or any Phase 8.0.1 file (`lib/ai/cognitive/types.ts`, `lib/ai/cognitive/contracts.ts`, `lib/ai/cognitive/observation.ts` — all locked, untouched).

### Tests (`scripts/phase8/cognitive-memory-fixtures.ts`) — 12/12 passed
1. Creation preserves observation (`memory.observation === obs`), notes initially empty.
2. Evidence provenance preservation — `memory.observation.evidence === obs.evidence`, no re-normalization.
3. Append-only behavior — new object returned, original memory/notes untouched, new memory contains the entry.
4. Notes array identity — `memory.notes !== nextMemory.notes`.
5. Observation identity preservation — `memory.observation === nextMemory.observation`.
6. Source observation mutation safety — `JSON.stringify(observation)` unchanged across creation + append.
7. Canonical authority safety — values unchanged, no `cognitiveSide`/`cognitiveGrade`/alternative decision fields anywhere.
8. Quality inheritance — no second quality calculation; `quality` reachable only via `observation.quality`/`evidence[].quality`.
9. Independent memory instances — two memories never share `notes`; appending to one never affects the other.
10. Deterministic output — same observation + same append sequence, run twice, byte-identical JSON.
11. Structural safety — only `createWorkingMemory`/`appendMemoryEntry` exported, both synchronous plain functions; no `Map`/`Set`/Supabase/`fetch`/LLM surface.
12. Input immutability — original memory's JSON unchanged after `appendMemoryEntry()` is called on it.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-memory-fixtures.ts`

### Regression
- Phase 7.1 baseline script: ran clean, output shape unchanged.
- Phase 7.2 MTF fixtures: 7/7.
- Phase 7.3B regime fixtures: 8/8.
- Phase 7.4 liquidity/order-flow fixtures: 16/16.
- Phase 7.5 scenario fixtures: 13/13.
- Phase 7.6 contradiction fixtures: 8/8.
- Phase 7.7 arbitration fixtures: 12/12.
- Phase 7.8 risk intelligence fixtures: 11/11.
- Phase 7.9 reasoning fixtures: 14/14.
- Phase 8.0.1 cognitive observation fixtures: 10/10.
- Diff scope check (`git status --porcelain`, after reverting `npm install`'s incidental `package-lock.json`/`tsconfig.tsbuildinfo` churn from this turn's typecheck/build run): only `app/api/elvoid-pro/oracle/route.ts`, `README.md`, `CHANGES.md` modified among existing tracked files, plus the two new files above. `git diff --stat` against every forbidden/protected file (`lib/ai/oracle/evidence.ts`, `grading.ts`, `confluence.ts`, `risk.ts`, `execute.ts`, `reasoning.ts`, `lib/elvoid/engine.ts`, `lib/ai/core/modules/oracle.ts`, `lib/ai/core/llm.ts`, `lib/ai/core/router.ts`, `lib/supabase.ts`, and all three Phase 8.0.1 files) returned empty.

### Standard Elvoid AI
Confirmed unchanged — `git diff --stat` returned no output for `lib/elvoid/engine.ts`, `lib/ai/core/modules/oracle.ts`, and everything under `/api/ai-signals`. `memory.ts` imports only from `lib/ai/cognitive/contracts.ts` and `lib/ai/cognitive/types.ts`.

### Typecheck / build
- `npx tsc --noEmit` — **clean, zero errors.**
- `npx next build` — reached the webpack compile stage (past typecheck) but failed on `next/font`'s Google Fonts fetch (`fonts.googleapis.com` not in this sandbox's allowed egress list) — the same pre-existing, unrelated sandbox network constraint documented in the Phase 8.0.1 entry, not a regression introduced by this phase. Not claimed as a passing production build.

### Known limitations
- `next build` could not fully complete in this sandbox due to blocked Google Fonts egress (same limitation as Phase 8.0.1) — recommend a live build check before deploying.
- "No module-level memory state" and "no cross-request persistence" are verified structurally (source review + fixture 11's export-surface check) rather than via a live multi-request integration test, since this offline sandbox has no way to simulate two concurrent Next.js requests against a warm server instance.
- `workingMemory` currently has zero real callers (Hypothesis Engine is Phase 8.0.3) — its API is exercised only by `scripts/phase8/cognitive-memory-fixtures.ts` until then, by design.
- `npm install` was re-run in this sandbox to enable typecheck/build; its incidental `package-lock.json`/`tsconfig.tsbuildinfo` diffs were reverted via `git checkout` before finalizing the change set — the delivered ZIP does not include `node_modules/`, `.next/`, or any lockfile change.

### Scope check
NEW: `lib/ai/cognitive/memory.ts`, `scripts/phase8/cognitive-memory-fixtures.ts`.
MODIFIED: `app/api/elvoid-pro/oracle/route.ts`, `README.md`, `CHANGES.md`.
No other files changed. `workingMemory` confirmed absent from the API's JSON response.
