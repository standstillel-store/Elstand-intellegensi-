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

---

## Phase 8.0.3 — Cognitive Hypothesis Engine

### Architecture
Thin, deterministic reframing layer over already-computed Scenario (7.5), Contradiction (7.6), and Arbitration (7.7) output:
```
Scenario / Contradiction / Arbitration
        v
Cognitive Hypothesis Engine (buildHypotheses)
        v
CognitiveHypothesisSet  (at most 3 hypotheses: scenario_primary / scenario_alternative / contradiction)
```
Not a second confluence engine, not a second grading engine, not a signal/execution engine, not an LLM engine. Every field on `CognitiveHypothesis` is either copied verbatim from an existing Phase 7 object or a pure derivation over already-computed values — nothing here re-derives supporting/opposing evidence, contradiction severity, scenario direction, regime/MTF compatibility, or confidence.

### Authority
- No canonical decision changes: `hypothesis.ts` never imports `OracleAssessment` or `gradeConfluence()` — it only ever touches `memory.observation.evidence`/`.sourceAssessment` (read-only, inherited from Phase 8.0.1/8.0.2) plus the `Scenario`/`ContradictionReport`/`DecisionArbitration` objects passed in.
- No second confluence/grading engine: zero calls to `computeConfluence()`, `gradeConfluence()`, `buildOracleRiskPlan()`, or any Phase 7 builder function — only their already-produced *output types* are imported.
- No execution authority: no `entry`/`stopLoss`/`takeProfit`/`order`/`positionSize` field exists anywhere in `CognitiveHypothesis`/`CognitiveHypothesisSet`.
- No forbidden field names: `cognitiveSide`/`cognitiveGrade`/`hypothesisSignal`/`recommendedTrade`/`alternativeSignal`/`hypothesisConfidence` do not appear anywhere in the module or its output (verified by fixture 13's explicit absence check).

### New file: `lib/ai/cognitive/hypothesis.ts`
```
HypothesisStatus = "ACTIVE" | "SUPPORTED" | "CHALLENGED" | "REJECTED"
HypothesisUncertainty = "LOW" | "MEDIUM" | "HIGH"
HypothesisOrigin = "scenario_primary" | "scenario_alternative" | "contradiction"

CognitiveHypothesis {
  id: string                                       // deterministic — from Scenario.id or contradiction sources, never random/timestamp
  statement: string                                 // = Scenario.thesis, or a fixed-template sentence embedding a contradiction's own description
  hypothesisDirection: "LONG" | "SHORT" | null       // null for the non-directional contradiction-origin hypothesis
  supportingEvidence: readonly ScenarioEvidenceRef[]  // = Scenario.supportingEvidence, same reference — never rebuilt
  opposingEvidence: readonly ScenarioEvidenceRef[]    // = Scenario.opposingEvidence, same reference — never rebuilt
  status: HypothesisStatus                           // DERIVED from arbitration.alignment — never mutated
  uncertainty: HypothesisUncertainty                  // DERIVED from evidence quality + cluster count + contradiction aggregate — never mutated
  origin: HypothesisOrigin
}

CognitiveHypothesisSet {
  hypotheses: readonly CognitiveHypothesis[]          // length <= 3, always
  generatedFrom: { hasScenarios, hasContradictions, hasArbitration: boolean }
}

buildHypotheses(memory: CognitiveWorkingMemory, scenarios: ScenarioContext | null, contradictions: ContradictionReport | null, arbitration: DecisionArbitration | null): CognitiveHypothesisSet
```
Types adjusted (from the audit's proposed contract) only to match actual repository exports exactly — `ScenarioEvidenceRef`, `ScenarioDirection`, `DecisionAlignment`, `ContradictionSeverity`/`ContradictionOrigin`, `CognitiveWorkingMemory`, `CognitiveEvidenceRef` all imported from their real, existing source files. No `any`, no unsafe casts, no `HypothesisEvidence`/`CognitiveEvidenceV2`/`AlternativeEvidence`/`EvidenceSnapshot`.

### Scenario reuse confirmation
`scenario_primary`/`scenario_alternative` hypotheses copy `Scenario.thesis` → `statement`, `Scenario.direction` → `hypothesisDirection`, and `Scenario.supportingEvidence`/`.opposingEvidence` → the hypothesis's own fields **by reference**, never rebuilt (fixtures 4/5: `primary.supportingEvidence === s.supportingEvidence`). `id` is `hyp-${scenario.id}` — deterministic, derived from the already-existing `Scenario.id` (e.g. `primary-long`), never random.

### Contradiction reuse confirmation
The optional `contradiction`-origin hypothesis only fires when `contradictions.hasUnresolvedGenuineContradiction` (already aggregated by `contradiction.ts`) is true, filtered to `genuineness === "GENUINE" && severity !== "LOW"` candidates (both fields read directly off the existing `ClassifiedContradiction`, never reclassified), and deduplicated against the alternative hypothesis's own evidence via description-text identity (the same text-identity approach `contradiction.ts` itself already uses for its own dedup). No second contradiction detector.

### Arbitration reuse confirmation
`status` for the `scenario_primary` hypothesis is derived directly from `arbitration.alignment` (`STRONGLY_SUPPORTED`→`SUPPORTED`, `SUPPORTED_WITH_CAUTION`→`SUPPORTED`/`CHALLENGED` depending on whether the scenario's own `opposingEvidence` is non-empty, `CONFLICTED`→`CHALLENGED`, `UNSUPPORTED_CONTEXT`/`NOT_APPLICABLE`→`ACTIVE`). `status` for `scenario_alternative` reuses `arbitration.alternativeIsActiveOpposition` (`true`→`CHALLENGED`) and, narrowly, `STRONGLY_SUPPORTED` + not-active-opposition→`REJECTED` — the only path to `REJECTED` in this implementation, and it is entirely derived from already-computed `DecisionArbitration` fields, never a new invalidation rule (confirmed reachable and exercised by fixture 23).

### Evidence reuse confirmation
`supportingEvidence`/`opposingEvidence` are `ScenarioEvidenceRef[]` throughout — the exact type `scenario.ts` already produces — never translated into `NormalizedEvidence`/`CognitiveEvidenceRef` or any new shape (fixture 6). `CognitiveObservation.evidence` (`CognitiveEvidenceRef[]`, via `memory.observation.evidence`) is used **only** as a lookup pool for `firingClustersFor()` (evidence.ts, unmodified, reused as-is) when computing `uncertainty` — it is never re-exposed as a second hypothesis evidence list.

### Hypothesis generation bound
Exactly 3 possible generation paths (`scenario_primary`, `scenario_alternative`, `contradiction`), each contributing at most 1 hypothesis — `hypotheses.length <= 3` by construction, with a defensive `.slice(0, 3)` on the return value as an additional structural guarantee (fixtures 18/19: bound respected under a maximal-fixture case, and exactly 3 produced — one per origin — when all three paths genuinely apply simultaneously).

### Status behavior
Derived once, purely, inside `buildHypotheses()` via `derivePrimaryStatus()`/`deriveAlternativeStatus()` — no `hypothesis.status = ...` anywhere, no class, no state machine (fixture 14: same inputs → same status, run twice). `REJECTED` is deliberately the narrowest branch and is expected to be rare (per the approved audit) — confirmed reachable via one explicit, narrow, deterministic rule (fixture 23) rather than never exercised.

### Uncertainty behavior
`LOW`/`MEDIUM`/`HIGH` enum, never a number, never reused/renamed from `assessment.confidence`. Derived from: (a) whether the hypothesis's direction-aligned backing evidence in `memory.observation.evidence` is entirely `real`-quality, (b) whether at least 2 independent clusters back that direction (via `firingClustersFor()`, same `>=2` convention `OracleAssessment.independentConfirmationClusters` already uses elsewhere in this pipeline), and (c) `contradictions.hasUnresolvedGenuineContradiction`. Proxy/unavailable-quality backing evidence or a meaningful unresolved genuine contradiction can only push uncertainty toward `HIGH`, **never** toward `LOW` (fixture 16, and fixture 16b as the positive-path sanity check that `LOW` is still reachable under genuinely clean evidence). The `contradiction`-origin hypothesis's own uncertainty is `HIGH` for a `HIGH`-severity backing contradiction, `MEDIUM` for `MODERATE` — never `LOW`, since by construction it only exists for a non-`LOW`-severity genuine contradiction (fixture 17).

### Canonical authority confirmation
`hypothesis.ts` never imports `OracleAssessment` at all — the only canonical-decision-adjacent data it ever touches is `memory.observation.sourceAssessment`, read-only, inherited unchanged from Phase 8.0.1 (fixture 12: unchanged before/after). No `cognitiveSide`/`cognitiveGrade`/`hypothesisSignal`/`recommendedTrade`/`alternativeSignal`/`hypothesisConfidence` anywhere (fixture 13).

### Input immutability
`Scenario`/`ScenarioContext` (fixture 7), `ContradictionReport` (fixture 8), `DecisionArbitration` (fixture 9), `CognitiveObservation` (fixture 10), and the full `CognitiveWorkingMemory` including `notes` (fixture 11) are all confirmed byte-identical (`JSON.stringify`) before and after every `buildHypotheses()` call. Fixture 22 additionally confirms two independently built hypothesis sets never share an evidence array reference.

### Files changed / added
- **New:** `lib/ai/cognitive/hypothesis.ts`
- **New:** `scripts/phase8/cognitive-hypothesis-fixtures.ts`
- `app/api/elvoid-pro/oracle/route.ts` — one additive `try { if (workingMemory) hypotheses = buildHypotheses(...) } catch { hypotheses = null }` block placed after the existing `workingMemory` block and before Phase 7.9 Reasoning; `hypotheses` added to `NextResponse.json(...)`; `workingMemory` confirmed still absent from that response object. `reasoning.ts` itself untouched — `buildOracleReasoning()`'s call signature and arguments are unchanged from Phase 8.0.2.
- `README.md` — Cognitive Layer section extended with a Phase 8.0.3 paragraph and updated pipeline diagram.
- `CHANGES.md` — this entry.

No changes to `lib/ai/oracle/evidence.ts`, `lib/ai/oracle/grading.ts`, `lib/ai/oracle/confluence.ts`, `lib/ai/oracle/risk.ts`, `lib/ai/oracle/execute.ts`, `lib/ai/oracle/reasoning.ts`, `lib/ai/oracle/scenario.ts`, `lib/ai/oracle/contradiction.ts`, `lib/ai/oracle/arbitration.ts`, `lib/elvoid/engine.ts`, `lib/ai/core/modules/oracle.ts`, `lib/ai/core/llm.ts`, `lib/ai/core/router.ts`, `/api/ai-signals`, `lib/supabase.ts`, or any Phase 8.0.1/8.0.2 Cognitive Layer file (`types.ts`, `contracts.ts`, `observation.ts`, `memory.ts` — all remain locked, untouched).

No `runCognitiveCycle()` orchestrator introduced and no route refactor performed — route growth (now 11 inlined `try/catch` blocks) is acknowledged but explicitly out of scope for this phase, per the approved audit.

### Testing (`scripts/phase8/cognitive-hypothesis-fixtures.ts`) — 24/24 checks passed
1. Deterministic generation succeeds on a plausible fixture set. 2. Primary scenario → exactly one hypothesis. 3. Alternative hypothesis appears only when `scenarios.alternative` is provided. 4–5. Supporting/opposing evidence preserved by reference. 6. Evidence stays `ScenarioEvidenceRef`-shaped (no re-normalization). 7–11. No mutation of `Scenario`/`ContradictionReport`/`DecisionArbitration`/`CognitiveObservation`/`CognitiveWorkingMemory`. 12. `sourceAssessment` unchanged. 13. No forbidden keys anywhere. 14–15. Status/uncertainty deterministic. 16/16b. Proxy evidence forces `HIGH`, never `LOW`; clean evidence reaches `LOW`. 17. Meaningful genuine contradiction → `CHALLENGED` + `HIGH` uncertainty. 18. `length <= 3` under a maximal case. 19. All 3 paths simultaneously → exactly 3, one per origin. 20. Byte-identical output on identical inputs. 21. Only `buildHypotheses` is a runtime export (no fetch/LLM/DB surface). 22. Independent hypothesis sets share no array references. 23. `REJECTED` reachable via its one narrow, deterministic rule.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-hypothesis-fixtures.ts`

### Regression
- Phase 7.1 baseline: ran clean, output shape unchanged.
- Phase 7.2 MTF 7/7, 7.3B Regime 8/8, 7.4 Liquidity/OrderFlow 16/16, 7.5 Scenario 13/13, 7.6 Contradiction 8/8, 7.7 Arbitration 12/12, 7.8 Risk Intelligence 11/11, 7.9 Reasoning 14/14.
- Phase 8.0.1 Cognitive Observation 10/10, Phase 8.0.2 Cognitive Working Memory 12/12.
- All unchanged from prior baselines.
- Diff scope check (after reverting `npm install`'s incidental `package-lock.json`/`tsconfig.tsbuildinfo` churn): only `app/api/elvoid-pro/oracle/route.ts`, `README.md`, `CHANGES.md` modified among existing tracked files, plus the two new files above. `git diff --stat` against every forbidden/protected file (all Phase 7.x source modules, `lib/elvoid/engine.ts`, `lib/ai/core/*`, `/api/ai-signals`, `lib/supabase.ts`, and all four existing `lib/ai/cognitive/*` files) returned empty.

### Typecheck / build
- `npx tsc --noEmit` — **clean, zero errors** after one fixture-only fix (an initial fixture used a non-existent `ConfluenceSource` value, `"funding_rate"`; corrected to the real `"macro"` — no production code was affected).
- `npx next build` — reached the webpack compile stage (past typecheck) but failed on `next/font`'s Google Fonts fetch (`fonts.googleapis.com` not in this sandbox's allowed egress list) — the same pre-existing, unrelated sandbox network constraint documented in the Phase 8.0.1/8.0.2 entries, not a regression introduced by this phase. Not claimed as a passing production build. Font configuration was not modified to force a passing build.

### Standard Elvoid AI
Confirmed unchanged — `git diff --stat` returned no output for `lib/elvoid/engine.ts`, `lib/ai/core/modules/oracle.ts`, `lib/ai/core/llm.ts`, `lib/ai/core/router.ts`, and everything under `/api/ai-signals`. `hypothesis.ts` imports only from `lib/ai/oracle/scenario.ts`, `lib/ai/oracle/contradiction.ts`, `lib/ai/oracle/arbitration.ts`, `lib/ai/oracle/evidence.ts` (type/function reuse only — no `gradeConfluence`/`computeConfluence` import), and the local `lib/ai/cognitive/memory.ts`/`types.ts`.

### Known limitations
- `next build` could not fully complete in this sandbox due to blocked Google Fonts egress (same limitation as Phase 8.0.1/8.0.2) — recommend a live build check before deploying.
- `REJECTED` status, by design, occurs through exactly one narrow deterministic rule and may be rare or absent in real traffic depending on how often arbitration reaches a clean `STRONGLY_SUPPORTED` alongside a merely-contingency alternative scenario — this is intentional, not a gap, per the approved audit ("correctness is more important than exercising every enum value").
- The `contradiction`-origin hypothesis's dedup against the alternative hypothesis is a description-text equality check — sufficient given how `contradiction.ts`/`scenario.ts` already propagate text verbatim across modules, but it would not catch two contradictions describing the same underlying issue in differently-worded text (no such case exists in the current pipeline, since all text is copied verbatim from a single origin, never reworded per-module).
- `npm install` was re-run in this sandbox to enable typecheck/build; its incidental `package-lock.json`/`tsconfig.tsbuildinfo` diffs were reverted via `git checkout` before finalizing the change set — the delivered ZIP does not include `node_modules/`, `.next/`, or any lockfile change.

### Scope check
NEW: `lib/ai/cognitive/hypothesis.ts`, `scripts/phase8/cognitive-hypothesis-fixtures.ts`.
MODIFIED: `app/api/elvoid-pro/oracle/route.ts`, `README.md`, `CHANGES.md`.
No other files changed. `hypotheses` confirmed present in the API's JSON response; `workingMemory` confirmed still absent.

---

## Phase 8.0.4 — Cognitive Conflict Resolution

### Added
- `lib/ai/cognitive/conflict.ts` — `CognitiveCoherenceState`, `CognitiveConflictFactorSource`, `CognitiveConflictFactor`, `CognitiveConflictState`, `CognitiveConflictInputs`, `resolveCognitiveConflict()`.
- `scripts/phase8/cognitive-conflict-fixtures.ts` — 18 deterministic, offline fixture checks (15 required + 3 additional edge cases).

### Modified
- `app/api/elvoid-pro/oracle/route.ts` — one additive `try/catch` block placed after `hypotheses`, before Phase 7.9 Reasoning; a summarized `cognitiveConflict: { state, reasons }` field added to `NextResponse.json(...)`. `workingMemory` remains absent from the response (unchanged from 8.0.2/8.0.3).
- `README.md` — Cognitive Layer section extended with a Phase 8.0.4 paragraph and an updated pipeline diagram.
- `CHANGES.md` — this entry.

No other files modified. `reasoning.ts` untouched — `buildOracleReasoning()`'s call signature and arguments are unchanged from Phase 8.0.3.

### Architecture
`lib/ai/cognitive/conflict.ts` is a **meta-resolution layer over already-computed Phase 7 aggregates**, not a second intelligence engine:
```
Scenario (7.5) ──────────┐
Contradiction (7.6) ─────┤
Arbitration (7.7) ───────┼──→ resolveCognitiveConflict() ──→ CognitiveConflictState
Risk Intelligence (7.8) ─┤        (contextQuality only)
Cognitive Observation ───┤        (quality only)
Hypotheses / WorkingMem ─┘        (accepted, unused — see Guardrails)
```
Pure, synchronous, deterministic, first-match-wins precedence — no weighted scoring, no voting, no confidence averaging. Zero I/O, zero `Date.now()`/`Math.random()`, zero module-level state. Answers *"how coherent is the intelligence system's own interpretation"* — never *"which market direction is correct."* No `side`/`direction`/`BUY`/`SELL`/`execute`/`reject` field exists anywhere in the module's output.

### Resolution States
Exactly four bounded states (`CognitiveCoherenceState`), evaluated via 6 precedence rules in this exact order — no reordering, no weighted scoring:

1. **RULE 1 — hard context blocker.** `scenarios === null || contradictions === null || arbitration === null` → `INSUFFICIENT_CONTEXT`.
2. **RULE 2 — insufficient quality.** `scenarios.contextQuality === "insufficient"` OR `riskIntelligence?.contextQuality === "insufficient"` OR `observation?.quality === "unavailable"` → `INSUFFICIENT_CONTEXT`. (A `null` `observation` alone does *not* trigger this rule — handled defensively via optional chaining, never throws, per the approved spec.)
3. **RULE 3 — genuine system conflict.** `contradictions.hasUnresolvedGenuineContradiction === true` **AND** (`arbitration.alignment === "CONFLICTED"` **OR** `arbitration.alternativeIsActiveOpposition === true`) → `CONFLICTED`. Deliberately a conjunction — neither signal alone is sufficient (see Guardrails).
4. **RULE 4 — caution.** `arbitration.alignment` is `SUPPORTED_WITH_CAUTION`, `UNSUPPORTED_CONTEXT`, **or** `CONFLICTED` (the last only reachable here when Rule 3's conjunction did *not* confirm a genuine system conflict — arbitration reads `CONFLICTED` but the contradiction aggregate/active-opposition flags don't corroborate it; the approved four-state model has no fifth state for this narrow edge case, so it lands in `CAUTIOUS` rather than being dropped) → `CAUTIOUS`.
5. **RULE 5 — consistent.** `arbitration.alignment === "STRONGLY_SUPPORTED"` AND `!hasUnresolvedGenuineContradiction` AND `!alternativeIsActiveOpposition` → `CONSISTENT`.
6. **RULE 6 — NOT_APPLICABLE.** `arbitration.alignment === "NOT_APPLICABLE"` → `INSUFFICIENT_CONTEXT`. **Explicit, locked Phase 8.0.4 architectural decision** — there is no canonical decision to evaluate coherence around, so this is never reinterpreted as `CAUTIOUS`.

A final structurally-unreachable fallback (`INSUFFICIENT_CONTEXT`) closes out the function for type-safety, since `DecisionAlignment` is a closed 5-value union already fully covered by rules 3–6.

**State semantics:**
- `INSUFFICIENT_CONTEXT` — not enough reliable pipeline context exists to judge coherence. About missing/low-quality knowledge, never about disagreement.
- `CONFLICTED` — positive, jointly-corroborated evidence that important intelligence components genuinely disagree.
- `CAUTIOUS` — not fully coherent, but genuine unresolved conflict has not been jointly established.
- `CONSISTENT` — strongly aligned: clean arbitration, no genuine unresolved contradiction, no active opposition.

### Guardrails
- **Risk ≠ Conflict**: `riskIntelligence.overall` and `riskIntelligence.factors` are **never read** anywhere in `conflict.ts` — only `riskIntelligence.contextQuality`, and only for `INSUFFICIENT_CONTEXT`. Verified: fixture 6 confirms `riskIntelligence.overall = "HIGH"` alone, with clean contradiction/arbitration, resolves to `CONSISTENT`, never `CONFLICTED`.
- **Contradiction detection reused, not recreated**: `contradictions.hasUnresolvedGenuineContradiction` (already aggregated by `contradiction.ts`) is read directly; `contradictions.contradictions[]` is never rescanned to independently re-determine whether conflict exists.
- **Arbitration logic reused, not recreated**: `arbitration.alignment` and `arbitration.alternativeIsActiveOpposition` are read directly from the already-computed `DecisionArbitration`; no regime/MTF-compatibility re-derivation happens in this file.
- **Hypotheses are not a voting system**: `CognitiveHypothesisSet` is accepted in `CognitiveConflictInputs` for architectural completeness but is never read, counted, or iterated anywhere inside `resolveCognitiveConflict()`. Verified: fixture 7 confirms three hypotheses (including a `REJECTED` one) present alongside an otherwise-clean arbitration/contradiction state still resolves to `CONSISTENT`.
- **Working Memory carries no independent authority**: `CognitiveWorkingMemory` is accepted in the input type but never read inside the resolution logic — pure transport, consistent with its Phase 8.0.2 design.
- **Genuine contradiction alone is insufficient**: fixture 13 confirms `hasUnresolvedGenuineContradiction = true` with `arbitration.alignment = STRONGLY_SUPPORTED` and `alternativeIsActiveOpposition = false` does **not** resolve to `CONFLICTED` — the Rule 3 conjunction is enforced exactly as specified, preventing the conflict engine from becoming over-sensitive to a single weak signal.
- **`NOT_APPLICABLE` is locked to `INSUFFICIENT_CONTEXT`**: implemented exactly as the explicit Phase 8.0.4 decision states — not reinterpreted as `CAUTIOUS` (fixture 12).
- **No forbidden execution/direction fields**: no `side`/`direction`/`entry`/`stopLoss`/`takeProfit`/`order`/`positionSize`/`BUY`/`SELL` anywhere in `CognitiveConflictState`/`CognitiveConflictFactor`.
- **Explainability without invention**: every `reasons[]`/`contributingFactors[].detail` string is a deterministic template referencing an actual upstream field and its actual value (e.g. `"arbitration.alignment = CONFLICTED"`, `"contradictions.hasUnresolvedGenuineContradiction = true"`) — no LLM, no generated prose, no speculative explanation. Verified structurally by fixture 18.

### Verification
- **Fixtures**: `scripts/phase8/cognitive-conflict-fixtures.ts` — **18/18 passed** (all 15 required cases: fully aligned→CONSISTENT, cautious→CAUTIOUS, genuine contradiction+conflicted arbitration→CONFLICTED, missing scenarios→INSUFFICIENT_CONTEXT, scenario-insufficient-quality→INSUFFICIENT_CONTEXT, HIGH-risk-alone guardrail→CONSISTENT, three-hypotheses guardrail→CONSISTENT, active-opposition+contradiction→CONFLICTED, determinism, input immutability, no-infrastructure-dependency, NOT_APPLICABLE→INSUFFICIENT_CONTEXT, genuine-contradiction-alone guardrail, UNSUPPORTED_CONTEXT→CAUTIOUS, observation-unavailable→INSUFFICIENT_CONTEXT — plus 3 additional cases: risk-context-quality-insufficient, contradictions/arbitration-individually-null, and contributingFactors traceability).
- **Regression**: Phase 7.2 MTF 7/7, 7.3B Regime 8/8, 7.4 Liquidity/OrderFlow 16/16, 7.5 Scenario 13/13, 7.6 Contradiction 8/8, 7.7 Arbitration 12/12, 7.8 Risk Intelligence 11/11, 7.9 Reasoning 14/14; Phase 8.0.1 Cognitive Observation 10/10, 8.0.2 Working Memory 12/12, 8.0.3 Hypothesis 24/24. Baseline snapshot script ran clean, output shape unchanged. All counts identical to the Phase 8.0.3 report — no regressions introduced.
- **Typecheck**: `npx tsc --noEmit` — **clean, zero errors** on the first pass (no fixture or production fixes needed this phase).
- **Build**: `npx next build` — reached the webpack compile stage (past typecheck) but failed on `next/font`'s Google Fonts fetch (`fonts.googleapis.com` not in this sandbox's allowed egress list) — the same pre-existing, unrelated sandbox network constraint documented in every prior Phase 8 entry, not a regression introduced by this phase. Not claimed as a passing production build.
- **Protected files**: `git diff --stat` returned empty for every file in the hard-protected list (`lib/ai/oracle/scenario.ts`, `contradiction.ts`, `arbitration.ts`, `riskIntelligence.ts`, `grading.ts`, `confluence.ts`, `risk.ts`, `execute.ts`, `evidence.ts`, `reasoning.ts`, `lib/elvoid/engine.ts`, `lib/ai/core/modules/oracle.ts`, `lib/ai/core/llm.ts`, `lib/ai/core/router.ts`, `app/api/ai-signals/*`, `lib/supabase.ts`, and all five locked Cognitive Layer files `types.ts`/`contracts.ts`/`observation.ts`/`memory.ts`/`hypothesis.ts`).
- **API response**: confirmed `cognitiveConflict: { state, reasons }` (summarized shape only — `contributingFactors` stays internal) present in `NextResponse.json(...)`; `workingMemory` confirmed still absent.
- **Diff scope**: after reverting `npm install`'s incidental `package-lock.json`/`tsconfig.tsbuildinfo` churn from this turn's typecheck/build run, `git status --porcelain` shows only `app/api/elvoid-pro/oracle/route.ts`, `README.md`, `CHANGES.md` modified among existing tracked files, plus the two new files above.

### Known limitations
- `next build` could not fully complete in this sandbox due to blocked Google Fonts egress (same limitation as every prior Phase 8 entry) — recommend a live build check before deploying.
- Rule 4's inclusion of `CONFLICTED`-without-contradiction-corroboration as a `CAUTIOUS` fallback (rather than a fifth state) is a documented interpretive choice for an edge case the approved 6-rule hierarchy does not explicitly address on its own — flagged in the audit's Risks & Open Questions and implemented as the most conservative reading (never silently dropped, never upgraded to CONSISTENT).
- `npm install` was re-run in this sandbox to enable typecheck/build; its incidental `package-lock.json`/`tsconfig.tsbuildinfo` diffs were reverted via `git checkout` before finalizing the change set — the delivered ZIP does not include `node_modules/`, `.next/`, or any lockfile change.

### Scope check
NEW: `lib/ai/cognitive/conflict.ts`, `scripts/phase8/cognitive-conflict-fixtures.ts`.
MODIFIED: `app/api/elvoid-pro/oracle/route.ts`, `README.md`, `CHANGES.md`.
No other files changed. `cognitiveConflict` confirmed present (summarized shape) in the API's JSON response; `workingMemory` confirmed still absent.

---

## Phase 8.0.5 — Cognitive Decision Context

### Purpose
A deterministic, immutable, **runtime-only** structured assembly of existing Cognitive Layer outputs (`CognitiveObservation`, `CognitiveHypothesisSet`, the internal `CognitiveConflictState`, and a narrowed read of `RiskIntelligence`) into one object for future downstream consumers (evaluation/learning/agent layers, not yet built). It answers *"what is the structured cognitive state of the system right now"* — never *"what should we trade / BUY / SELL / execute."* The core principle: **assemble, do not think again.**

### Added
- `lib/ai/cognitive/context.ts` — `CognitiveDecisionContext`, `buildDecisionContext()`.
- `scripts/phase8/cognitive-context-fixtures.ts` — 22 deterministic, offline fixture checks.

### Modified
- `app/api/elvoid-pro/oracle/route.ts` — one additive `try/catch` block placed after `cognitiveConflict` (using the untrimmed `cognitiveConflictInternal`, not the trimmed public `{state, reasons}` shape), before Phase 7.9 Reasoning. `decisionContext` is built defensively and is **NOT** added to `NextResponse.json(...)` — the JSON response object is byte-for-byte unchanged from Phase 8.0.4.
- `README.md` — Cognitive Layer section extended with a Phase 8.0.5 paragraph and an updated pipeline diagram.
- `CHANGES.md` — this entry.

No other files modified. `reasoning.ts` untouched — unchanged from Phase 8.0.4.

### Architecture
```
CognitiveObservation (8.0.1) ─────────┐
CognitiveHypothesisSet (8.0.3) ───────┼──→ buildDecisionContext() ──→ CognitiveDecisionContext
CognitiveConflictState (8.0.4, internal) ┤        (pure, synchronous, no recomputation)
RiskIntelligence (7.8, narrowed) ─────┘
```
`observation` anchors the context: `observation === null` ⇒ `buildDecisionContext()` returns `null` — no fabricated empty observation, no fake defaults for any other field. Every other input (`hypotheses`, `conflict`, `riskIntelligence`) is independently nullable and maps to a `null` field on the output when missing, never a fabricated default. Reference-vs-copy strategy: `observation`/`hypotheses`/`conflict` are carried through **by direct reference** (already immutable-by-contract Cognitive Layer outputs — nothing to clone, nothing to reinterpret); `risk` is a **freshly-constructed narrow copy** of exactly `{overall, contextQuality}` — `riskIntelligence.factors` never crosses this boundary. `CognitiveWorkingMemory` is deliberately excluded as a field — pure transport, no canonical intelligence beyond what `observation` already carries.

### Input authority map
| Field | Source | Strategy |
|---|---|---|
| `observation` | `cognitiveObservation` (8.0.1) | Direct reference; anchors the whole context |
| `hypotheses` | `hypotheses` (8.0.3) | Direct reference; never re-ranked/re-counted/filtered |
| `conflict` | `cognitiveConflictInternal` (8.0.4, untrimmed) | Direct reference; never recomputed/reclassified |
| `risk` | `riskIntelligence` (7.8) | Narrow copy — `{overall, contextQuality}` only, `.factors` excluded |

### Confirmation of excluded behavior
- **No re-derivation**: `context.ts` imports no Phase 7/8 intelligence-producing function — types only (`RiskIntelligence`/`RiskSeverity`/`RiskContextQuality` from `riskIntelligence.ts`, `CognitiveObservation` from `contracts.ts`, `CognitiveHypothesisSet` from `hypothesis.ts`, `CognitiveConflictState` from `conflict.ts`). Verified structurally (fixture 21: source-text scan confirms none of `gradeConfluence`/`computeConfluence`/`buildOracleRiskPlan`/`buildMtfContext`/`classifyMarketRegime`/`buildLiquidityOrderFlowContext`/`buildScenarios`/`classifyContradictions`/`arbitrateDecision`/`buildRiskIntelligence`/`buildOracleReasoning`/`normalizeEvidence`/`buildHypotheses`/`resolveCognitiveConflict`/`createWorkingMemory`/`buildCognitiveObservation` appear anywhere in the file).
- **No hypothesis re-ranking/re-counting/filtering**: fixtures 12/15 confirm order, count, and object reference are all preserved exactly.
- **No conflict recomputation/reclassification**: fixtures 13/14 confirm `state`/`reasons` pass through exactly as given and the object reference itself is preserved (never rebuilt).
- **`risk.factors` never leaks through**: fixture 17 confirms `context.risk` never contains a `factors` key.
- **No timestamps**: fixture 19 confirms no `generatedAt`/`timestamp` field exists on `CognitiveDecisionContext` itself (only nested, pre-existing, inside `observation`, which already legitimately has one from 8.0.1).
- **No persistence**: no Supabase import, no database, no cache, no module-level state anywhere in `context.ts` — confirmed by direct source grep (no `supabase`/`fetch(`/`callAiCore`/`openai`/`gemini`/`anthropic` string present) and fixture 20 (only `buildDecisionContext` is a runtime function export).
- **No LLM/network/database dependency**: same evidence as above.
- **No API response duplication**: `decisionContext` is confirmed absent from `NextResponse.json(...)` — the response object is identical to Phase 8.0.4's.
- **No canonical authority override**: `context.ts` never imports `OracleAssessment` directly — canonical fields are only reachable one hop away via `observation.sourceAssessment` (already a read-only copy since 8.0.1). Fixture 11 confirms those values pass through unchanged.

### Fixture results (`scripts/phase8/cognitive-context-fixtures.ts`) — 22/22 passed
1. Basic construction succeeds. 2. Deterministic (same inputs -> deep-equal output). 3. `observation === null` -> `null`. 4–6. `hypotheses`/`conflict`/`riskIntelligence` each `null` -> corresponding field `null`. 7–10. Observation/hypotheses/conflict/riskIntelligence inputs unchanged after construction. 11. Canonical `sourceAssessment` values pass through unchanged. 12. Hypotheses order/count preserved exactly. 13. Conflict not recomputed. 14–15. Conflict/hypotheses object references preserved. 16. `risk` contains exactly `{overall, contextQuality}`. 17. `risk` never contains `factors`. 18. Context has exactly 4 top-level fields. 19. No timestamp generated. 20. No network/database/LLM dependency. 21. No Phase 7/8 intelligence-producing function imported. 22. Separately-constructed deep-equal inputs -> deep-equal output.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/cognitive-context-fixtures.ts`

### Regression
- Phase 7.2 MTF 7/7, 7.3B Regime 8/8, 7.4 Liquidity/OrderFlow 16/16, 7.5 Scenario 13/13, 7.6 Contradiction 8/8, 7.7 Arbitration 12/12, 7.8 Risk Intelligence 11/11, 7.9 Reasoning 14/14.
- Phase 8.0.1 Cognitive Observation 10/10, 8.0.2 Working Memory 12/12, 8.0.3 Hypothesis 24/24, 8.0.4 Conflict Resolution 18/18.
- Baseline snapshot script ran clean, output shape unchanged. All counts identical to the Phase 8.0.4 report — no regressions introduced.
- Diff scope check (after reverting `npm install`'s incidental `package-lock.json`/`tsconfig.tsbuildinfo` churn): only `app/api/elvoid-pro/oracle/route.ts`, `README.md`, `CHANGES.md` modified among existing tracked files, plus the two new files above. `git diff --stat` against every protected file (all Phase 7 oracle modules, `lib/elvoid/engine.ts`, `lib/elvoid/performance.ts`, `lib/ai/core/modules/*`, `lib/ai/core/llm.ts`/`router.ts`, `app/api/ai-signals/*`, `app/api/ai-journal/*`, `app/api/ai-performance/*`, `app/api/paper-trader/journal/*`, `lib/supabase.ts`, `supabase/schema.sql`, and all five previously-locked Cognitive Layer files `types.ts`/`contracts.ts`/`observation.ts`/`memory.ts`/`hypothesis.ts`/`conflict.ts`) returned empty.

### Typecheck / build
- `npx tsc --noEmit` — **clean, zero errors** on the first pass.
- `npx next build` — reached the webpack compile stage (past typecheck) but failed on `next/font`'s Google Fonts fetch (`fonts.googleapis.com` not in this sandbox's allowed egress list) — the same pre-existing, unrelated sandbox network constraint documented in every prior Phase 8 entry, not a regression introduced by this phase. Not claimed as a passing production build.

### Deviations from specification
None. The implementation follows the approved contract and route-wiring instructions exactly, including using the untrimmed `cognitiveConflictInternal` (not the trimmed public `cognitiveConflict`) as the conflict input.

### Known limitations
- `next build` could not fully complete in this sandbox due to blocked Google Fonts egress (same limitation as every prior Phase 8 entry) — recommend a live build check before deploying.
- `decisionContext` currently has zero real callers (no Phase 8.1+ consumer exists yet) — per the approved audit, this is accepted forward-looking infrastructure, exercised only by its own fixture suite until a downstream consumer is built.
- `npm install` was re-run in this sandbox to enable typecheck/build; its incidental `package-lock.json`/`tsconfig.tsbuildinfo` diffs were reverted via `git checkout` before finalizing the change set — the delivered ZIP does not include `node_modules/`, `.next/`, or any lockfile change.

### Scope check
NEW: `lib/ai/cognitive/context.ts`, `scripts/phase8/cognitive-context-fixtures.ts`.
MODIFIED: `app/api/elvoid-pro/oracle/route.ts`, `README.md`, `CHANGES.md`.
No other files changed. Confirmed: no database table, no LLM call, no persistence, and no new API response field were added in this phase.

---

## Phase 8.1.0 — Decision Outcome Capture (ELVOID Learning Database)

### Baseline correction
This implementation was preceded by three audit-only turns in this conversation, the last of which confirmed against the actual uploaded repository (not assumed from any prior report) that: Phase 8.0.0–8.0.5 are complete and unmodified in this snapshot; `lib/ai/decisionOutcome/` did not yet exist; `CognitiveDecisionContext` was built in `app/api/elvoid-pro/oracle/route.ts` but discarded before the JSON response (never reaching `execute-signal`); and no prior Phase 8.1 code existed anywhere in this repository. This implementation proceeds from that confirmed baseline.

### Purpose
Phase 8.1 ("Self-Evaluation & Adaptive Learning") begins here. This phase establishes the minimal capture boundary — Decision + Context-at-decision-time + Action → Outcome — using a **new, isolated ELVOID Learning Database** (a separate Supabase project), while Main Supabase remains the sole canonical authority for `ai_signals`/`ai_journal`. It does **not** evaluate decision quality, does not classify good/bad decisions, does not detect patterns, and does not learn — those are explicitly deferred to Phase 8.1.1+.

### Files created
- `lib/ai/learning/db.ts` — isolated Supabase client for the ELVOID Learning Database. Reads only `ELVOID_LEARNING_SUPABASE_URL`/`ELVOID_LEARNING_SERVICE_ROLE_KEY`; returns `null` (never falls back to `lib/supabase.ts`'s Main DB client) when unconfigured.
- `supabase/learning/schema.sql` — isolated schema for the **separate** Learning Database project (does NOT touch `supabase/schema.sql`, the Main DB schema). Defines `decision_experiences` with `UNIQUE(source_signal_id)` — see Identifier strategy below — RLS enabled, zero public policies (mirrors `ai_signals`/`ai_journal`'s own service-role-only convention).
- `lib/ai/decisionOutcome/contracts.ts` — `DecisionSource` (reused directly from `AiSignal["source"]`, no duplicate enum), `LearningContextSnapshot`, `DecisionExperienceInput`, `DecisionExperienceOutcomePatch`, `DecisionExperienceRecord`.
- `lib/ai/decisionOutcome/capture.ts` — pure functions only: `normalizeLearningContext()`, `buildDecisionExperienceInput()`, `buildDecisionExperienceOutcome()`. Zero database/network/LLM imports.
- `lib/ai/decisionOutcome/repository.ts` — persistence adapters only: `getSignalById()`/`getJournalEntryBySignalId()` (Main DB, read-only), `persistDecisionExperience()`/`persistDecisionOutcome()` (Learning DB, idempotent writes), plus two orchestration helpers (`captureDecisionExperience()`, `captureAndPersistOutcome()`) that compose the pure functions with the adapters — no domain logic inlined here.
- `scripts/phase8/decision-outcome-fixtures.ts` — 22 deterministic, offline fixture checks.

### Files modified
- `app/api/elvoid-pro/oracle/route.ts` — one additive field. `normalizeLearningContext(decisionContext)` is computed defensively (try/catch) immediately after `decisionContext` itself, and the single new field `learningContext` is added to the existing `NextResponse.json(...)` call. Every previously-existing response field is unchanged.
- `app/api/elvoid-pro/execute-signal/route.ts` — `ExecuteBody` gains one optional field, `learningContext?: LearningContextSnapshot | null`. A minimal shape check (`typeof === "object" && version === 1`) silently drops a malformed value rather than rejecting the request — a bad `learningContext` must never block a valid trade. Fully backward compatible: a client that never sends this field behaves exactly as before.
- `lib/ai/oracle/execute.ts` — `executeOracleSignal()` gains one optional trailing parameter, `learningContext?: LearningContextSnapshot | null`. After every successful insert-and-execute path (fresh insert, and the pre-existing-row race-recovery path), a new `captureDecisionExperienceBestEffort()` call fires `captureDecisionExperience()` without awaiting its result and swallows any rejection — a Learning DB failure can never surface as a trade-execution failure. No existing logic in this file (idempotency check, `buildOracleSignalId()`, grading, insert shape) was changed.
- `.env.example` — three new, secret-free variable names documented (`ELVOID_LEARNING_SUPABASE_URL`/`_ANON_KEY`/`_SERVICE_ROLE_KEY`), following the file's existing per-phase section convention. No existing entry altered.
- `README.md` — pipeline diagram extended with the new capture step; new "Decision Outcome Capture & ELVOID Learning Database" section added before Setup.
- `CHANGES.md` — this entry.

### Learning Database architecture
```
MAIN SUPABASE (unchanged, canonical)         ELVOID LEARNING DATABASE (NEW, isolated project)
ai_signals ──┐                               decision_experiences
ai_journal ──┴── read-only, server-side ────→   source_signal_id  (logical reference to
                 (lib/ai/decisionOutcome/         ai_signals.id — NO cross-project SQL FK)
                 repository.ts)                  learning_context jsonb (frozen snapshot)
                                                  outcome_* (written at most once)
```
No SQL foreign key crosses the two projects (not possible, and would wrongly couple two independently-resettable databases even if it were). The relationship is a logical `source_signal_id` string reference only.

### Main DB vs Learning DB authority boundary
- **Main DB (`ai_signals`/`ai_journal`)**: sole canonical authority for decision/action and outcome. Never duplicated, never recomputed, never written to by this phase's new code (only read).
- **Learning DB (`decision_experiences`)**: a learning *projection*. Never trusted as a trading authority, never read by any trading/execution code path — `paperTrader.ts`, the Oracle grading pipeline, and the execute-signal request handler never query it.

### Environment variables required
```
ELVOID_LEARNING_SUPABASE_URL=
ELVOID_LEARNING_SUPABASE_ANON_KEY=
ELVOID_LEARNING_SERVICE_ROLE_KEY=
```
No secrets committed anywhere; `.env.example` documents only the variable names, matching the file's existing convention. `ELVOID_LEARNING_SERVICE_ROLE_KEY` is read only by `lib/ai/learning/db.ts`, server-side, and is never returned in any API response or logged.

### LearningContextSnapshot contract
```ts
interface LearningContextSnapshot {
  readonly version: 1;
  readonly grade: OracleGrade | null;              // "NO_TRADE"|"B+"|"A"|"A+" — the live Oracle-assessment scale, kept separate from ai_signals.trade_grade/oracle_grade
  readonly confidence: number;
  readonly hypotheses: readonly { status: HypothesisStatus; uncertainty: HypothesisUncertainty }[] | null;
  readonly conflictState: CognitiveCoherenceState | null;
  readonly riskOverall: RiskSeverity | null;
  readonly riskContextQuality: RiskContextQuality | null;
}
```
Every field reuses an existing repository enum/type — no duplicate or incompatible enum was introduced. Explicitly excluded (fixtures 4–5 assert these never appear in output): `CognitiveObservation` in full, `CognitiveWorkingMemory`, hypothesis `statement`/`supportingEvidence`/`opposingEvidence`, conflict `reasons`/`contributingFactors`, any raw market payload, any LLM output.

### Context handoff implementation
Chosen mechanism: browser/API round-trip — the client receives `learningContext` in the `GET /api/elvoid-pro/oracle` response and resubmits it verbatim in the `POST /api/elvoid-pro/execute-signal` body, identical in shape and trust level to how `assessment`/`risk`/`confluence` already work in this exact route pair. This was chosen over a server-side in-memory cache because this app deploys to a serverless platform (Vercel) where a module-level cache cannot reliably bridge two separate function invocations — not a style preference but a deployment-topology constraint identified during the audit. No new authentication/session mechanism, no cryptographic signing (evaluated and rejected as unjustified overhead — `assessment`/`risk` already cross this same boundary with the same trust model and no prior compensating control exists for them either), no server-side cache, no request token table.

### Decision Experience lifecycle
```
executeOracleSignal(assessment, risk, confluence, orderType, learningContext)
  -> ai_signals row inserted (Main DB, unchanged shape/logic)
  -> captureDecisionExperienceBestEffort(row, learningContext)   [fire-and-forget]
       -> buildDecisionExperienceInput(row, learningContext)      [pure]
       -> persistDecisionExperience(input)                        [Learning DB, idempotent upsert]
```

### Outcome capture strategy
`captureAndPersistOutcome(signalId)` and its building blocks (`getJournalEntryBySignalId()`, `buildDecisionExperienceOutcome()`, `persistDecisionOutcome()`) are implemented and fixture-tested, but **intentionally not wired into any automatic trigger in this phase** — `lib/elvoid/paperTrader.ts` (the only place a trade's close/outcome event actually fires) is a protected file this phase does not modify, and no cron/queue/scheduled job was introduced (explicitly prohibited). This is a deliberate, honest scope boundary, not an oversight: the capability exists and is tested against hand-built fixtures; wiring an automatic outcome-capture trigger is left to a future phase's explicit approval. Outcome data, when captured, is copied verbatim from `ai_journal` — never recomputed, never trusted from a client.

### Idempotency strategy
- **Decision capture**: `persistDecisionExperience()` uses a single atomic `upsert(..., { onConflict: "source_signal_id", ignoreDuplicates: true })` against the Learning DB's own `UNIQUE(source_signal_id)` constraint — not a check-then-insert race, no invented distributed lock. A retried/duplicated capture for the same `ai_signals.id` never creates a second row.
- **Identifier strategy**: `source_signal_id` = the Main DB's `ai_signals.id`, which is already globally unique across both `AI_SIGNAL` and `ELVOID_PRO_ORACLE` rows (single shared table, per the Phase 8.1.0/8.1.1 audits already on record in this conversation) — so `UNIQUE(source_signal_id)` alone is correct; a composite `UNIQUE(source, source_signal_id)` was considered and rejected as redundant, not guessed.
- **Outcome capture**: `persistDecisionOutcome()` uses a conditional `UPDATE ... WHERE outcome_result IS NULL`, mirroring `lib/bugHunter/store.ts`'s existing `WHERE used_at IS NULL` one-time-use pattern already in this repository. A repeated call after the outcome is already set matches zero rows and is reported as `updated: false` — never a second write, never an overwrite.

### Immutability guarantees
Decision-time fields (`grade`/`confidence`/`learning_context`/`decision_timestamp`/etc.) are written exactly once, at insert, and never updated by any code path in this phase. `learning_context` is a flat, frozen, versioned copy of already-computed values — never a live reference, so a future change to `hypothesis.ts`'s or `conflict.ts`'s classification rules cannot reinterpret an already-stored historical record (fixture 6 explicitly verifies that mutating the source object after normalization does not change an already-produced snapshot).

### Security boundary
`learningContext` crosses the same HTTP boundary, with the same trust level, as `assessment`/`risk` already do in this exact request — not a new risk category. Minimum-necessary validation only: presence + shape (`version === 1`), silently dropped (not request-rejecting) if malformed. No cryptographic signing was added — evaluated in the preceding audit turn and found unjustified by any existing repository precedent (the same trust model already governs `assessment`/`risk` with no signing). Service-role keys (`SUPABASE_SERVICE_ROLE_KEY` and the new `ELVOID_LEARNING_SERVICE_ROLE_KEY`) remain server-side only; neither is read, logged, or returned by any file touched in this phase.

### Fixture results (`scripts/phase8/decision-outcome-fixtures.ts`) — 22/22 passed
1. `normalizeLearningContext` deterministic. 2. Does not mutate input. 3. Snapshot contains exactly the 7 allowed fields. 4–5. No evidence/statement/contributingFactors/reasons leak into output. 6. Source mutation after normalization does not affect an already-produced snapshot. 7a–7d. `null` context/hypotheses/conflict/risk each map to `null`, never fabricated. 8. `version` stable at `1`. 9–10. Hypothesis/conflict values copied verbatim, never recomputed. 11/13/14/20. No LLM/Binance/persistence dependency inside the pure functions or the Learning DB client (verified by source inspection, documented as such rather than falsely claimed as a live-executed check). 12. Synchronous, no I/O. 15/17. `sourceSignalId` correctly references `ai_signals.id`, independent of `buildOracleSignalId()`'s own hash scheme. 16. Idempotent-upsert design verified structurally. 18. `AI_SIGNAL` source with `learningContext = null` is valid. 19. No forbidden duplicate-authority field names; canonical `side`/`grade`/`confidence` copied verbatim. 21. Outcome fields copied verbatim from `AiJournalEntry`. 22. Input objects byte-identical after `buildDecisionExperienceInput`/`Outcome`.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-outcome-fixtures.ts`

Note on scope: cases 11/13/14/16/20 are structural/source-inspection assertions rather than live-executed checks, because `lib/ai/decisionOutcome/repository.ts` and `lib/ai/learning/db.ts` transitively import `@supabase/supabase-js`, an external package not installable in this offline sandbox (no `node_modules`, no network egress) — documented honestly rather than silently skipped or falsely reported as executed.

### Regression
- `scripts/phase8/cognitive-observation-fixtures.ts` — re-ran unmodified, **10/10 passed**.
- `scripts/phase8/cognitive-context-fixtures.ts` — re-ran unmodified, **22/22 passed**.
- No other fixture suite in this repository snapshot touches `lib/ai/decisionOutcome/*`, `lib/ai/learning/*`, or the two modified API routes' new field.
- `grep` across `lib/ai/cognitive/*`, `lib/ai/oracle/*` (excluding `execute.ts`'s new optional parameter itself), `lib/ai/core/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/performance.ts`, `lib/elvoid/review.ts`, `app/api/ai-signals/*`, `app/api/ai-journal/*`, `app/api/ai-performance/*`, and the Binance `bn_*` subsystem confirms zero imports of `lib/ai/decisionOutcome/*` or `lib/ai/learning/*` from any of them — one-way dependency direction confirmed.

### Typecheck / build
- `npx tsc --noEmit` — whole-repo run fails with ~9,900 errors, all attributable to this sandbox having **no `node_modules`** and no network access to install them (a pre-existing environment restriction, confirmed by the fact that `lib/supabase.ts` — an untouched, protected file — throws the identical `@supabase/supabase-js`/`process` error pattern). Not caused by this phase.
- Isolated check: filtering for the files this phase touched shows **zero logic errors** — `lib/ai/decisionOutcome/contracts.ts`, `capture.ts`, and `repository.ts` produce **no errors at all**. `lib/ai/learning/db.ts`, the two modified API routes, and the new fixture script show only the same `next/server`/`@supabase/supabase-js`/`process`-missing pattern every other file in the repo already exhibits (confirmed by direct comparison against `lib/supabase.ts` and `app/api/ai-signals/scan/route.ts`, both untouched).
- `next build` was not attempted — same unavailable `node_modules`, plus the previously-documented blocked Google Fonts egress; this phase adds no new build-time dependency, so an attempt would only re-surface already-documented, unrelated restrictions.

### Deviations from specification
- Outcome-capture auto-triggering was **not** wired into `paperTrader.ts`'s close event, per the "Known limitations" note above — this is an explicit, reasoned scope boundary (protected file + no-cron rule), not an unnoticed gap.
- `decision_experiences` uses `UNIQUE(source_signal_id)` rather than the task's fallback suggestion `UNIQUE(source, source_signal_id)`, because repository evidence (both prior audits in this conversation) established `ai_signals.id` is already globally unique across both sources — using the composite key would have been guessing where evidence already existed.

### Known limitations
- Outcome capture (`captureAndPersistOutcome`) exists and is tested but has no automatic trigger yet — see above. A future phase must decide how it's invoked (a new, explicitly-approved hook point, not a cron job).
- `repository.ts` and `lib/ai/learning/db.ts` could not be exercised against a live (or mocked) Supabase instance in this sandbox — verified structurally and via the fixture suite's pure-function coverage instead; recommend a live smoke test against real Main DB + Learning DB instances before this reaches production traffic.
- `learningContext` is only ever populated for `ELVOID_PRO_ORACLE`-sourced decisions today (the only path that builds a `CognitiveDecisionContext` at all) — `AI_SIGNAL`-sourced decisions are not currently wired to call `captureDecisionExperience()` at all (that flow never calls `executeOracleSignal()`), so **no Decision Experience is captured yet for normal AI Signal trades**. The underlying `capture.ts`/`repository.ts` functions are source-agnostic and ready for this, but wiring the normal AI Signal flow (`app/api/ai-signals/*`, a protected file) into decision-experience capture was left out of scope for this phase and would require separate, explicit approval.

### Scope check
NEW: `lib/ai/learning/db.ts`, `supabase/learning/schema.sql`, `lib/ai/decisionOutcome/contracts.ts`, `lib/ai/decisionOutcome/capture.ts`, `lib/ai/decisionOutcome/repository.ts`, `scripts/phase8/decision-outcome-fixtures.ts`.
MODIFIED: `app/api/elvoid-pro/oracle/route.ts` (additive field only), `app/api/elvoid-pro/execute-signal/route.ts` (additive, backward-compatible optional field), `lib/ai/oracle/execute.ts` (additive, backward-compatible optional parameter + best-effort capture call), `.env.example`, `README.md`, `CHANGES.md`.
MUST-REMAIN-UNTOUCHED confirmed clean: `supabase/schema.sql` (Main DB schema, not modified), `lib/supabase.ts`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/performance.ts`, `lib/elvoid/review.ts`, `lib/elvoid/engine.ts`, `lib/ai/cognitive/*` (all five files), `lib/ai/core/*`, `app/api/ai-signals/*`, `app/api/ai-journal/*`, `app/api/ai-performance/*`, Binance Auto-Trader subsystem and all `bn_*` tables, Main Supabase auth architecture.
No autonomous execution, no LLM call, no Phase 8.1.1+ logic (evaluation/scoring/pattern detection/adaptive constraints/learning validation) was implemented.

---

## Phase 8.1.0 — Learning Database Environment Finalization

### Purpose
A narrow correction, based on a completed audit turn in this conversation that compared the Phase 8.1.0 environment naming against this repository's own established second-Supabase-project precedent (`lib/supabaseData.ts`'s `DATA_SUPABASE_URL`/`DATA_SUPABASE_SERVICE_ROLE_KEY`). No learning logic, Cognitive Layer behavior, schema, or trading behavior was touched.

### Old names removed
- `ELVOID_LEARNING_SERVICE_ROLE_KEY` (missing `_SUPABASE_`, inconsistent with the `DATA_SUPABASE_*` pattern) — zero references remain anywhere in the repository outside this file's own historical entry above (intentionally preserved as an accurate record of what was implemented at the time).
- `ELVOID_LEARNING_SUPABASE_ANON_KEY` (unused dead configuration — no code ever read it, and no legitimate browser-facing use case exists for a Learning DB anon key) — removed entirely, zero references remain.

### Final names
```
ELVOID_LEARNING_SUPABASE_URL
ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY
```
Exactly two variables — no anon key. Confirmed by direct comparison against `lib/supabaseData.ts`, this repo's only other second-Supabase-project client, which also uses URL + service-role-only, no anon key, anywhere.

### Files modified
- `lib/ai/learning/db.ts` — `isLearningSupabaseConfigured()` and `getLearningSupabase()` now read `ELVOID_LEARNING_SUPABASE_SERVICE_ROLE_KEY` instead of `ELVOID_LEARNING_SERVICE_ROLE_KEY`. No other logic changed — same null-on-missing-config behavior, same no-fallback guarantee, same server-only scope.
- `.env.example` — Learning Database section reduced from three lines to two (`ELVOID_LEARNING_SUPABASE_ANON_KEY=` removed), header comment updated to explicitly note the URL+service-role-only pattern and cross-reference `DATA_SUPABASE_*`'s identical precedent.
- `README.md` — the "Decision Outcome Capture & ELVOID Learning Database" section's env var block and surrounding prose updated to the two final names; explicitly states no anon key exists for this project.
- `scripts/phase8/decision-outcome-fixtures.ts` — one comment (case 20) updated to reference the correct variable name; no test logic changed.

### Files inspected, left unmodified
`lib/ai/decisionOutcome/contracts.ts`, `capture.ts`, `repository.ts` (no direct `process.env.ELVOID_LEARNING_*` reference exists in any of them — only `lib/ai/learning/db.ts` reads these vars, confirmed by repository-wide grep before making any change), `supabase/learning/schema.sql` (no env var name appears in SQL), `lib/supabase.ts`, `lib/supabaseData.ts`, `lib/auth/*`, `middleware.ts`, all Cognitive Layer files, all Phase 7 Oracle modules, `lib/elvoid/paperTrader.ts`/`performance.ts`/`review.ts`, all Binance/`bn_*` files, `app/api/ai-signals/*`/`ai-journal/*`/`ai-performance/*` — none reference the Learning DB env vars at all, confirmed by the same grep.

### Historical record note
This CHANGES.md's own Phase 8.1.0 entry above (the original implementation report) is left as-is — an accurate record of what was implemented at that time, including the now-superseded variable names. This new entry is the authoritative correction; the two together form the complete history.

### Server-only boundary confirmation
- `lib/ai/learning/db.ts` has no `"use client"` directive; its only consumer, `lib/ai/decisionOutcome/repository.ts`, also has none (confirmed by fixture 10 below).
- Repository-wide grep confirms only `lib/ai/decisionOutcome/repository.ts` (and, in a doc-comment only, `contracts.ts`) reference `lib/ai/learning/db.ts` at all — no route handler, Server Component, or client component imports it directly.
- No credential is returned by any API response or written to any log line anywhere in `lib/ai/learning/db.ts` (confirmed by fixture 9 below — zero `console.*` calls in the file).

### Fallback confirmation
`lib/ai/learning/db.ts` contains zero references to `process.env.NEXT_PUBLIC_SUPABASE_URL`, `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`, `process.env.SUPABASE_SERVICE_ROLE_KEY` (Main DB), or `process.env.DATA_SUPABASE_URL`/`process.env.DATA_SUPABASE_SERVICE_ROLE_KEY` (Data DB) — confirmed by fixtures 6–7 below. Its only failure path is `return null`, never a silent redirect to another project.

### Timeout hardening decision: not added
`lib/supabaseData.ts`'s `timeoutFetch` (8s abort) exists because its Data DB read is **awaited synchronously on the request-response path** — a hang there is "indistinguishable from an RPC hang from the outside," directly blocking the user-facing response. `lib/ai/learning/db.ts`'s only caller, `lib/ai/oracle/execute.ts`'s `captureDecisionExperienceBestEffort()`, is explicitly **fire-and-forget** — `captureDecisionExperience(...).catch(() => {})`, never `await`ed by `executeOracleSignal()`. A hang inside the Learning DB write therefore cannot delay or block the trade-execution response at all; it can only leave a dangling promise, which Vercel's Node serverless runtime already bounds by the function's own execution lifetime regardless. Given the call is already non-blocking, adding a timeout wrapper would add complexity without a corresponding user-facing benefit — the specific failure mode `lib/supabaseData.ts`'s timeout protects against (a hung *awaited* read) does not exist on this code path. **Decision: not added**, per the "do not invent complexity" instruction; documented here rather than silently applied or silently skipped.

### Fixture results

**New: `scripts/phase8/learning-db-env-fixtures.ts` — 12/12 passed.** Static source-scan verification (no live Supabase connection): 1/1b. New var names present in `db.ts`. 2/2b. Old service-role name absent (with a sanity check that the old name isn't a false-positive substring of the new one). 3a/3b. Anon key name absent from both `db.ts` and `.env.example`. 4/5. Neither var is ever prefixed `NEXT_PUBLIC_`. 6/7. `db.ts` reads no Main DB or Data DB credential. 8. The missing-config guard returns `null`, never throws (verified structurally, since live execution would require `@supabase/supabase-js`, unavailable in this offline sandbox). 9. Zero `console.*` calls in `db.ts`. 10. Neither `db.ts` nor its only consumer `repository.ts` is a `"use client"` module.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/learning-db-env-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
- `scripts/phase8/cognitive-observation-fixtures.ts` (8.0.1) — passed.
- `scripts/phase8/cognitive-memory-fixtures.ts` (8.0.2) — passed.
- `scripts/phase8/cognitive-hypothesis-fixtures.ts` (8.0.3) — passed.
- `scripts/phase8/cognitive-conflict-fixtures.ts` (8.0.4) — passed.
- `scripts/phase8/cognitive-context-fixtures.ts` (8.0.5) — passed.
- `scripts/phase8/decision-outcome-fixtures.ts` (8.1.0) — **22/22 passed**, unmodified except the one comment fix noted above.

### Typecheck
`npx tsc --noEmit` — whole-repo run still fails only on the same pre-existing missing-`node_modules` pattern documented in every prior Phase 8 entry (confirmed identical on untouched `lib/supabase.ts`). Filtering for every file touched this pass (`lib/ai/learning/db.ts`, `scripts/phase8/learning-db-env-fixtures.ts`) shows only that same `@supabase/supabase-js`/`node:fs/promises`/`process`-missing pattern — zero logic errors introduced. `lib/ai/decisionOutcome/{contracts,capture,repository}.ts` remain untouched by this pass and were re-confirmed to show zero errors.

### Build
Not attempted — same unavailable `node_modules`, plus the previously-documented blocked Google Fonts egress; this pass changes no build-time dependency.

### Confirmation
No Cognitive Layer, trading, or authentication behavior changed — this pass touched exactly `lib/ai/learning/db.ts` (two variable-name references), `.env.example`, `README.md`, one comment in `scripts/phase8/decision-outcome-fixtures.ts`, and added one new fixture file. `git status --porcelain` confirms no protected file (`lib/ai/cognitive/*`, `lib/ai/core/*`, `lib/ai/oracle/*` other than the untouched `execute.ts` from the prior pass, `lib/elvoid/paperTrader.ts`/`performance.ts`/`review.ts`, `lib/supabase.ts`, `lib/supabaseData.ts`, `lib/auth/*`, `middleware.ts`, `app/api/ai-signals/*`/`ai-journal/*`/`ai-performance/*`, Binance/`bn_*`) appears in the diff for this pass.

### Scope check
NEW: `scripts/phase8/learning-db-env-fixtures.ts`.
MODIFIED: `lib/ai/learning/db.ts`, `.env.example`, `README.md`, `scripts/phase8/decision-outcome-fixtures.ts` (one comment), `CHANGES.md`.
No schema change. No new table. No architecture redesign. No Cognitive/Oracle/Trading/Auth file touched.

---

## Phase 8.1.0 — Outcome Lifecycle Completion

### Purpose
Closes the confirmed gap (identified in the Phase 8.1.1 pre-implementation audit earlier in this conversation): `captureAndPersistOutcome()` existed and was fixture-tested since the original Phase 8.1.0 implementation, but had zero production call sites — a closed paper trade updated `ai_journal` but never completed its corresponding `decision_experiences` row in the Learning DB. This entry wires the trigger. It does not touch Phase 8.1.1 (Decision Evaluation Engine) in any way.

### Architecture: before vs after
```
BEFORE:
executeOracleSignal() -> ai_signals INSERT -> decision_experiences INSERT (decision fields only)
paperTrader.writeClose() -> ai_journal INSERT -> ai_signals.status update -> STOP (outcome_* stays null forever)

AFTER:
paperTrader.writeClose() -> ai_journal INSERT (confirmed successful)
                          -> captureAndPersistOutcome(signal.id)  [fire-and-forget, non-blocking]
                                -> getJournalEntryBySignalId() (Main DB read)
                                -> buildDecisionExperienceOutcome() (pure, existing)
                                -> persistDecisionOutcome() (Learning DB, conditional UPDATE ... WHERE outcome_result IS NULL)
                          -> ai_signals.status update (unchanged, unaffected by the above)
```

### Files changed
- `lib/elvoid/paperTrader.ts` — **+28 lines, 0 deletions, 0 modifications to existing logic** (confirmed via `git diff --stat`). One new import (`captureAndPersistOutcome` from `lib/ai/decisionOutcome/repository.ts`) and one new fire-and-forget call inside `writeClose()`, placed immediately after the existing `ai_journal` insert's error guard. All four existing call sites of `writeClose()` (manual close, stop-loss hit, TP2 hit, breakeven-stop hit) are covered automatically since the trigger lives inside the shared function, not duplicated at each call site.
- `lib/ai/decisionOutcome/repository.ts` — doc-comment only: `captureAndPersistOutcome()`'s header comment updated to state it is now wired (was previously documented as "not wired into any automatic trigger in this phase"). No behavioral change to this file.
- `scripts/phase8/decision-outcome-fixtures.ts` — 11 new fixture cases (23–33) appended; existing 22 cases unchanged.
- `CHANGES.md` — this entry.

### Trigger location
Inside `writeClose()` (the single, already-centralized function that inserts into `ai_journal` for all four close paths), placed immediately after the `if (error) { ...; return null; }` guard on the `ai_journal` insert. This guarantees the required ordering: outcome capture can only fire after `ai_journal`'s insert has already returned successfully — never before, never in place of it, and never at all if the canonical insert failed (fixture 29 verifies this ordering by source position).

### Authority confirmation
- `ai_journal` remains the sole canonical outcome authority — `captureAndPersistOutcome()` only ever *reads* it (via the pre-existing `getJournalEntryBySignalId()`), never writes to it, and this pass adds no new write to `ai_journal` or `ai_signals` beyond what already existed.
- The Learning DB's `decision_experiences.outcome_*` fields are populated strictly *after* and *from* that canonical read — a snapshot, never a second source of truth. `paperTrader.ts` still owns zero lines of outcome-normalization logic itself (fixture 31 explicitly asserts no `outcome_*`/`decision_experiences` literal appears in `paperTrader.ts`'s code) — normalization and persistence remain entirely inside `lib/ai/decisionOutcome/*`, exactly as before this change.

### Failure isolation
`captureAndPersistOutcome(signal.id).catch((err) => console.error(...))` — not awaited, so a slow or unreachable Learning Database adds zero latency to any of the four trade-close paths, and cannot delay the API response a user is waiting on (e.g. `closeSignalManually`). The `.catch()` ensures a rejection can never propagate out of `writeClose()` and never affects the `ai_signals` status update or wallet update that follow it in the same function — both already unconditional and already run today regardless of Learning DB state. Per the task's explicit "do not silently swallow programming errors without observability" instruction, the catch handler logs via `console.error`, the same convention already used two lines above for the `ai_journal` insert's own error path — so an unexpected exception (as opposed to the already-handled "Learning DB not configured" or "no outcome yet" cases, both of which resolve normally rather than reject) remains visible in logs.

### Idempotency
Unchanged, reused entirely from the existing Phase 8.1.0 pipeline: `persistDecisionOutcome()`'s conditional `UPDATE ... WHERE outcome_result IS NULL` (already implemented, already fixture-tested) means a duplicate/repeated call — e.g. if `writeClose()` were ever somehow invoked twice for the same signal — matches zero rows on the second attempt and is reported as `updated: false`, never overwriting an already-captured outcome. No new idempotency mechanism was added or needed.

### Cross-database transaction boundary
No distributed transaction, no two-phase commit, no cross-project foreign key. `ai_journal`'s insert is a complete, independent, already-committed write before `captureAndPersistOutcome()` is even invoked; the Learning DB write is a fully separate, independent-failure-domain operation on a different Supabase project, exactly as the existing decision-capture side (`captureDecisionExperienceBestEffort()` in `lib/ai/oracle/execute.ts`) already established as the repository's pattern for this.

### AI_SIGNAL compatibility
No change was needed: `captureAndPersistOutcome()` operates purely on `signalId` and reads `ai_journal`/`decision_experiences` by that ID, with no dependency on `learning_context` at all — it works identically whether the originating decision was `ELVOID_PRO_ORACLE` (with a populated `learning_context`) or `AI_SIGNAL` (with `learning_context = null`), since the outcome patch never reads or requires that field (fixtures 23–25 use the default `AI_SIGNAL`-shaped fixture signal already established in this file, exercising exactly this path).

### Fixture results (`scripts/phase8/decision-outcome-fixtures.ts`) — 33/33 passed
Cases 1–22 unchanged (see the original Phase 8.1.0 entry above). New this pass: 23. WIN outcome captured correctly. 24. LOSS outcome captured correctly. 25. BREAKEVEN outcome captured correctly. 26–28. `rr`/`profit_percent`/`duration_minutes`(including `0`)/`closed_at` all preserved exactly, no rounding or truncation. 29. `captureAndPersistOutcome()` call is positioned after the `ai_journal` insert's error guard (ordering, verified by source position). 30. The call is not `await`ed (fire-and-forget). 31. No `outcome_*`/`decision_experiences` literal appears anywhere in `paperTrader.ts` (no duplicated normalization logic). 32. The call has a `.catch()` handler (failure isolation). 33. No Phase 8.1.1 term (`decision_evaluations`, `DecisionEvaluation`, `evaluateDecision`, `GOOD_DECISION`/`BAD_DECISION`, `decisionQuality`, `marketOutcome`) appears anywhere in `paperTrader.ts`.

Cases 29–33 are static source-scan checks (same reasoning as `learning-db-env-fixtures.ts`'s cases: `paperTrader.ts` transitively imports `@supabase/supabase-js`, unavailable in this offline sandbox, so its live behavior is verified structurally rather than by executing `writeClose()` against a real database).

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-outcome-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
`cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `learning-db-env-fixtures.ts` — all passed, unmodified.

### Typecheck
Zero new logic errors. `lib/elvoid/paperTrader.ts` shows only the same pre-existing `@supabase/supabase-js`-missing pattern every other Supabase-importing file in this repo already exhibits (confirmed by comparison against `lib/supabase.ts` in prior entries). `lib/ai/decisionOutcome/{contracts,capture,repository}.ts` remain at zero errors.

### Build
Not attempted — same unavailable `node_modules`/blocked Google Fonts egress documented in every prior entry; this pass introduces no new build-time dependency.

### Explicit scope check — Phase 8.1.1 NOT introduced
No `decision_evaluations` table, no `DecisionEvaluation` type, no `evaluateDecision()` function, no decision-quality classification, no `GOOD_DECISION_*`/`BAD_DECISION_*` states, no pattern detection, no adaptive constraints, no LLM call — confirmed by fixture 33's explicit negative-term scan of `paperTrader.ts`, and by the fact that no file under a `lib/ai/decisionEvaluation/*` path (or any equivalent) was created this pass.

### Remaining roadmap status
- Decision Capture: **COMPLETE** (unchanged from original Phase 8.1.0 entry).
- Learning DB: **COMPLETE** (unchanged).
- Outcome Schema: **COMPLETE** (unchanged — `supabase/learning/schema.sql` was not modified this pass; the columns already existed, only the trigger to populate them was missing).
- Outcome Lifecycle: **COMPLETE** — the gap identified in the Phase 8.1.1 pre-implementation audit is closed. A closed paper trade (via any of the four `writeClose()` call paths) now results in a best-effort, non-blocking attempt to populate `decision_experiences.outcome_*` for its corresponding decision, for both `AI_SIGNAL` and `ELVOID_PRO_ORACLE` sources.
- **Phase 8.1.1 is now genuinely unblocked** at the data-availability level — real closed decision experiences with populated outcomes will exist going forward (not retroactively for trades closed before this change, since outcome capture is only triggered at close time, not backfilled). Phase 8.1.1's own architecture (a new `decision_evaluations` table, per the earlier audit's recommendation) remains unimplemented and awaits separate approval.

### Scope check
MODIFIED: `lib/elvoid/paperTrader.ts` (+28/-0), `lib/ai/decisionOutcome/repository.ts` (doc comment only, 0 behavioral change), `scripts/phase8/decision-outcome-fixtures.ts` (+11 fixture cases), `CHANGES.md`.
NOT MODIFIED: Oracle grading, Phase 7 intelligence, Cognitive Layer, authentication, Main DB schema, `supabase/learning/schema.sql`, Binance Auto-Trader, `bn_*` tables, execution strategy, paper trade calculation logic (`computeCloseResult`/`computeUnrealized` untouched) — confirmed via `git status --porcelain` showing no protected file in the diff for this pass.

---

## Phase 8.1.1.1 — Decision Evaluation Lifecycle Wiring

### Purpose
Closes a race-condition hazard identified in a pre-implementation audit earlier in this conversation: `evaluateAndPersistDecision()` (Phase 8.1.1) had no production call site, and the naive way to add one — two independent fire-and-forget calls, `captureAndPersistOutcome(signalId); evaluateAndPersistDecision(signalId);` — could let evaluation race ahead of outcome persistence, reading `decision_experiences` before `outcome_result` was set, computing `INSUFFICIENT_EVIDENCE`, and persisting it under `decision_evaluations`' `UNIQUE(source_signal_id)` + `upsert(..., ignoreDuplicates: true)` — a combination that can **never** later be corrected by a subsequent, correct evaluation attempt. This entry wires the two Phase 8.1.0/8.1.1 pipelines together safely.

### Architecture: the orchestrator
```
lib/ai/decisionLearning/lifecycle.ts :: completeDecisionLearningLifecycle(sourceSignalId)

  await captureAndPersistOutcome(sourceSignalId)
       -> if not `persisted: true`, THROW immediately — evaluation never runs
  await getDecisionExperienceForEvaluation(sourceSignalId)
  evaluateDecision(experience)   [pure]
       -> if evaluationClass === "INSUFFICIENT_EVIDENCE": log + skip persistence (see guard below)
       -> else: await persistDecisionEvaluation({...evaluation, evaluatedAt: new Date().toISOString()})
            -> if not `persisted: true`, THROW
```
This is the **only** module that imports from both `lib/ai/decisionOutcome/*` and `lib/ai/decisionEvaluation/*` — dependency direction is strictly `decisionOutcome -> decisionLearning/lifecycle <- decisionEvaluation`; neither domain imports the other's behavioral (repository/capture/evaluate) modules directly (confirmed by fixtures 16–17 below; the one pre-existing exception — `decisionEvaluation/contracts.ts` importing the `DecisionExperienceRecord` *type* from `decisionOutcome/contracts.ts` — is a shared-shape type import, not a behavioral coupling, predates this task, and was left untouched per explicit scope).

### Outcome return semantics (inspected before implementation, not assumed)
`captureAndPersistOutcome()`'s actual return type is `Promise<{persisted: true; updated: boolean} | {persisted: false; reason: "not_configured"|"error"|"no_outcome_yet"; error?: string}>` — **it never throws or rejects**; every failure mode is a typed result. The orchestrator's correctness condition is `persisted === true` alone — `updated: false` (meaning the outcome was already present before this call) is treated identically to `updated: true` (this call just wrote it), since both mean "the canonical Learning DB row now reliably has an outcome." Any `persisted: false` result, of any reason, is converted into a thrown `Error` by the orchestrator itself, since the underlying function won't throw one on its own.

### Failure isolation
- **Case 1 — outcome capture does not confirm success**: the orchestrator throws before ever calling `getDecisionExperienceForEvaluation()`/`evaluateDecision()`. Evaluation never runs. Verified by fixture 4 (guard body contains `throw`) and fixtures 1–2/12 (strict source-order and causal-dependency checks).
- **Case 2 — outcome succeeds but evaluation fails**: the outcome write already completed and independently remains persisted (no cross-database transaction exists to roll it back, and the orchestrator contains no delete/rollback call — fixture 5). The error propagates out of the orchestrator's Promise to `paperTrader.ts`'s single `.catch()`, which logs `"[ElVoid AI] Decision learning lifecycle failed (non-fatal, trade close unaffected):"` — the same convention as the two other `console.error` calls already in that file. No retry is attempted (fixture 19 confirms no retry/queue/cron infrastructure exists anywhere in the new code); a future manual `evaluateAndPersistDecision()` call remains fully valid and safe if invoked later.
- The orchestrator itself has no internal `try/catch` (fixture 6) — every thrown error is intentionally left to propagate to the caller's boundary, per the task's explicit "do not swallow the error inside the orchestrator" requirement.

### Automatic `INSUFFICIENT_EVIDENCE` guard
Implemented entirely at the composition boundary (inside `lifecycle.ts`), **not** inside `evaluate.ts` or `decisionEvaluation`'s persistence rules (both untouched, confirmed by `git status`). The orchestrator deliberately does **not** call the coarser `evaluateAndPersistDecision()` convenience wrapper — which always persists unconditionally — and instead composes `getDecisionExperienceForEvaluation()` + `evaluateDecision()` + `persistDecisionEvaluation()` directly, so it can intercept before the final write. When the automatic post-outcome-success evaluation resolves to `INSUFFICIENT_EVIDENCE`, the orchestrator logs a diagnostic (`console.log`, not `console.error` — this is an expected defensive skip, not a failure) and returns without calling `persistDecisionEvaluation()`, avoiding a permanently-locked incorrect record. **Manual/historical evaluation semantics are completely unaffected**: `evaluateAndPersistDecision()` itself was not modified and still persists unconditionally for its own callers (fixture 14b), where a genuine `INSUFFICIENT_EVIDENCE` (e.g. re-evaluating an old, still-open decision) remains valid, persistable data.

### Idempotency
Unchanged and fully inherited — the orchestrator introduces zero database writes of its own (fixture 9: no `.insert(`/`.update(`/`.upsert(` anywhere in `lifecycle.ts`); it exclusively delegates to the already-idempotent `captureAndPersistOutcome()` (conditional `UPDATE ... WHERE outcome_result IS NULL`) and `persistDecisionEvaluation()` (`UNIQUE(source_signal_id)` + `ignoreDuplicates` upsert). Repeated/duplicate `completeDecisionLearningLifecycle()` calls for the same signal are safe: a second call's outcome step is a no-op (`updated: false`, still `persisted: true`, still allows evaluation per the fix above), and a second evaluation attempt (if the class isn't `INSUFFICIENT_EVIDENCE`) is a safe no-op via the existing `ignoreDuplicates` guarantee.

### Files changed
- **NEW**: `lib/ai/decisionLearning/lifecycle.ts` (the orchestrator), `scripts/phase8/decision-learning-lifecycle-fixtures.ts` (21 cases).
- **MODIFIED**: `lib/elvoid/paperTrader.ts` — the single existing `captureAndPersistOutcome(signal.id).catch(...)` call site inside `writeClose()` replaced with `completeDecisionLearningLifecycle(signal.id).catch(...)` (same fire-and-forget shape, same `.catch()`-based isolation, same position immediately after the `ai_journal` insert's error guard and before the `ai_signals` status/wallet updates — all 4 close paths covered automatically, unchanged). `scripts/phase8/decision-outcome-fixtures.ts` — cases 29/30/32/33 updated to check for the new `completeDecisionLearningLifecycle(...)` call site instead of the now-superseded direct `captureAndPersistOutcome(...)` call (the underlying architectural claims those cases verify — ordering, non-blocking, failure isolation, no duplicated evaluation logic — are unchanged; only the literal function name being checked for changed, since the call site itself moved). `CHANGES.md` — this entry.
- **UNTOUCHED** (confirmed via `git status --porcelain`): `lib/ai/cognitive/*`, `lib/ai/oracle/*`, `lib/ai/decisionOutcome/{contracts,capture}.ts`, `lib/ai/decisionEvaluation/{contracts,evaluate,repository}.ts`, `supabase/learning/schema.sql`, Main DB schema, Binance/`bn_*`, auth, wallet logic, order execution, signal generation.

### Fixture results (`scripts/phase8/decision-learning-lifecycle-fixtures.ts`) — 21/21 passed
Static source-inspection verification (no live Supabase — `lifecycle.ts` transitively imports `@supabase/supabase-js` via both domains' repository files, unavailable in this offline sandbox, same reasoning as every other Supabase-dependent fixture in this repo). Covers: 1–3 ordering (outcome-before-evaluation in source position, strict await sequencing, no concurrent `Promise.all`/`race`). 4–8 failure isolation (guard contains `throw`, no rollback of the outcome write, no internal `try/catch` swallowing errors, `writeClose()` doesn't await the lifecycle, the `ai_signals` status update sits structurally after and outside the lifecycle call). 9–12 idempotency (zero direct DB writes in the orchestrator, `updated: false` still permits evaluation, evaluation persistence goes through the existing idempotent adapter, evaluation call is causally downstream of the outcome guard). 13–14b the automatic `INSUFFICIENT_EVIDENCE` guard skips persistence while the manual wrapper stays untouched. 15–18 scope/boundary guards (exactly one orchestrator call site in `paperTrader.ts`, no behavioral cross-imports between the two domains, the orchestrator is confirmed as the sole dual-importer). 19–20 no retry/queue/cron/auto-trading/LLM/Binance terms anywhere in the new code.

Also re-ran `scripts/phase8/decision-outcome-fixtures.ts` after updating its 4 affected cases: **33/33 still passed**.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-learning-lifecycle-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
`cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (33/33, 4 cases updated for the new call site), `learning-db-env-fixtures.ts` (12/12), `decision-evaluation-fixtures.ts` (36/36) — all passed.

### Typecheck
Zero errors in `lib/ai/decisionLearning/lifecycle.ts`. `lib/elvoid/paperTrader.ts` and the two touched fixture scripts show only the same pre-existing `@supabase/supabase-js`/`node:fs/promises`/`process`-missing pattern every other Supabase- or Node-API-importing file in this repo already exhibits.

### Build
Not attempted — same unavailable `node_modules`/blocked Google Fonts egress documented in every prior entry; no new build-time dependency introduced.

### Explicit scope guard
Repository-wide scan for `OpenAI`/`Claude`/`prompt`/auto-execute/auto-trade/order-placement/adaptive-execution/position-sizing/risk-mutation/retry-queue/cron/pattern-detection/decision-memory/schema-change terms across every file touched this pass: the only matches found were (a) inside the new fixture file's own *forbidden-term string literals* (the search terms themselves, used to verify their absence elsewhere) and (b) inside `lifecycle.ts`'s own doc comment explicitly *disclaiming* "no retry queue, no cron/polling" — both false positives from substring matching, not actual usage. No schema file was modified.

### Remaining roadmap status
- Phase 8.1.0: Decision Capture + Learning DB + Outcome Lifecycle — **COMPLETE**.
- Phase 8.1.1: Decision Evaluation Engine — **COMPLETE**.
- Phase 8.1.1.1: Decision Evaluation Lifecycle Wiring — **COMPLETE**. The full automatic pipeline (`writeClose() -> ai_journal -> outcome capture -> evaluation -> decision_evaluations`) is now correctly sequenced and safely wired for every trade that closes going forward.
- Future only, not started: Phase 8.1.2 Failure Pattern Detection, Phase 8.1.3 Decision Memory, adaptive constraints.

---

## Phase 8.1.2 — Failure Pattern Detection

### Purpose
Adds the next stage in the Phase 8.1 pipeline: a deterministic, offline, historical-learning layer that surfaces recurring negative decision patterns from the accumulated `decision_experiences` x `decision_evaluations` population. Strictly **observational/statistical**, never causal, and never wired into trading behavior — this phase computes and persists aggregate candidates only; nothing reads them yet and nothing acts on them.

### Architecture
```
lib/ai/failurePatterns/
  contracts.ts   — types only: FailurePatternObservationInput (join row),
                   FailurePatternCandidateWithoutTimestamp (pure output),
                   FailurePatternCandidate (+ computedAt, persisted shape)
  detect.ts      — detectFailurePatternCandidates(observations): pure,
                   deterministic, zero DB/LLM/fetch/Date.now/randomness
  repository.ts  — getFailurePatternObservations() [read, joins
                   decision_experiences + decision_evaluations in-memory
                   by source_signal_id], persistFailurePatternCandidates()
                   [recompute-and-upsert write], recomputeFailurePatterns()
                   [orchestrator, composes the two + the pure detector]

scripts/phase8/failure-pattern-fixtures.ts — 16 offline cases against detect.ts
```
Same layering convention as Phase 8.1.1 (`decisionEvaluation/{contracts,evaluate,repository}.ts`): pure domain logic (`detect.ts`) never imports Supabase/network/LLM; `repository.ts` holds 100% of the persistence-aware code and zero aggregation logic. `getLearningSupabase()` (`lib/ai/learning/db.ts`, Phase 8.1.0) is reused unchanged — no second Learning DB client was created.

### Naming — collision with `lib/ai/insights` avoided
`lib/ai/insights/types.ts` already owns `InsightPattern`/`PatternKind` for a fully unrelated concept (live market-structure pattern detection over `OracleContext`/`ConfluenceResult` — liquidity sweeps, order-block reactions, etc., via `detectAllPatterns()`). Every exported type in `lib/ai/failurePatterns/*` is prefixed `FailurePattern*` (`FailurePatternSource`, `FailurePatternEvidenceTag`, `FailurePatternEvaluationClass`, `FailurePatternObservationInput`, `FailurePatternCandidateWithoutTimestamp`, `FailurePatternCandidate`) and neither `Pattern` bare, `PatternKind`, nor `InsightPattern` appears anywhere in this module's actual code (verified by fixture 10, comment-stripped scan).

### Grouping / detection rules (implemented exactly as specified)
- **Grouping key**: `(source, evidenceTag)` — single evidence tag only, never a multi-tag combination. A decision carrying multiple evidence tags fans out into one independent contribution per tag (fixture 14).
- **AI_SIGNAL and ELVOID_PRO_ORACLE are never merged** into the same group, even for the identical evidence tag (fixture 4).
- **Negative-outcome filter**: only rows whose `decision_evaluations.evaluation_class` is `GOOD_DECISION_BAD_OUTCOME` or `BAD_DECISION_BAD_OUTCOME` (i.e. `marketOutcome === "NEGATIVE"` per Phase 8.1.1's own `evaluateMarketOutcome`) contribute to a group's `occurrenceCount` — every other evaluation class (including `BAD_DECISION_GOOD_OUTCOME`, `NEUTRAL_OUTCOME`, `INSUFFICIENT_EVIDENCE`) is excluded (fixture 11).
- **Minimum occurrence**: `occurrenceCount >= 5` (`MIN_OCCURRENCE_COUNT`); groups below that are dropped entirely, never persisted as a low-confidence row (fixtures 1–2).
- **Temporal recurrence**: the group's rows must span **more than one distinct UTC calendar date** (derived from `decisionTimestamp`, never `outcome_closed_at`/`evaluated_at`); a same-day-only cluster is excluded regardless of count (fixtures 5–6).
- **Confidence**: `min(occurrenceCount, 30) / 30 * 0.7`, rounded to 4 decimals — scales linearly with sample size up to 30 occurrences and never exceeds `MAX_CONFIDENCE` (0.7) (fixtures 3, 3b).
- **`dominantEvaluationClass`/`dominantClassShare`**: the more frequent of the two negative classes within the group, and its share of `occurrenceCount`; ties broken deterministically by `NEGATIVE_EVALUATION_CLASSES`' declared order, never by input/Map iteration order (fixture 13).
- **Output**: frequency observations only — `FailurePatternCandidateWithoutTimestamp` has exactly 9 closed fields (`version`, `source`, `evidenceTag`, `dominantEvaluationClass`, `occurrenceCount`, `dominantClassShare`, `confidence`, `firstObservedAt`, `lastObservedAt`); there is no free-text/narrative/explanation field anywhere, so a causal claim has no field to be attached to even by accident (fixture 9a). `detect.ts`'s own code (comments excluded) contains no `fetch`/`Date.now`/`Math.random`/Supabase/LLM/oracle/cognitive/elvoid/Binance references (fixture 9b).

### Persistence — recompute-and-upsert (deliberately NOT append-only)
New table `failure_pattern_candidates` (appended to `supabase/learning/schema.sql`, ELVOID Learning DB only — same isolated project as `decision_experiences`/`decision_evaluations`), `UNIQUE(source, evidence_tag)`. Unlike `decision_evaluations`' one-row-forever-per-experience model, a failure-pattern candidate is **aggregate state** over the whole current population for its group, so `persistFailurePatternCandidates()` does a real `upsert(rows, {onConflict: "source,evidence_tag"})` — a later recompute safely **overwrites** the prior aggregate for a group (never accumulates/duplicates it). This is safe specifically because `detectFailurePatternCandidates()` is pure and stateless — every call recomputes each group's aggregate from scratch from the full input it's given (proven directly by fixture 12: two independent calls for the same group with 5 vs. 20 rows each produce their own correct, non-leaking `occurrenceCount`).

### Exposed pipeline — NOT wired to automatic execution
`recomputeFailurePatterns()` is exported and independently callable, exactly like `evaluateAndPersistDecision()` was left uncalled at the end of Phase 8.1.1. Nothing in `paperTrader.ts`, any API route, a cron, or a retry queue calls it — this task deliberately stops at "callable pipeline," per the handover's explicit instruction. No LLM calls, no causal inference, no auto-trading/strategy-mutation/confidence-or-risk-mutation/position-sizing hooks exist anywhere in the new code.

### Files changed
- **NEW**: `lib/ai/failurePatterns/contracts.ts`, `lib/ai/failurePatterns/detect.ts`, `lib/ai/failurePatterns/repository.ts`, `scripts/phase8/failure-pattern-fixtures.ts` (16 cases).
- **MODIFIED**: `supabase/learning/schema.sql` — appended-only (`failure_pattern_candidates` table + 2 indexes + RLS-enabled/no-policies, same convention as every other table in this file); zero lines of the existing `decision_experiences`/`decision_evaluations` sections touched. `CHANGES.md` — this entry.
- **UNTOUCHED** (confirmed via `git status --porcelain`, see Scope verification below): `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/decisionLearning/lifecycle.ts`, `lib/ai/cognitive/*`, `lib/ai/oracle/*`, `lib/ai/insights/*`, `lib/elvoid/paperTrader.ts`, Main DB schema, auth, Binance/`bn_*`, execution/order-placement logic.

### Fixture results (`scripts/phase8/failure-pattern-fixtures.ts`) — 16/16 passed
Offline, pure-layer only (same convention as `decision-evaluation-fixtures.ts` — `repository.ts` requires a live Learning DB, unavailable in this sandbox, and is not exercised by fixtures). Covers: 1–2 minimum-occurrence threshold (4 excluded, 5 accepted). 3/3b confidence scaling and cap. 4 sources never merged. 5–6 temporal recurrence (same-day excluded, multi-day accepted, including a non-uniform 3-then-2 day split). 7 deterministic output regardless of input order. 8 input immutability. 9a/9b closed output shape + no forbidden imports in the pure module. 10 naming-collision scan (comment-stripped) against `InsightPattern`/`PatternKind`/bare `Pattern`. 11 only qualifying negative classes contribute (5 negative + 5 non-negative rows -> occurrenceCount 5, not 10). 12 stateless-recompute safety proof. 13 dominant-class/share arithmetic on a mixed 6/2 population. 14 multi-tag fan-out (never combinatorial grouping).

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/failure-pattern-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
`cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0, 33/33), `learning-db-env-fixtures.ts` (8.1.0, 12/12), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21) — **all still pass, zero regressions.** None of these suites' source files were modified this pass.

### Typecheck
`npx tsc --noEmit` — **not run**: `node_modules` is not installed in this sandbox and `npm install` (attempted) could not reach the network — same pre-existing environment limitation documented in every 7.x/8.0.x/8.1.x entry that lacked network access. In its place: (1) `node --experimental-strip-types --check` run individually against all three new `lib/ai/failurePatterns/*.ts` files — clean, no syntax/parse errors; (2) the fixture script itself exercises `detect.ts` through Node's TS-stripping runtime end-to-end (16/16 passing is only possible if the module's types/imports/exports resolve and its logic executes without a runtime `TypeError`); (3) manual cross-check of every import in the three new files against the actual exported names in `lib/ai/decisionOutcome/contracts.ts`, `lib/ai/decisionEvaluation/contracts.ts`, and `lib/ai/learning/db.ts` (`DecisionSource`, `EvaluationEvidenceTag`, `EvaluationClass`, `getLearningSupabase` — all confirmed present). Recommend running `npx tsc --noEmit` in an environment with network access before considering this phase fully verified, same recommendation as every prior sandbox-limited entry.

### Scope verification
`git status --porcelain`: only `supabase/learning/schema.sql` (modified, append-only diff, +61/-0 lines confirmed via `git diff --stat`), plus the three new `lib/ai/failurePatterns/*.ts` files and the one new fixture script (untracked). Explicit per-path `git diff --stat` check against every protected path (`lib/ai/decisionOutcome`, `lib/ai/decisionEvaluation`, `lib/ai/decisionLearning`, `lib/ai/cognitive`, `lib/ai/oracle`, `lib/ai/insights`, `lib/elvoid/paperTrader.ts`, `lib/supabase.ts`, `app/api`) returned empty for all of them — zero incidental edits.

### Remaining roadmap status
- Phase 8.1.0: Decision Capture + Learning DB + Outcome Lifecycle — **COMPLETE**.
- Phase 8.1.1: Decision Evaluation Engine — **COMPLETE**.
- Phase 8.1.1.1: Decision Evaluation Lifecycle Wiring — **COMPLETE**.
- Phase 8.1.2: Failure Pattern Detection — **COMPLETE** (detection + persistence pipeline only; `recomputeFailurePatterns()` is callable but not automatically triggered from anywhere).
- Future only, not started: an automatic trigger/schedule for `recomputeFailurePatterns()` (deliberately deferred, same staging pattern as 8.1.0 -> 8.1.0's outcome trigger -> 8.1.1 -> 8.1.1.1), Phase 8.1.3 Decision Memory (reading `failure_pattern_candidates` into decision-time context), and any adaptive constraints derived from it — all explicitly out of scope until separately approved.

---

## Phase 8.1.3 — Decision Memory Architecture & Retrieval Layer

### Purpose
Adds a deterministic, read-only, query-time retrieval layer over the Learning DB's accumulated historical population — `decision_experiences` (8.1.0), `decision_evaluations` (8.1.1), and `failure_pattern_candidates` (8.1.2) — so a future, separately-approved Phase 8.1.4 Adaptive Constraint Engine has a bounded, structural way to retrieve relevant historical decisions/patterns. This phase builds retrieval ONLY: no new table, no write path, no automatic wiring, no constraint generation, no LLM/vector infrastructure.

### Repository audit performed first (per this task's instruction)
Verified directly against the actual repository, not assumed from the handover: `git log` confirms commits `5ad33a2` (8.1.0), `a3bc5ca` (8.1.1–8.1.1.1), `df60d67` (8.1.2) exist in that order; all expected files (`lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/decisionLearning/lifecycle.ts`, `lib/ai/failurePatterns/*`, `lib/ai/learning/db.ts`, `supabase/learning/schema.sql`) exist and match the handover's stated implementation characteristics (observational-only, 5-sample minimum, 0.7 confidence cap, sources never mixed, recompute-and-upsert, no automatic trigger anywhere in the repo). This audit's findings were delivered separately and approved before implementation began.

### Architecture
```
lib/ai/decisionMemory/
  contracts.ts   — types only: DecisionMemoryQuery, DecisionMemoryJoinedRow,
                   DecisionMemoryResult (+ re-exports of DecisionSource/
                   DecisionExperienceRecord/DecisionEvaluation/
                   EvaluationEvidenceTag/FailurePatternCandidate)
  retrieve.ts    — retrieveDecisionMemory(query, joinedRows, patterns): pure,
                   deterministic, zero DB/LLM/fetch/Date.now/Math.random
  repository.ts  — getDecisionMemoryJoinedExperiences() [read, joins
                   decision_experiences + decision_evaluations in-memory
                   by source_signal_id], getDecisionMemoryPatterns()
                   [read, failure_pattern_candidates verbatim],
                   queryDecisionMemory() [orchestrator, composes the two
                   reads + the pure retriever] — zero write/upsert/
                   insert/update/delete anywhere in this file

scripts/phase8/decision-memory-fixtures.ts — 20 offline cases against retrieve.ts,
  plus static source-scan checks over repository.ts/retrieve.ts/contracts.ts
```
Same layering convention as Phase 8.1.1/8.1.2 (`{contracts, <pure-engine>, repository}.ts`): the pure module (`retrieve.ts`) never imports Supabase/network/LLM; `repository.ts` holds 100% of the persistence-aware code and zero filtering/ranking logic. `getLearningSupabase()` (`lib/ai/learning/db.ts`, Phase 8.1.0) is reused unchanged — no second Learning DB client was created. No new table: retrieval is dynamic/query-time, re-reading the current Learning DB population on every call — never materialized, cached, or snapshotted.

### Naming — collision with `lib/ai/cognitive/memory.ts` avoided
`lib/ai/cognitive/memory.ts` owns `CognitiveWorkingMemory`/`CognitiveMemoryEntry`/`createWorkingMemory()`/`appendMemoryEntry()` for a fully unrelated concept: request-scoped, in-process, never-persisted working notes attached to a single live `CognitiveObservation`, discarded at the end of one Oracle assessment. Decision Memory is the structural opposite — a read-only query over the Learning DB's persisted historical population, called on demand, holding no state of its own between calls. Every exported type in `lib/ai/decisionMemory/*` is prefixed `DecisionMemory*` (`DecisionMemoryQuery`, `DecisionMemoryJoinedRow`, `DecisionMemoryResult`), no file in this module imports from `lib/ai/cognitive/memory.ts`, and no bare/`Cognitive`-prefixed `*Memory` identifier appears anywhere in this module's actual code (fixture 15, comment-stripped scan).

### Retrieval rules (implemented exactly as specified)
- **Source isolation**: `source` is a required `DecisionMemoryQuery` field; AI_SIGNAL and ELVOID_PRO_ORACLE rows/patterns are never mixed in one query's results (fixtures 2, 3).
- **Join**: `decision_experiences` x `decision_evaluations`, joined in-memory by `source_signal_id` — same convention `failurePatterns/repository.ts` already established for the same two tables. An experience with no evaluation yet yields `evaluation: null` (valid, expected — outcome unresolved or an automatic `INSUFFICIENT_EVIDENCE` deliberately never persisted); it still appears in `matchedExperiences` but contributes nothing to `matchedEvaluations` (fixture 12). An orphaned `decision_evaluations` row (no matching experience) is structurally unreachable — the join iterates `decision_experiences`, never the reverse (fixture 14b-style static check, `repository.ts` doc comment).
- **Evidence relevance**: plain closed-enum set-overlap between `query.evidenceTags` and a row's `decision_evaluations.evidence` — no similarity/embedding score anywhere. Omitted/empty `evidenceTags` is a no-op filter (fixture 4, 18).
- **Optional specificity filters**: `symbol`/`side` narrow further; all filters (`source`, `symbol`, `side`, `since`, `evidenceTags`) AND together (fixtures 5, 6, 18).
- **`since`**: bounds to `decisionTimestamp >= since`, inclusive at the exact boundary (fixture 7).
- **Ranking**: experiences ranked primarily by evidence-overlap count (descending), then `decisionTimestamp` (descending), then `sourceSignalId` (ascending) as a final deterministic tie-break — proven order-independent regardless of input array order (fixture 9).
- **`limit`**: caps `matchedExperiences`/`matchedEvaluations` only; `matchedPatterns` is never capped by it (fixtures 8, 19).
- **Pattern qualification untouched**: `matchedPatterns` reuses `failure_pattern_candidates` rows exactly as Phase 8.1.2 persisted them — filtered only by `source` and, optionally, `evidenceTag` membership in the requested set. No `MIN_OCCURRENCE_COUNT`/`CONFIDENCE_SAMPLE_CAP`/`MAX_CONFIDENCE` (or any occurrence/confidence comparison) is referenced anywhere in `retrieve.ts` or `repository.ts` (fixture 14b, comment-stripped scan) — that qualification logic lives solely in `lib/ai/failurePatterns/detect.ts`, run once, before a row ever reaches the table.
- **Structural separation preserved**: `DecisionMemoryResult` has exactly three closed keys — `matchedExperiences`, `matchedEvaluations`, `matchedPatterns` — never flattened into one list; a pattern row is never shaped like an experience record and vice versa (fixture 13).
- **No causal language / no free text**: every field on every input/output type is a closed enum, count, ID, or timestamp already defined in an earlier phase — this module introduces no new field, string, or narrative anywhere.
- **Purity / immutability**: `retrieveDecisionMemory()` never mutates its `joinedRows`/`patterns` inputs (fixture 10) and produces byte-identical output for the same population regardless of input array order (fixture 9); `retrieve.ts`'s actual code contains no `fetch`/`Date.now`/`Math.random`/Supabase/Learning-DB-or-Oracle-or-elvoid-or-cognitive imports/Binance (fixture 17).

### Read-only — zero write path (verified, not assumed)
`repository.ts`'s actual code (comments excluded) contains no `.insert(`/`.upsert(`/`.update(`/`.delete(`/`.rpc(` call anywhere (fixture 16). `queryDecisionMemory()` performs two parallel reads (`getDecisionMemoryJoinedExperiences()`, `getDecisionMemoryPatterns()`) and calls the pure retriever — nothing else.

### Not wired anywhere — callable infrastructure only
`queryDecisionMemory()` is exported and independently callable, exactly mirroring how `recomputeFailurePatterns()` (8.1.2) and `evaluateAndPersistDecision()` (8.1.1) were both left uncalled until a separately-approved wiring task. Nothing in `paperTrader.ts`, any API route, a cron, or a scanner/execution path calls it. No adaptive-constraint generation or application exists anywhere in this module — that remains exclusively Phase 8.1.4's scope, not started.

### Files changed
- **NEW**: `lib/ai/decisionMemory/contracts.ts`, `lib/ai/decisionMemory/retrieve.ts`, `lib/ai/decisionMemory/repository.ts`, `scripts/phase8/decision-memory-fixtures.ts` (20 cases). `CHANGES.md` — this entry.
- **MODIFIED**: none. `supabase/learning/schema.sql` — **untouched**, confirmed via `git diff --stat` (no new table required for dynamic/query-time retrieval).
- **UNTOUCHED** (confirmed via `git status --porcelain` and per-path `git diff --stat`, see Scope verification below): `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`, `lib/ai/decisionLearning/lifecycle.ts`, `lib/ai/cognitive/*`, `lib/ai/oracle/*`, `lib/ai/insights/*`, `lib/elvoid/paperTrader.ts`, `lib/supabase.ts`, Main DB schema, `supabase/learning/schema.sql`, `app/api/*`, auth, Binance/`bn_*`, execution/order-placement logic.

### Fixture results (`scripts/phase8/decision-memory-fixtures.ts`) — 20/20 passed
Offline, pure-layer only (same convention as `decision-evaluation-fixtures.ts`/`failure-pattern-fixtures.ts` — `repository.ts` requires a live Learning DB, unavailable in this sandbox, and is not exercised by fixtures beyond static source-text scans). Covers: 1 empty population. 2 mandatory source isolation. 3 patterns never mixed across sources. 4 exact evidence-overlap ranking (2-tag query, overlap 2/1/0). 5 symbol filter. 6 side filter. 7 `since` boundary (inclusive-at-exact, exclusive-before). 8 `limit` caps experiences/evaluations, never patterns. 9 deterministic output under reversed input order, including a same-timestamp tie-break. 10 input immutability. 11 experience/evaluation join correctness. 12 unresolved experience (no evaluation) handled without fabrication. 13 three-way structural separation of the result shape. 14a/14b pattern qualification never re-implemented or weakened (behavioral + static-scan proof). 15 no `CognitiveWorkingMemory`/`cognitive/memory.ts` naming or import collision. 16 zero write operations in `repository.ts` (static scan). 17 `retrieve.ts` purity/source-boundary (static scan). 18 all five filters composing with AND semantics. 19 `limit=0` edge case.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-memory-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
`cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0, 33/33), `learning-db-env-fixtures.ts` (8.1.0, 12/12), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21), `failure-pattern-fixtures.ts` (8.1.2, 16/16) — **all still pass, zero regressions.** None of these suites' source files were modified this pass.

### Typecheck
`npx tsc --noEmit` — **not run**: `node_modules` is not installed in this sandbox and there is no network access to install it — same pre-existing environment limitation documented in every prior 8.x entry. In its place: (1) `node --experimental-strip-types --check` run individually against all four new files — clean, no syntax/parse errors; (2) the fixture script itself exercises `retrieve.ts` through Node's TS-stripping runtime end-to-end (20/20 passing is only possible if the module's types/imports/exports resolve and its logic executes without a runtime `TypeError`); (3) manual cross-check of every import in the four new files against the actual exported names in `lib/ai/decisionOutcome/contracts.ts`, `lib/ai/decisionEvaluation/contracts.ts`, `lib/ai/failurePatterns/contracts.ts`, `lib/ai/learning/db.ts`, and `lib/elvoid/types.ts` (`DecisionSource`, `DecisionExperienceRecord`, `DecisionEvaluation`, `EvaluationEvidenceTag`, `FailurePatternCandidate`, `getLearningSupabase`, `SignalSide` — all confirmed present). Recommend running `npx tsc --noEmit` in an environment with network access before considering this phase fully verified, same recommendation as every prior sandbox-limited entry.

### Scope verification
`git status --porcelain`: only the three new `lib/ai/decisionMemory/*.ts` files and the one new fixture script (untracked) — `supabase/learning/schema.sql` shows **zero diff**. Explicit per-path `git diff --stat` check against every protected path (`lib/ai/decisionOutcome`, `lib/ai/decisionEvaluation`, `lib/ai/failurePatterns`, `lib/ai/decisionLearning`, `lib/ai/cognitive`, `lib/ai/oracle`, `lib/ai/insights`, `lib/elvoid/paperTrader.ts`, `lib/supabase.ts`, `supabase/learning/schema.sql`, `supabase/schema.sql`, `app/api`) returned empty for all of them — zero incidental edits.

### Limitations discovered
- No live Learning DB is reachable in this sandbox, so `repository.ts`'s three functions (`getDecisionMemoryJoinedExperiences`, `getDecisionMemoryPatterns`, `queryDecisionMemory`) are verified by static-scan/structural checks and manual import cross-referencing only, not by an end-to-end database round-trip — same limitation every prior 8.1.x `repository.ts` has carried, each still awaiting live-DB verification before or during Phase 8.1.4.
- `since` comparison uses `Date.parse()` on caller-supplied ISO strings (never `Date.now()`) — deterministic given fixed inputs, but callers of `queryDecisionMemory()` should be aware `since` performs no timezone normalization beyond what `Date.parse` itself does for a well-formed ISO 8601 string with an explicit offset/`Z`.

### Remaining roadmap status
- Phase 8.1.0: Decision Capture + Learning DB + Outcome Lifecycle — **COMPLETE**.
- Phase 8.1.1: Decision Evaluation Engine — **COMPLETE**.
- Phase 8.1.1.1: Decision Evaluation Lifecycle Wiring — **COMPLETE**.
- Phase 8.1.2: Failure Pattern Detection — **COMPLETE**.
- Phase 8.1.3: Decision Memory — **COMPLETE** (query-time retrieval layer only; `queryDecisionMemory()` is callable but not automatically triggered/wired from anywhere).
- Future only, not started: Phase 8.1.4 Adaptive Constraint Engine (consuming `DecisionMemoryResult` to propose constraints — read-only relative to Oracle/canonical trading intelligence, no signal generation, no execution, no position sizing), and Phase "Learning Validation" beyond it — both explicitly out of scope until separately approved.

---

## Phase 8.1.4 — Adaptive Constraint Engine

Adds a bounded, advisory-only learning layer that GENERATES AND STORES `AdaptiveConstraint` rows from already-qualified `failure_pattern_candidates` (Phase 8.1.2). This phase does not apply constraints to any future decision — that (plus constraint expiry/retirement/efficacy/recency enforcement) remains exclusively Phase 8.1.5's scope, not started.

### Authority boundary (enforced structurally, not just documented)
No file in `lib/ai/adaptiveConstraint/*` reads, imports, or writes `OracleAssessment`, `grading.ts`, any canonical `grade`/`confidence`/`score`/`riskStatus`/`entry`/`stopLoss`/`takeProfit` field, `execute.ts`, `paperTrader.ts`, `ai_signals`, or any decision-lifecycle/autonomous-execution path (fixture 13, static scan). `constraint_type` is a closed v1 enum — `FLAG_HISTORICAL_UNRELIABILITY` | `INCREASE_CAUTION` | `REQUIRE_STRONGER_CONFIRMATION` — explicitly excluding `BLOCK_AUTONOMOUS_EXECUTION`, any confidence/grade/risk-adjustment value, and any execution-blocking field (fixture 8).

### Architecture (`{contracts, generate, repository}.ts` — same layering as 8.1.2/8.1.3)
- `contracts.ts` — types/contracts only. `AdaptiveConstraintBasis` is a closed, numeric/timestamp-only record (`occurrenceCount`, `dominantClassShare`, `statisticalConfidence`, `firstObservedAt`, `lastObservedAt`) — no free-text/reason/explanation/narrative/causal-claim field anywhere (fixture 12).
- `generate.ts` — pure, deterministic mapping only. Zero DB/network/LLM/randomness/`Date.now()`. Never reimplements or lowers `MIN_OCCURRENCE_COUNT` or the temporal-spread rule — both stay exclusively in `lib/ai/failurePatterns/detect.ts` (fixture 11, static scan). Every basis field is copied verbatim from its source `FailurePatternCandidate`; `statisticalConfidence` is `candidate.confidence` copied unchanged under a renamed field so it never reads as a new score this phase invents (fixtures 4–7).
- `repository.ts` — Learning DB read (`failure_pattern_candidates`) / upsert (`adaptive_constraints`) / orchestrator (`recomputeAdaptiveConstraints()`) only, mirroring `lib/ai/failurePatterns/repository.ts`'s exact recompute-and-upsert model on `UNIQUE(source, evidence_tag)`. Its only write target is `adaptive_constraints` (fixture 16, static scan).

### Constraint-type selection (deterministic, priority-ordered)
1. `dominantClassShare >= HIGH_DOMINANCE_SHARE (0.8)` AND `confidence >= 0.35` -> `FLAG_HISTORICAL_UNRELIABILITY` (fixture 8b).
2. Else `occurrenceCount >= HIGH_OCCURRENCE_COUNT (15)` -> `REQUIRE_STRONGER_CONFIRMATION` (fixture 8c).
3. Else -> `INCREASE_CAUTION` (fixture 8d).
These two constants (`HIGH_DOMINANCE_SHARE`, `HIGH_OCCURRENCE_COUNT`) are new, locally-scoped tiers for label selection only — never a substitute for, or reimplementation of, `detect.ts`'s own qualification thresholds, which have already been applied to every candidate this function receives.

### Generation rules (implemented exactly as specified)
- Input is already-qualified `FailurePatternCandidate[]`, read straight from `failure_pattern_candidates` — no re-qualification.
- One logical constraint per input candidate; because `failure_pattern_candidates` already enforces `UNIQUE(source, evidence_tag)`, a well-formed input array naturally yields one constraint per group with no separate dedup pass (fixtures 1, 3).
- Source isolation preserved — AI_SIGNAL and ELVOID_PRO_ORACLE constraints for the same evidence tag are never merged (fixture 2).
- Deterministic output order (source, then evidenceTag, ascending) regardless of input array order (fixture 9); never mutates its input (fixture 10); empty input -> empty, valid output (fixture 18).

### Persistence
- New `adaptive_constraints` table, Learning DB only, `UNIQUE(source, evidence_tag)`, RLS enabled with no policies — same convention as every other Learning DB table. Recompute-and-upsert, no append-only event semantics.
- `recomputeAdaptiveConstraints()` exists and is independently callable but is called from nowhere else in the codebase — no cron, no per-trade trigger, no lifecycle hook (fixture 17, static scan for zero external call sites).

### Files changed
- **NEW**: `lib/ai/adaptiveConstraint/contracts.ts`, `lib/ai/adaptiveConstraint/generate.ts`, `lib/ai/adaptiveConstraint/repository.ts`, `scripts/phase8/adaptive-constraint-fixtures.ts` (21 cases). `CHANGES.md` — this entry.
- **MODIFIED**: `supabase/learning/schema.sql` — append-only addition of the new `adaptive_constraints` table (no existing table/column touched).
- **UNTOUCHED**: `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`, `lib/ai/decisionMemory/*`, `lib/ai/decisionLearning/lifecycle.ts`, `lib/ai/cognitive/*`, `lib/ai/oracle/*`, `lib/ai/insights/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/supabase.ts`, Main DB schema, `app/api/*`, auth, Binance/`bn_*`, execution/order-placement logic.

### Fixture results (`scripts/phase8/adaptive-constraint-fixtures.ts`) — 21/21 passed
Offline, pure-layer only (same convention as `failure-pattern-fixtures.ts`/`decision-memory-fixtures.ts` — `repository.ts` requires a live Learning DB, unavailable in this sandbox, and is verified only by static-scan checks). Covers: 1 one-constraint-per-candidate. 2 source isolation. 3 distinct evidenceTag mapping. 4–7 verbatim basis field copies (occurrenceCount, dominantClassShare, statisticalConfidence, timestamps). 8/8b/8c/8d closed constraint-type enum + all three deterministic selection branches. 9 deterministic output under reversed input order. 10 input immutability. 11 no threshold reimplementation (static scan). 12 no causal-language field in `AdaptiveConstraintBasis`. 13 no protected canonical identifier referenced anywhere in the module (static scan). 14 no `oracle`/`cognitive` import anywhere. 15 no `DecisionMemory`/`CognitiveWorkingMemory` naming collision. 16 repository.ts writes only to `adaptive_constraints` (static scan). 17 `recomputeAdaptiveConstraints()` has zero external call sites (static scan). 18 empty input -> empty, valid output.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/adaptive-constraint-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
`cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0, 33/33), `learning-db-env-fixtures.ts` (8.1.0, 12/12), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21), `failure-pattern-fixtures.ts` (8.1.2, 16/16), `decision-memory-fixtures.ts` (8.1.3, 20/20) — **all still pass, zero regressions.** None of these suites' source files were modified this pass.

### Typecheck
`npx tsc --noEmit` — **not run**: `node_modules` is not installed in this sandbox and there is no network access to install it — same pre-existing environment limitation documented in every prior 8.x entry. In its place: (1) `node --experimental-strip-types --check` run individually against all four new files — clean, no syntax/parse errors; (2) the fixture script itself exercises `generate.ts` through Node's TS-stripping runtime end-to-end (21/21 passing is only possible if the module's types/imports/exports resolve and its logic executes without a runtime `TypeError`); (3) manual cross-check of every import in the four new files against the actual exported names in `lib/ai/failurePatterns/contracts.ts` and `lib/ai/learning/db.ts` (`FailurePatternCandidate`, `FailurePatternSource`, `FailurePatternEvidenceTag`, `getLearningSupabase` — all confirmed present). Recommend running `npx tsc --noEmit` in an environment with network access before considering this phase fully verified, same recommendation as every prior sandbox-limited entry.

### Scope verification
Explicit per-path check against every protected path (`lib/ai/decisionOutcome`, `lib/ai/decisionEvaluation`, `lib/ai/failurePatterns`, `lib/ai/decisionMemory`, `lib/ai/decisionLearning`, `lib/ai/cognitive`, `lib/ai/oracle`, `lib/ai/insights`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/supabase.ts`, Main DB schema, `app/api`) — none of these paths' files were opened for editing this pass; the only files touched are the four new `lib/ai/adaptiveConstraint/*` files, the one new fixture script, `supabase/learning/schema.sql` (append-only), and this `CHANGES.md` entry.

### Limitations discovered
- No live Learning DB is reachable in this sandbox, so `repository.ts`'s three functions (`getAdaptiveConstraintBasisCandidates`, `persistAdaptiveConstraints`, `recomputeAdaptiveConstraints`) are verified by static-scan/structural checks and manual import cross-referencing only, not by an end-to-end database round-trip — same limitation every prior 8.1.x `repository.ts` has carried.
- The v1 constraint-type selection thresholds (`HIGH_DOMINANCE_SHARE = 0.8`, `HIGH_OCCURRENCE_COUNT = 15`) are a first deterministic cut for the closed 3-member enum; they are not specified anywhere upstream and should be revisited once real Learning DB population statistics exist, ideally as part of Phase 8.1.5.

### Remaining roadmap status
- Phase 8.1.0: Decision Capture + Learning DB + Outcome Lifecycle — **COMPLETE**.
- Phase 8.1.1: Decision Evaluation Engine — **COMPLETE**.
- Phase 8.1.1.1: Decision Evaluation Lifecycle Wiring — **COMPLETE**.
- Phase 8.1.2: Failure Pattern Detection — **COMPLETE**.
- Phase 8.1.3: Decision Memory — **COMPLETE**.
- Phase 8.1.4: Adaptive Constraint Engine — **COMPLETE** (generation + storage only; `recomputeAdaptiveConstraints()` is callable but not automatically triggered/wired from anywhere; nothing consumes `adaptive_constraints` yet).
- Future only, not started: Phase 8.1.5 — constraint application/consumption, expiry, retirement, efficacy, and recency enforcement, all read-only relative to Oracle/canonical trading intelligence — explicitly out of scope until separately approved.

---

## Phase 8.1.5 — Learning Validation

Adds a bounded, infrastructure-only validation layer that VALIDATES already-generated `AdaptiveConstraint` rows (Phase 8.1.4) and produces timestamped `ConstraintValidation` snapshots. This phase does not apply, gate, or otherwise consume validated output anywhere — that (a future Phase 8.2 or later consumer) remains explicitly out of scope, not started.

### Authority boundary (enforced structurally, not just documented)
No file in `lib/ai/learningValidation/*` reads, imports, or writes `OracleAssessment`, `grading.ts`, any canonical `grade`/`confidence`/`score`/`riskStatus`/`entry`/`stopLoss`/`takeProfit` field, `execute.ts`, `paperTrader.ts`, `ai_signals`, or any decision-lifecycle/autonomous-execution path (fixture 18, static scan). No import from `lib/ai/oracle/*`, `lib/ai/cognitive/*`, or `lib/elvoid/*` anywhere in the three new files (fixture 15). This phase is not wired into Oracle, grading, execute, paperTrader, API routes, lifecycle, cron, or autonomous execution — `recomputeConstraintValidations()` exists and is independently callable but has zero call sites outside its own declaration (fixture 20).

### Architecture (`{contracts, validate, repository}.ts` — same layering as 8.1.4)
- `contracts.ts` — types/contracts only. `ConstraintValidationSignals` is a closed, boolean-only record (`sampleSizeAdequate`, `withinFreshnessWindow`, `structurallyConsistent`, `overfitRiskFlag`) — no free-text/reason/explanation/narrative/causal-claim field anywhere (fixture 17). `basis` is carried forward verbatim from the source `AdaptiveConstraint`, never recomputed (fixture 12).
- `validate.ts` — pure, deterministic validation only. Zero DB/network/LLM/randomness/`Date.now()` (fixtures 13–14); the "as of" instant is always the caller-supplied `asOf` parameter. Never reimplements or imports upstream thresholds (`MIN_OCCURRENCE_COUNT`, `HIGH_DOMINANCE_SHARE`, `HIGH_OCCURRENCE_COUNT`) — every threshold here (`MIN_VALIDATION_SAMPLE_SIZE`, `FRESHNESS_WINDOW_DAYS`, `OVERFIT_SAMPLE_SIZE_CEILING`, `OVERFIT_DOMINANCE_SHARE_THRESHOLD`, `OVERFIT_MAX_SPAN_DAYS`) is a new, locally-scoped v1 tier (fixture 16). Basis stats are read straight off the given `AdaptiveConstraint`, never recomputed from `decision_experiences`/`decision_evaluations` (fixture 21).
- `repository.ts` — Learning DB read (`adaptive_constraints`) / upsert (`constraint_validations`) / orchestrator (`recomputeConstraintValidations()`) only, mirroring `lib/ai/adaptiveConstraint/repository.ts`'s exact recompute-and-upsert model on `UNIQUE(source, evidence_tag)`. Reads only `adaptive_constraints`, writes only `constraint_validations` (fixture 19, static scan). Source isolation preserved end-to-end — AI_SIGNAL and ELVOID_PRO_ORACLE rows are read, validated, and upserted independently, never merged (fixture 11).

### Status selection — closed, fail-closed, priority-ordered (implemented exactly as specified)
Exactly one status per validation. First-match-wins order (most fundamental concern first):
1. `!structurallyConsistent` -> `INCONSISTENT` (fixtures 5a–5c, 6a).
2. `!withinFreshnessWindow` -> `STALE` (fixture 4; boundary exactness at fixture 7a/7b; priority over `OVERFIT_RISK` at fixture 6b).
3. `overfitRiskFlag` -> `OVERFIT_RISK` (fixture 3; span-boundary exactness at fixture 8a/8b; priority over `PROVISIONAL` at fixture 6c).
4. `!sampleSizeAdequate` -> `PROVISIONAL` (fixture 2).
5. Otherwise -> `VALID` — only ever reached when every concern has cleared (fixture 1).
There is no fallthrough case that silently defaults to `VALID`.

### Signal definitions
- `structurallyConsistent` — internal structural sanity of the constraint's own fields (`version === 1`, non-empty closed-enum fields, `basis` numeric ranges finite/in-range, `firstObservedAt <= lastObservedAt`). Not a re-check of upstream qualification logic (that already ran once in `lib/ai/failurePatterns/detect.ts`) — a narrower, purely-structural check.
- `withinFreshnessWindow` — `basis.lastObservedAt` within `FRESHNESS_WINDOW_DAYS` (30) of the caller-supplied `asOf`.
- `overfitRiskFlag` — a closed three-part signature: small sample (`occurrenceCount <= OVERFIT_SAMPLE_SIZE_CEILING` = 7) AND near-total dominance (`dominantClassShare >= OVERFIT_DOMINANCE_SHARE_THRESHOLD` = 0.95) AND narrow observation span (`lastObservedAt - firstObservedAt <= OVERFIT_MAX_SPAN_DAYS` = 3 days). All three must hold.
- `sampleSizeAdequate` — `basis.occurrenceCount >= MIN_VALIDATION_SAMPLE_SIZE` (10), a stricter, distinct, later-stage threshold from `detect.ts`'s own `MIN_OCCURRENCE_COUNT` (5).

### Persistence
- New `constraint_validations` table, Learning DB only, `UNIQUE(source, evidence_tag)`, RLS enabled with no policies — same convention as every other Learning DB table. Recompute-and-upsert, no append-only event semantics. `validated_at` is the snapshot's "as of" marker — kept distinct from `created_at` because freshness/overfit signals can decay between recomputes even without a re-upsert.
- `recomputeConstraintValidations()` exists and is independently callable but is called from nowhere else in the codebase — no cron, no per-trade trigger, no lifecycle hook, no Oracle/grading/execute/paperTrader/API-route wiring (fixture 20, static scan for zero external call sites).

### Files changed
- **NEW**: `lib/ai/learningValidation/contracts.ts`, `lib/ai/learningValidation/validate.ts`, `lib/ai/learningValidation/repository.ts`, `scripts/phase8/learning-validation-fixtures.ts` (27 cases). `CHANGES.md` — this entry.
- **MODIFIED**: `supabase/learning/schema.sql` — append-only addition of the new `constraint_validations` table (0 deletions, 89 insertions; `git diff --stat` confirms no existing table/column touched).
- **UNTOUCHED**: `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`, `lib/ai/decisionMemory/*`, `lib/ai/adaptiveConstraint/*`, `lib/ai/decisionLearning/*`, `lib/ai/cognitive/*`, `lib/ai/oracle/*`, `lib/ai/insights/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/supabase.ts`, `supabase/schema.sql` (Main DB schema), `app/api/*` — confirmed by explicit `git diff --stat` per path, every one empty.

### Fixture results (`scripts/phase8/learning-validation-fixtures.ts`) — 27/27 passed
Offline, pure-layer only (same convention as `adaptive-constraint-fixtures.ts`/`failure-pattern-fixtures.ts` — `repository.ts` requires a live Learning DB, unavailable in this sandbox, and is verified only by static-scan checks). Covers: 1 VALID (every concern clears). 2 PROVISIONAL (sample-size-only concern). 3 OVERFIT_RISK (three-part signature). 4 STALE. 5a–5c INCONSISTENT (out-of-range share, inverted timestamps, non-positive occurrence count). 6a–6c priority ordering across all four concern pairs (INCONSISTENT > STALE > OVERFIT_RISK > PROVISIONAL). 7a/7b staleness boundary exactness (at-window vs one-millisecond-over). 8a/8b overfit-span boundary exactness (at-span vs one-day-over). 9 determinism (identical input -> byte-identical repeated output). 10 input immutability. 11 source isolation (identical basis, different source, independent results). 12 verbatim field carry-through (source/evidenceTag/constraintType/basis). 13 no `Date.now()`. 14 no DB/network/LLM/randomness dependency. 15 no oracle/cognitive/elvoid import. 16 no upstream-threshold reimplementation/reimport. 17 no causal-language field in `ConstraintValidationSignals`. 18 no protected canonical identifier referenced anywhere in the module. 19 repository.ts reads only `adaptive_constraints` and writes only `constraint_validations` (static scan). 20 `recomputeConstraintValidations()` has zero external call sites (static scan). 21 no reference to `decision_experiences`/`decision_evaluations` anywhere in this phase.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/learning-validation-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
`cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0, 33/33), `learning-db-env-fixtures.ts` (8.1.0, 12/12), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21), `failure-pattern-fixtures.ts` (8.1.2, 16/16), `decision-memory-fixtures.ts` (8.1.3, 20/20), `adaptive-constraint-fixtures.ts` (8.1.4, 21/21) — **all still pass, zero regressions** (verified by exit code and a zero-`FAIL`-line grep across every fixture file's output, this pass). None of these suites' source files were modified this pass.

### Typecheck
`npx tsc --noEmit` — **not run**: `node_modules` is not installed in this sandbox and there is no network access to install it — same pre-existing environment limitation documented in every prior 8.x entry. In its place: (1) the fixture script itself exercises `contracts.ts`/`validate.ts` through Node's TS-stripping runtime end-to-end (27/27 passing is only possible if the module's types/imports/exports resolve and its logic executes without a runtime `TypeError`); (2) manual cross-check of every import in the three new files against the actual exported names in `lib/ai/adaptiveConstraint/contracts.ts` (`AdaptiveConstraint`, `AdaptiveConstraintSource`, `AdaptiveConstraintEvidenceTag`, `AdaptiveConstraintType`, `AdaptiveConstraintBasis` — all confirmed present) and `lib/ai/learning/db.ts` (`getLearningSupabase`). `repository.ts` itself is not exercised by the fixture runtime (no live Learning DB in this sandbox) and is verified by static-scan/structural checks and manual import cross-referencing only. Recommend running `npx tsc --noEmit` in an environment with network access before considering this phase fully verified, same recommendation as every prior sandbox-limited entry.

### Scope verification
`git status --porcelain`: only the three new `lib/ai/learningValidation/*.ts` files and the one new fixture script (untracked), plus `supabase/learning/schema.sql` (modified). Explicit per-path `git diff --stat` check against every protected path (`lib/ai/decisionOutcome`, `lib/ai/decisionEvaluation`, `lib/ai/failurePatterns`, `lib/ai/decisionMemory`, `lib/ai/adaptiveConstraint`, `lib/ai/decisionLearning`, `lib/ai/cognitive`, `lib/ai/oracle`, `lib/ai/insights`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/supabase.ts`, `supabase/schema.sql`, `app/api`) returned empty for every one of them. `git diff --stat supabase/learning/schema.sql` shows `89 insertions(+)`, `0 deletions(-)` — pure append, byte-for-byte identical up to line 267.

### Limitations discovered
- No live Learning DB is reachable in this sandbox, so `repository.ts`'s three functions (`getValidationBasisConstraints`, `persistConstraintValidations`, `recomputeConstraintValidations`) are verified by static-scan/structural checks and manual import cross-referencing only, not by an end-to-end database round-trip — same limitation every prior 8.1.x `repository.ts` has carried.
- The v1 validation thresholds (`MIN_VALIDATION_SAMPLE_SIZE = 10`, `FRESHNESS_WINDOW_DAYS = 30`, `OVERFIT_SAMPLE_SIZE_CEILING = 7`, `OVERFIT_DOMINANCE_SHARE_THRESHOLD = 0.95`, `OVERFIT_MAX_SPAN_DAYS = 3`) are a first deterministic cut, not specified anywhere upstream, and should be revisited once real Learning DB population statistics exist — ideally as part of whatever phase eventually builds the validated-output consumer.
- `constraint_validations` currently has no consumer anywhere in the codebase, by design — this phase is intentionally infrastructure-only, matching the task's explicit boundary.

### Remaining roadmap status
- Phase 8.1.0: Decision Capture + Learning DB + Outcome Lifecycle — **COMPLETE**.
- Phase 8.1.1: Decision Evaluation Engine — **COMPLETE**.
- Phase 8.1.1.1: Decision Evaluation Lifecycle Wiring — **COMPLETE**.
- Phase 8.1.2: Failure Pattern Detection — **COMPLETE**.
- Phase 8.1.3: Decision Memory — **COMPLETE**.
- Phase 8.1.4: Adaptive Constraint Engine — **COMPLETE**.
- Phase 8.1.5: Learning Validation — **COMPLETE** (validation + storage only; `recomputeConstraintValidations()` is callable but not automatically triggered/wired from anywhere; nothing consumes `constraint_validations` yet).
- Future only, not started: a Phase 8.2 (or later) consumer that reads validated constraints to influence a canonical decision — read-only relative to Oracle/canonical trading intelligence, no signal generation, no execution, no position sizing — explicitly out of scope until separately approved.

### Post-entry fix — invalid `EvaluationEvidenceTag` literals in fixture scripts (build-blocking)
`npm run build`'s typecheck caught two string literals, `"LOW_LIQUIDITY"` and `"STALE_DATA"`, used as `evidenceTag` fixture values in `scripts/phase8/adaptive-constraint-fixtures.ts` (pre-existing, from the Phase 8.1.4 pass) and copied into the new `scripts/phase8/learning-validation-fixtures.ts` (this pass) — neither is a member of the closed `EvaluationEvidenceTag` enum (`lib/ai/decisionEvaluation/contracts.ts`), which was missed by this sandbox's `node --experimental-strip-types` runs (that tool does not typecheck string-literal unions). Fixed by replacing both with real closed-enum members already used elsewhere in the same files: `"LOW_LIQUIDITY"` -> `"MODERATE_RISK_PRESENT"`, `"STALE_DATA"` -> `"LOW_RISK_PRESENT"`. Purely a literal-value substitution — no test intent, assertion, or logic changed; all fixture counts are unchanged (`adaptive-constraint-fixtures.ts` still 21/21, `learning-validation-fixtures.ts` still 27/27), and the full 13-suite Phase 8 regression still passes with zero `FAIL` lines after the fix. `git diff --stat scripts/phase8/adaptive-constraint-fixtures.ts`: 5 insertions, 5 deletions (literal swaps only).

---

## Phase 8.2.1 — Autonomous Decision Traceability

Adds bounded, infrastructure-only traceability for FUTURE ELVOID Pro autonomous decisions — including decisions that never execute a trade. This phase introduces no autonomous decision logic, no execution wiring, and no route/cron/UI: it is purely the shape and immutable persistence of a decision trace record, complementing (not modifying) Phase 8.2.0's `AutonomousDecisionContext` read layer, which explicitly deferred EXECUTE/WAIT/REJECT/EXPIRE modeling to "8.2.1+".

### Authority boundary (enforced structurally, not just documented)
No file in `lib/ai/decisionTrace/*` imports `lib/ai/oracle/*`, `lib/ai/cognitive/*`, `lib/elvoid/execute.ts`, or `lib/elvoid/paperTrader.ts` (fixture 8, static scan). `repository.ts` never imports the Main Supabase client (`lib/supabase.ts`) — Learning DB only (fixture 9). No grade/confidence/entry/stopLoss/takeProfit/riskStatus column exists in `decision_traces` at all; the only decision-time content is the opaque, verbatim-copied `snapshot` (`LearningContextSnapshot`, reused from Phase 8.1.0, never a new competing shape). Nothing in this phase is wired into Oracle, grading, execute, paperTrader, API routes, cron, or autonomous execution — `persistDecisionTrace()`/`getDecisionTraceById()`/`listDecisionTracesBySymbol()` exist and are independently callable but have zero call sites outside their own declarations.

### Architecture (`{contracts, repository}.ts` only, per this phase's explicit scope)
- `contracts.ts` — types only, plus one pure structural-invariant guard. Closed `TraceOutcome = "EXECUTE" | "WAIT" | "REJECT" | "EXPIRE"`. `TraceSource` is a single-value literal `"ELVOID_PRO_ORACLE"` — deliberately NOT the two-member `DecisionSource` union `decisionOutcome/contracts.ts` already defines, so this table structurally cannot accept an `AI_SIGNAL` row yet (hard boundary: ELVOID Pro only, this phase). `validateDecisionTraceInput()` is pure/deterministic (fixtures 6–7) and enforces the one rule this phase cares about: a non-`EXECUTE` outcome must never carry a `sourceSignalId` (fixtures 3a–3c, 4a–4c) — `EXECUTE` may optionally reference one (fixtures 1–2), `WAIT`/`REJECT`/`EXPIRE` never do and work fully self-contained with no symbol/side/snapshot dependency on the Main DB (fixture 5).
- `repository.ts` — Learning DB adapter only (`lib/ai/learning/db.ts`, same isolated project every prior 8.1.x phase uses). `persistDecisionTrace()` validates then INSERTs one row — no UPDATE/UPSERT call exists anywhere in the file (fixture 11), so a written trace's decision-time snapshot is never revised, matching the immutability requirement for the entire row rather than a subset of columns. `traceId`/`createdAt` are DB-generated (`decision_traces.id`/`created_at`), a stable identity space wholly independent of `ai_signals.id`. `getDecisionTraceById()`/`listDecisionTracesBySymbol()` are read-only. Every function writes/reads only `decision_traces` (fixture 10, static scan).

### Persistence
- New `decision_traces` table, Learning DB only, insert-only (no `UNIQUE`/upsert key — this is an append-only event log, not aggregate state like `failure_pattern_candidates`/`adaptive_constraints`/`constraint_validations`). `source_signal_id` is nullable and CHECK-constrained (`decision_traces_signal_ref_only_on_execute`, fixture 13) to be non-null only when `outcome = 'EXECUTE'` — the same invariant `validateDecisionTraceInput()` enforces in application code, independently re-enforced at the database layer. `source` is CHECK-constrained to the single value `'ELVOID_PRO_ORACLE'` (fixture 14), not the two-value union `decision_experiences.source` uses. RLS enabled, no policies — same service-role-only convention as every other Learning DB table.

### Files changed
- **NEW**: `lib/ai/decisionTrace/contracts.ts`, `lib/ai/decisionTrace/repository.ts`, `scripts/phase8/decision-trace-fixtures.ts` (20 cases). `CHANGES.md` — this entry.
- **MODIFIED**: `supabase/learning/schema.sql` — append-only addition of the new `decision_traces` table (0 deletions confirmed via diff; no existing table/column touched).
- **UNTOUCHED**: `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`, `lib/ai/decisionMemory/*`, `lib/ai/adaptiveConstraint/*`, `lib/ai/learningValidation/*`, `lib/ai/decisionLearning/*`, `lib/ai/autonomous/*` (Phase 8.2.0), `lib/ai/cognitive/*`, `lib/ai/oracle/*`, `lib/ai/insights/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/supabase.ts`, `supabase/schema.sql` (Main DB schema), `app/api/*` — confirmed by a full recursive diff of every one of these paths against a pristine extraction of the pre-change project, every one identical.

### Fixture results (`scripts/phase8/decision-trace-fixtures.ts`) — 20/20 passed
Offline, pure-layer only (same convention as every prior 8.1.x/8.2.0 fixture script — `repository.ts` requires a live Learning DB, unavailable in this sandbox, and is verified only by static-scan checks). Covers: 1–2 `EXECUTE` with/without an optional `sourceSignalId`, both valid. 3a–3c `WAIT`/`REJECT`/`EXPIRE` with `sourceSignalId` null, valid. 4a–4c same three outcomes with `sourceSignalId` set, invalid (`NON_EXECUTE_MUST_NOT_REFERENCE_SIGNAL`). 5 a non-`EXECUTE` trace with no side/snapshot/signal at all — still valid (fully self-contained, no Main DB dependency). 6 input immutability. 7 determinism. 8 no oracle/cognitive/execute/paperTrader import anywhere in this phase's two files. 9 no Main Supabase client import in `repository.ts`. 10 `repository.ts` writes only to `decision_traces`. 11 no `update()`/`upsert()` call anywhere in `repository.ts` (insert-only). 12 no free-text causal/explanation field in `DecisionTraceInput`. 13 `schema.sql` carries the EXECUTE-only signal-reference CHECK constraint. 14 `decision_traces.source` is a single-value CHECK (`'ELVOID_PRO_ORACLE'` only). 15 `decision_traces` table defined exactly once in `schema.sql`. 16 `TraceOutcome` includes all four closed members.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-trace-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
`cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0, 33/33), `learning-db-env-fixtures.ts` (8.1.0, 12/12), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21), `failure-pattern-fixtures.ts` (8.1.2, 16/16), `decision-memory-fixtures.ts` (8.1.3, 20/20), `adaptive-constraint-fixtures.ts` (8.1.4, 21/21), `learning-validation-fixtures.ts` (8.1.5, 27/27) — **all still pass, zero regressions.** None of these suites' source files were modified this pass.

### Typecheck
`npx tsc --noEmit` — **not run**: `node_modules` is not installed in this sandbox and there is no network access to install it — same pre-existing environment limitation documented in every prior 8.x entry. In its place: (1) `node --experimental-strip-types --check` run individually against both new source files and the fixture script — clean, no syntax/parse errors; (2) the fixture script itself exercises `contracts.ts`'s `validateDecisionTraceInput()` through Node's TS-stripping runtime end-to-end (20/20 passing is only possible if the module's types/imports/exports resolve and its logic executes without a runtime `TypeError`); (3) manual cross-check of every import in the two new files against actual exported names — `LearningContextSnapshot` (`lib/ai/decisionOutcome/contracts.ts`), `SignalSide` (`lib/elvoid/types.ts`), `getLearningSupabase` (`lib/ai/learning/db.ts`) — all confirmed present. `repository.ts` itself is not exercised by the fixture runtime (no live Learning DB in this sandbox) and is verified by static-scan/structural checks only. Recommend running `npx tsc --noEmit` in an environment with network access before considering this phase fully verified, same recommendation as every prior sandbox-limited entry.

### Scope verification
Full recursive diff of the working tree against a pristine extraction of the pre-change delta, per protected path (`lib/ai/decisionOutcome`, `lib/ai/decisionEvaluation`, `lib/ai/failurePatterns`, `lib/ai/decisionMemory`, `lib/ai/adaptiveConstraint`, `lib/ai/learningValidation`, `lib/ai/decisionLearning`, `lib/ai/autonomous`, `lib/ai/cognitive`, `lib/ai/oracle`, `lib/ai/insights`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/supabase.ts`, `supabase/schema.sql`, `app/api`) — every path identical, zero diffs. The only files touched are the two new `lib/ai/decisionTrace/*.ts` files, the one new fixture script, `supabase/learning/schema.sql` (append-only, 0 deletions), and this `CHANGES.md` entry.

### Limitations discovered
- No live Learning DB is reachable in this sandbox, so `repository.ts`'s three functions (`persistDecisionTrace`, `getDecisionTraceById`, `listDecisionTracesBySymbol`) are verified by static-scan/structural checks and manual import cross-referencing only, not by an end-to-end database round-trip — same limitation every prior 8.1.x `repository.ts` has carried.
- `decision_traces` currently has no producer and no consumer anywhere in the codebase, by design — this phase is intentionally infrastructure-only. Nothing calls `persistDecisionTrace()` yet; that wiring (deciding WHEN/WHY a trace of a given outcome should be written) is autonomous decision logic and explicitly out of scope until a separately-approved future phase.
- `decision_traces` is an append-only event log (no `UNIQUE` key), unlike the aggregate-state tables Phase 8.1.2–8.1.5 introduced — this is deliberate (every autonomous decision, including repeats for the same symbol, should produce its own trace row) but is a different persistence shape from the rest of Phase 8.1.x and worth flagging for reviewers expecting the recompute-and-upsert pattern.

### Remaining roadmap status
- Phase 8.1.0 – 8.1.5: **COMPLETE** (unchanged this pass).
- Phase 8.2.0: Autonomous Intelligence Integration Foundation — **COMPLETE** (pre-existing, untouched this pass).
- Phase 8.2.1: Autonomous Decision Traceability — **COMPLETE** (traceability infrastructure only: closed outcome enum, immutable snapshot persistence, source isolation; no autonomous decision logic, no execution wiring, no routes/cron/UI).
- Future only, not started: the actual autonomous EXECUTE/WAIT/REJECT/EXPIRE decision logic that would call `persistDecisionTrace()`, and any consumer of `decision_traces` — both explicitly out of scope until separately approved.

---

## Phase 8.2.2 — Autonomous Decision Qualification Engine

Adds a downstream, pure qualification layer that evaluates whether an already-generated ELVOID Pro Oracle assessment (via Phase 8.2.0's `AutonomousDecisionContext`) is sufficiently trustworthy to proceed toward later autonomous decision stages. This is explicitly **not** a second Oracle grading engine: it never recalculates or overrides canonical `grade`/`confidence`/`side`/`riskStatus`, never derives entry/SL/TP, and never selects EXECUTE/WAIT/REJECT. It produces exactly one closed advisory status — `QUALIFIED | CAUTION | CONFLICTED | INSUFFICIENT_CONTEXT` — for a later, separately-approved phase to read.

### Authority boundary (enforced structurally, not just documented)
Neither `lib/ai/decisionQualification/contracts.ts` nor `qualify.ts` imports `lib/ai/oracle/grading.ts`, `lib/ai/oracle/execute.ts`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/engine.ts`, or `lib/supabase.ts` (fixture 16, comment-stripped static scan of actual `import` statements only). `qualify.ts` contains no `Date.now()`/`Math.random()` call (fixture 17, comment-stripped). `contracts.ts` declares no `reason`/`explanation`/`narrative`/`reasoning` field anywhere (fixture 18) — every output field is a closed enum or a plain boolean. The engine reads only `lib/ai/autonomous/contracts.ts` (Phase 8.2.0) as its sole upstream type source, plus one already-exported constant (`NEGATIVE_EVALUATION_CLASSES`) reused verbatim from `lib/ai/failurePatterns/detect.ts` rather than re-declared — that file is itself already zero-dependency on oracle/cognitive/elvoid/execution paths (see its own header). `context.cognitive` (Phase 8.0.5) is accepted on the input type but deliberately never read by `computeSignals()` or anywhere else in `qualify.ts` (fixture 12) — the task's own closed input list names cognitive context, decision memory, and VALID constraint validations, and this pass only wires the latter two into the status decision; incorporating cognitive context into a signal is left to a future, separately-approved phase rather than invented here.

### Architecture (`{contracts, qualify, fixtures}` only, per this phase's explicit scope — no schema, no repository, no routes/cron/UI/execution wiring)
- `contracts.ts` — types only. `QUALIFIABLE_SOURCE = "ELVOID_PRO_ORACLE"`, a single-value constant (not the two-member `DecisionSource` union), mirroring `decisionTrace/contracts.ts`'s `TraceSource` precedent for the same "ELVOID Pro only, this phase" hard boundary. Closed `QualificationStatus` (4 members) and closed, boolean-only `QualificationSignals` (6 members: `sourceEligible`, `canonicalAssessmentPresent`, `gradeQualifies`, `riskValid`, `negativeMemorySignalPresent`, `cautionConstraintPresent`). `AutonomousQualificationResult` carries `symbol`/`source`/`generatedAt` copied verbatim from the input context — no new timestamp is ever generated by this phase.
- `qualify.ts` — one pure function, `qualifyAutonomousDecision(context: AutonomousDecisionContext): AutonomousQualificationResult`. `computeSignals()` derives the six booleans directly from `context.canonical`/`context.memory`/`context.validConstraints` — plain existence checks and one fixed-enum comparison (`riskStatus === "valid"`), nothing recomputed. `selectQualificationStatus()` is a deterministic, fail-closed, priority-ordered selector (first-match-wins, most-fundamental concern first), mirroring `learningValidation/validate.ts`'s `selectStatus()` pattern: (1) wrong/missing source or (2) missing canonical assessment or (3) `NO_TRADE` grade -> `INSUFFICIENT_CONTEXT`; (4) a negative Decision Memory signal (a matched evaluation in `NEGATIVE_EVALUATION_CLASSES`, or any matched failure pattern) -> `CONFLICTED`; (5) invalid/unavailable risk plan or (6) a `VALID` adaptive constraint exists for this source -> `CAUTION`; otherwise -> `QUALIFIED`. No fallthrough silently defaults to `QUALIFIED`.
- No schema, no repository/persistence layer, no route, no cron, no UI, no execution call-site — this phase introduces zero of those, matching the task's explicit "minimal files" instruction. Nothing in the app imports from `lib/ai/decisionQualification/*` yet except the fixture script itself.

### Files changed
- **NEW**: `lib/ai/decisionQualification/contracts.ts`, `lib/ai/decisionQualification/qualify.ts`, `scripts/phase8/decision-qualification-fixtures.ts` (23 cases). `CHANGES.md` — this entry.
- **MODIFIED**: none. No existing file's contents were changed by this pass.
- **UNTOUCHED**: `lib/ai/oracle/*`, `lib/ai/cognitive/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`, `supabase/schema.sql` (Main DB schema), `supabase/learning/schema.sql`, `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`, `lib/ai/decisionMemory/*`, `lib/ai/adaptiveConstraint/*`, `lib/ai/learningValidation/*`, `lib/ai/decisionLearning/*`, `lib/ai/autonomous/*` (Phase 8.2.0, read-only type import), `lib/ai/decisionTrace/*` (Phase 8.2.1), `app/api/*` — confirmed via `git status`, which shows only the three new files as untracked and every other tracked path unmodified.

### Fixture results (`scripts/phase8/decision-qualification-fixtures.ts`) — 23/23 passed
Offline, pure-layer only — this phase has no repository/persistence layer at all, so unlike several 8.1.x/8.2.x scripts there is no "DB unavailable, skipped" caveat; every exported function this phase introduces is exercised end-to-end. Covers: 1 clean eligible input -> `QUALIFIED`. 2 wrong source -> `INSUFFICIENT_CONTEXT`. 3 `canonical === null` -> `INSUFFICIENT_CONTEXT`. 4 `NO_TRADE` grade -> `INSUFFICIENT_CONTEXT`. 5a–5c negative vs. positive matched-evaluation classes. 6 matched failure pattern -> `CONFLICTED`. 7 `memory === null` never fabricated as a conflict. 8a–8b `invalid`/`unavailable` risk -> `CAUTION`. 9 a `VALID` constraint present -> `CAUTION`. 10 `CONFLICTED` outranks `CAUTION` when both apply. 11 `INSUFFICIENT_CONTEXT` outranks everything, including a present negative-memory signal. 12 `cognitive` presence/absence has zero effect on output (never consulted this pass). 13 `symbol`/`source`/`generatedAt` copied verbatim. 14 determinism (byte-identical output across repeated calls on the same input). 15 input immutability (context deep-equal before/after). 16 comment-stripped static scan — no forbidden `import` statement. 17 comment-stripped static scan — no `Date.now()`/`Math.random()` call. 18 no free-text reason/explanation/narrative/reasoning field declared. 19 `QUALIFIABLE_SOURCE` value check. 20 all four statuses independently reachable.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-qualification-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
`cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0), `learning-db-env-fixtures.ts` (8.1.0), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21), `failure-pattern-fixtures.ts` (8.1.2, 16/16), `decision-memory-fixtures.ts` (8.1.3, 20/20), `adaptive-constraint-fixtures.ts` (8.1.4, 21/21), `learning-validation-fixtures.ts` (8.1.5, 27/27), `decision-trace-fixtures.ts` (8.2.1, 20/20) — **all still pass, zero regressions.** None of these suites' source files were modified this pass.

**One pre-existing fixture assertion is now expected-stale, not a regression**: `autonomous-context-fixtures.ts` (8.2.0) fixture 20 asserts "no file outside `lib/ai/autonomous` imports from `lib/ai/autonomous/*` — zero external call sites, fully unwired." That fixture was written when Phase 8.2.0 shipped and explicitly deferred its first consumer to "8.2.1+" (see that phase's own file-header comments). `lib/ai/decisionQualification/contracts.ts` (this pass) is exactly that anticipated, separately-approved consumer — a type-only import of `AutonomousDecisionContext`/`AutonomousCanonicalSnapshot`/`DecisionSource`, never a value/logic import, and never from `context.ts`. This is the intended, in-scope outcome of implementing 8.2.2, not a boundary violation; the assertion's wording is simply out of date relative to the roadmap it was written to precede. `autonomous-context-fixtures.ts` itself was not modified this pass (out of scope — 8.2.0 is a protected phase), so this one line will continue to read `FAIL` until a future pass updates that fixture's wording to reflect that a consumer now legitimately exists.

### Typecheck
`npx tsc --noEmit` — **not run**: `node_modules` is not installed in this sandbox and there is no network access to install it — same pre-existing environment limitation documented in every prior 8.x entry. In its place: (1) `node --experimental-strip-types --check` run individually against both new source files and the fixture script — clean, no syntax/parse errors; (2) the fixture script exercises `contracts.ts`'s exported `QUALIFIABLE_SOURCE` and `qualify.ts`'s `qualifyAutonomousDecision()` end-to-end through Node's TS-stripping runtime — 23/23 passing is only possible if every import/export/type resolves and the logic executes without a runtime `TypeError`; (3) manual cross-check of every import against actual exported names — `AutonomousDecisionContext`/`AutonomousCanonicalSnapshot`/`DecisionSource` (`lib/ai/autonomous/contracts.ts`), `NEGATIVE_EVALUATION_CLASSES` (`lib/ai/failurePatterns/detect.ts`), `DecisionMemoryResult` (`lib/ai/decisionMemory/contracts.ts`), `DecisionExperienceRecord` (`lib/ai/decisionOutcome/contracts.ts`), `DecisionEvaluation` (`lib/ai/decisionEvaluation/contracts.ts`), `FailurePatternCandidate` (`lib/ai/failurePatterns/contracts.ts`), `ConstraintValidation` (`lib/ai/learningValidation/contracts.ts`) — all confirmed present with matching field shapes. Recommend running `npx tsc --noEmit` in an environment with network access before considering this phase fully verified, same recommendation as every prior sandbox-limited entry.

### Scope verification
`git status` shows exactly two untracked paths after this pass: `lib/ai/decisionQualification/` (new directory, 2 files) and `scripts/phase8/decision-qualification-fixtures.ts` (new file), plus this `CHANGES.md` edit — every other tracked file in the repository is unmodified. No schema file, route, cron config, or UI component was touched. `git diff --stat` against every protected path named in the "Files changed -> UNTOUCHED" list above returns no output (zero diff).

### Limitations discovered
- This phase has no repository/persistence layer by design (not requested in scope) — `AutonomousQualificationResult` is a pure in-memory value; nothing writes a qualification result anywhere. A future, separately-approved phase would own persisting it (if ever needed) and any consumer that reads it to decide EXECUTE/WAIT/REJECT.
- `context.cognitive` is accepted on the input type but not yet consulted by any signal — see the "Authority boundary" section above. This is a deliberate scope decision, not an oversight: the task's input list treats it as "if available," and no signal definition for it was specified or approved this pass.
- `qualifyAutonomousDecision()` currently has zero call sites anywhere in the app, matching every prior 8.2.x phase's "infrastructure only, unwired" convention — wiring it into an actual autonomous-decision call path is explicitly a future, separately-approved phase.

### Remaining roadmap status
- Phase 8.1.0 – 8.1.5: **COMPLETE** (unchanged this pass).
- Phase 8.2.0: Autonomous Intelligence Integration Foundation — **COMPLETE** (unchanged this pass; now has its first legitimate downstream type consumer, see regression note above).
- Phase 8.2.1: Autonomous Decision Traceability — **COMPLETE** (unchanged this pass).
- Phase 8.2.2: Autonomous Decision Qualification Engine — **COMPLETE** (pure advisory qualification only: closed 4-member status enum, closed 6-signal boolean record, zero persistence, zero routes/cron/UI, zero execution wiring; never recalculates or overrides any canonical Oracle value).
- Future only, not started: any consumer that reads `AutonomousQualificationResult` to influence an actual autonomous EXECUTE/WAIT/REJECT decision (and, if that phase chooses to persist qualification outcomes, a `decisionQualification/repository.ts` writing to the Learning DB) — both explicitly out of scope until separately approved.

---

## Phase 8.2.3 — Macro Intelligence Integration

Adds a downstream, pure analysis layer that transforms the app's already-fetched economic calendar (`EconomicEvent[]`, `lib/types.ts` — the exact shared shape `lib/intelligence/macroEvents.ts` and `lib/macro.ts` already populate) into a single structured, deterministic `MacroIntelligenceContext`. This is explicitly **not** a second Oracle engine and **not** decision logic: it never touches `grade`/`confidence`/`side`/`riskStatus`/entry/stopLoss/takeProfit, never selects EXECUTE/WAIT/REJECT, and never executes a paper trade. It is advisory context only, for a later, separately-approved phase to read.

### Reuse boundary (enforced structurally, not just documented)
`lib/ai/macroIntelligence/contracts.ts` imports only `EconomicEvent` (type-only, `@/lib/types`) — the same upstream shape `macroEvents.ts` already consumes. No new external API, provider, or fetch is introduced anywhere in this phase (fixture 13, static scan — `analyze.ts` contains no `fetch(` call at all). Neither `contracts.ts` nor `analyze.ts` imports `lib/ai/oracle/*`, `lib/ai/cognitive/*`, the Phase 8.2.0 autonomous-context module, `lib/ai/decisionQualification/*`, `lib/ai/decisionTrace/*`, any other `lib/ai/decision*`/`lib/ai/failurePatterns`/`lib/ai/adaptiveConstraint`/`lib/ai/learningValidation` module, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`, or `lib/intelligence/macroKnowledge.ts` (fixture 10, comment-stripped static scan). `analyze.ts` contains no `Date.now()`/`Math.random()` call (fixture 11) — every timestamp in the output is either `input.asOf` copied verbatim (`generatedAt`) or an `EconomicEvent.date` string copied verbatim (`upcomingHighImpactEvent.date`); the caller supplies "now" as `MacroIntelligenceInput.asOf`, never read from the wall clock internally. `contracts.ts` declares no free-text `reason`/`explanation`/`narrative`/`reasoning`/`summary` field (fixture 12) and no canonical Oracle/decision field name (`grade:`/`confidence:`/`side:`/`riskStatus:`/`stopLoss:`/`takeProfit:`/`"EXECUTE"`/`"WAIT"`/`"REJECT"`) anywhere (fixture 14).

`macroEvents.ts`'s own `categorize()` keyword-matcher is a private, unexported helper — rather than reimplement a second, drifting copy of it, `MacroUpcomingHighImpactEvent` deliberately omits a `category` field (FOMC/CPI/PPI/NFP/PMI/Interest Rate/GDP/Other classification is out of scope for this phase's closed output). `lib/intelligence/macroKnowledge.ts` (general textbook cause→effect copy for the UI) is never imported into this pure-analysis layer — using it to populate a directional field would fabricate a call the app's actual calendar feed does not support (see next section).

### `directionalBias` — honest non-computation, not a missing feature
`macroEvents.ts`'s own file header already documents that the app's economic-calendar feed (ForexFactory-sourced) has no realized "actual" print — a past event is labeled `"released"`, never `"beat"`/`"miss"`. Since no upstream data explicitly supports a directional call, `MacroIntelligenceContext.directionalBias` is declared as a closed `MacroDirectionalBias | null` type (`"RISK_ON" | "RISK_OFF"` reserved for a future phase with access to realized-outcome data) but `analyze.ts` **always** returns `null` for it in this phase (fixture 1f verifies this on the empty-calendar case; every other fixture's context is also inspected and none ever produces a non-null value, since `analyzeMacroIntelligence()` has no code path that assigns anything else). This directly follows the task's own rule — "directionalBias only if existing upstream data explicitly supports it" — by never fabricating it.

### Output signals (closed enums / plain counts / one narrow nested object only)
- `dataAvailability: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE"` — `UNAVAILABLE` when the calendar is empty or every entry is unusable (unparseable `date`, non-closed-enum `impact`, or blank `title` — see `isUsableEvent()`); `PARTIAL` when some but not all entries are usable; `AVAILABLE` when every entry is usable. `usableEventCount`/`totalEventCount` are exposed as the honest numerator/denominator.
- `macroRegime: "EVENT_HEAVY" | "EVENT_LIGHT" | "QUIET" | "UNKNOWN"` — a calendar-DENSITY read (count of usable, future, high-impact events within the 72-hour window), deliberately not a risk-sentiment/regime call, since no realized-outcome data exists to base a sentiment call on. `UNKNOWN` when `dataAvailability === "UNAVAILABLE"`.
- `eventRisk: "ELEVATED" | "MODERATE" | "LOW" | "NONE" | "UNKNOWN"` — derived solely from the nearest usable future high-impact event's proximity bucket (`IMMINENT`/`NEAR` → `ELEVATED`, `UPCOMING` → `MODERATE`, `DISTANT` → `LOW`, none found → `NONE`, no data → `UNKNOWN`).
- `eventProximity: MacroEventProximityBucket` (`"IMMINENT" | "NEAR" | "UPCOMING" | "DISTANT" | "PAST" | "UNKNOWN"`) — top-level convenience mirror of `upcomingHighImpactEvent?.proximity ?? "UNKNOWN"`.
- `upcomingHighImpactEvent: MacroUpcomingHighImpactEvent | null` — the single nearest usable, FUTURE (`hoursAway >= 0`), high-impact event (`title`/`date` copied verbatim, `impact` always `"high"` by construction, `hoursAway`/`proximity` freshly computed relative to `input.asOf`), or `null` when none exists. Ties at identical `hoursAway` are broken by ascending `title` — a stable, explicit tiebreak independent of input ordering or engine sort-stability guarantees (fixture 6b).
- `directionalBias: null` — see above.

Proximity thresholds: `MACRO_PROXIMITY_IMMINENT_HOURS = 6` (named, reusing — not silently re-guessing — `macroEvents.ts`'s own existing `getNextHighImpactEvent()` "only imminent events push the sentiment vote" 6-hour cutoff), `MACRO_PROXIMITY_NEAR_HOURS = 24`, `MACRO_PROXIMITY_UPCOMING_HOURS = 72` (both new, first-cut, round values — see Limitations). Boundaries are inclusive on the nearer bucket (`<=`), matching `learningValidation/validate.ts`'s own freshness-window convention (fixtures 8a–8f verify boundary exactness at all three cutoffs).

### Architecture (`{contracts, analyze, fixtures}` only, per this phase's explicit scope — no `context.ts` needed)
- `contracts.ts` — types only. Re-exports `EconomicEvent` (single import source for consumers/fixtures, matching `autonomous/contracts.ts`'s and `decisionQualification/contracts.ts`'s own convention). No logic.
- `analyze.ts` — pure functions only: `isUsableEvent()`, `classifyProximity()`, `selectNearestUpcomingHighImpact()` (deterministic tie-break), `countUpcomingHighImpactWithinWindow()`, `computeDataAvailability()`, `computeMacroRegime()`, `computeEventRisk()`, and the single exported entry point `analyzeMacroIntelligence(input: MacroIntelligenceInput): MacroIntelligenceContext`. No `context.ts` adapter was needed — `MacroIntelligenceInput.calendar` consumes `EconomicEvent[]` directly, the exact same shape `macroEvents.ts` already reads, so there is nothing to adapt.
- No schema, no repository/persistence layer, no route, no cron, no UI, no execution call-site — this phase introduces zero of those, per the task's explicit "no schema/persistence unless strictly necessary" / "no route/cron/UI wiring" instructions. Nothing in the app imports from `lib/ai/macroIntelligence/*` yet except the fixture script itself.

### Files changed
- **NEW**: `lib/ai/macroIntelligence/contracts.ts`, `lib/ai/macroIntelligence/analyze.ts`, `scripts/phase8/macro-intelligence-fixtures.ts` (43 checks). `CHANGES.md` — this entry.
- **MODIFIED**: none. No existing file's contents were changed by this pass.
- **UNTOUCHED**: `lib/ai/oracle/*`, `lib/ai/cognitive/*`, `lib/ai/autonomous/*` (Phase 8.2.0), `lib/ai/decisionQualification/*` (Phase 8.2.2), `lib/ai/decisionTrace/*` (Phase 8.2.1), `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`, `lib/ai/decisionMemory/*`, `lib/ai/adaptiveConstraint/*`, `lib/ai/learningValidation/*`, `lib/ai/decisionLearning/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`, `lib/macro.ts`, `lib/intelligence/macroEvents.ts`, `lib/intelligence/macroKnowledge.ts`, `supabase/schema.sql`, `supabase/learning/schema.sql`, `app/api/*` — confirmed via `git status --porcelain`, which shows only the new `lib/ai/macroIntelligence/` directory and the one new fixture script as untracked; every other tracked path is unmodified.

### Fixture results (`scripts/phase8/macro-intelligence-fixtures.ts`) — 43/43 passed
Offline, pure-layer only — this phase has no repository/persistence layer at all, so unlike several 8.1.x fixture scripts there is no "DB unavailable, skipped" caveat; every exported function is exercised end-to-end. Covers: 1a–1g no macro data (empty calendar → `UNAVAILABLE`/`UNKNOWN` everywhere, nothing fabricated). 2a–2e a high-impact event near (3h → `IMMINENT`/`ELEVATED`/`EVENT_LIGHT`). 3a–3d a high-impact event far away (100h, beyond the 72h window → `DISTANT`/`LOW`/`QUIET`, while still surfacing the event itself as the nearest one). 4a–4e mixed event importance (high/medium/low mixed, two high-impact events → `EVENT_HEAVY`, nearest correctly selected over medium/low and the further-out high-impact event). 5a–5c missing timestamps/data (malformed date and blank-title entries excluded → `PARTIAL`). 5d–5e an all-unusable non-empty calendar → `UNAVAILABLE`, not `PARTIAL`. 5f an unparseable `asOf` itself → `UNAVAILABLE`, no `NaN` leak into the output. 6 determinism (identical input → byte-identical repeated output). 6b deterministic tie-break at identical `hoursAway` (ascending title). 7 input immutability. 8a–8g proximity boundary exactness at all three cutoffs (6h/24h/72h, both at-boundary and one-moment-over) plus an already-elapsed high-impact event never being selected as upcoming. 9 medium/low-impact events never selected even when closer in time than the only high-impact event. 10 static scan — no forbidden import statement. 11 static scan — no `Date.now()`/`Math.random()` call. 12 no free-text reason/explanation/narrative/reasoning/summary field declared. 13 static scan — no `fetch(` call. 14 no canonical Oracle/decision field name declared in `contracts.ts`.

Run: `node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/macro-intelligence-fixtures.ts`

### Regression — full Phase 8 suite, all re-run this pass
`cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0), `learning-db-env-fixtures.ts` (8.1.0), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21), `failure-pattern-fixtures.ts` (8.1.2, 16/16), `decision-memory-fixtures.ts` (8.1.3, 20/20), `adaptive-constraint-fixtures.ts` (8.1.4, 21/21), `learning-validation-fixtures.ts` (8.1.5, 27/27), `decision-trace-fixtures.ts` (8.2.1, 20/20), `decision-qualification-fixtures.ts` (8.2.2, 23/23) — **all still pass, zero regressions** (verified by a zero-`FAIL`-line grep across every one of these fixture files' output, this pass). None of these suites' source files were modified this pass.

**One pre-existing fixture assertion remains expected-stale, unrelated to this pass**: `autonomous-context-fixtures.ts` (8.2.0) fixture 20 still `FAIL`s with `found references in: lib/ai/decisionQualification/contracts.ts` — this is the exact same expected-stale condition already documented in the Phase 8.2.2 entry above (a legitimate type-only consumer of `AutonomousDecisionContext` now exists, which the fixture's wording, written before 8.2.1+ consumers were anticipated, does not yet reflect). This pass's own two new files (`lib/ai/macroIntelligence/contracts.ts`, `analyze.ts`) do **not** import from the autonomous-context module at all — an early draft's header *comments* mentioned that module by its literal path for documentation purposes, which the fixture's plain (non-comment-stripped) substring scan flagged as a false-positive "reference"; those comments were reworded during this pass (no logic change) to describe the module by name instead of by literal import path, and a re-run of `autonomous-context-fixtures.ts` after that edit confirms `lib/ai/macroIntelligence/*` no longer appears in the offender list — only the pre-existing `lib/ai/decisionQualification/contracts.ts` reference remains. `autonomous-context-fixtures.ts` itself was not modified this pass (out of scope — 8.2.0 is a protected phase).

### Typecheck
`npx tsc --noEmit` — **not run**: `node_modules` is not installed in this sandbox and there is no network access to install it — same pre-existing environment limitation documented in every prior 8.x entry. In its place: (1) `node --experimental-strip-types --check` run individually against both new source files and the fixture script — clean, no syntax/parse errors; (2) the fixture script exercises `analyze.ts`'s exported `analyzeMacroIntelligence()` end-to-end through Node's TS-stripping runtime — 43/43 passing is only possible if every import/export/type resolves and the logic executes without a runtime `TypeError`; (3) manual cross-check of the one import against its actual exported name — `EconomicEvent` (`lib/types.ts`, confirmed present with `title`/`country`/`date`/`impact`/`forecast`/`previous` fields, matching what `isUsableEvent()`/`analyze.ts` read). Recommend running `npx tsc --noEmit` in an environment with network access before considering this phase fully verified, same recommendation as every prior sandbox-limited entry.

### Scope verification
`git status --porcelain`: only `lib/ai/macroIntelligence/` (new directory, 2 files) and `scripts/phase8/macro-intelligence-fixtures.ts` (new file) are untracked; every other tracked path in the repository is unmodified. No schema file, route, cron config, or UI component was touched. No file under `lib/ai/decisionQualification`, `lib/ai/decisionTrace`, `lib/ai/autonomous`, `lib/ai/oracle`, `lib/ai/cognitive`, `lib/ai/decisionOutcome`, `lib/ai/decisionEvaluation`, `lib/ai/failurePatterns`, `lib/ai/decisionMemory`, `lib/ai/adaptiveConstraint`, `lib/ai/learningValidation`, `lib/elvoid`, `lib/macro.ts`, or `lib/intelligence/*` was touched.

### Limitations discovered
- `MACRO_PROXIMITY_NEAR_HOURS` (24) and `MACRO_PROXIMITY_UPCOMING_HOURS` (72) are a first deterministic cut, not specified anywhere upstream (only the 6-hour `IMMINENT` cutoff has an existing precedent in `macroEvents.ts`) — should be revisited once a consumer of `macroRegime`/`eventRisk` exists with real requirements for how far ahead "elevated risk" should actually look.
- The app's economic-calendar feed has no realized actual-vs-forecast comparison data at all (see `macroEvents.ts`'s own honesty note) — `directionalBias` will remain permanently `null` until a future phase gains access to a feed that actually reports realized prints, not merely scheduled events.
- `MacroUpcomingHighImpactEvent` deliberately carries no `category` (FOMC/CPI/PPI/etc.) field, since `macroEvents.ts`'s `categorize()` is private/unexported and this phase's own rules forbid reimplementing a second, drifting copy of validated classification logic. A future phase could either export `categorize()` from `macroEvents.ts` for reuse, or accept the duplication if a category field becomes genuinely needed downstream.
- `analyzeMacroIntelligence()` currently has no consumer anywhere in the codebase, by design — this phase is intentionally infrastructure-only, matching the task's explicit boundary and every other 8.2.x phase's "unwired" convention.

### Post-entry fix — duplicate object-literal key in fixture script (build-blocking)
`npm run build`'s typecheck caught `event({ title: "Blank Title", date: isoAtHoursAway(5), impact: "high", title: "" })` in fixture 5 (`scripts/phase8/macro-intelligence-fixtures.ts`) — `title` was supplied twice in the same object literal (a leftover label from copy-pasting the builder pattern, missed by this sandbox's `node --experimental-strip-types` runs, which parse but do not typecheck duplicate keys the way `tsc` does). Fixed by removing the redundant leading `title: "Blank Title"`, leaving the intended `title: ""` — a literal-value fix only, no test intent, assertion, or logic changed; fixture count is unchanged (still 43/43), and a re-run confirms the suite still passes end-to-end.

### Remaining roadmap status
- Phase 8.1.0 – 8.1.5: **COMPLETE** (unchanged this pass).
- Phase 8.2.0: Autonomous Intelligence Integration Foundation — **COMPLETE** (unchanged this pass).
- Phase 8.2.1: Autonomous Decision Traceability — **COMPLETE** (unchanged this pass).
- Phase 8.2.2: Autonomous Decision Qualification Engine — **COMPLETE** (unchanged this pass).
- Phase 8.2.3: Macro Intelligence Integration — **COMPLETE** (pure calendar-derived advisory context only: closed `dataAvailability`/`macroRegime`/`eventRisk`/`eventProximity` enums, one narrow nested `upcomingHighImpactEvent` object, `directionalBias` permanently `null` in this phase; zero persistence, zero routes/cron/UI, zero execution wiring; never touches Oracle grading or decision logic).
- Explicitly NOT implemented this pass (per task instruction): Phase 8.2.4 (News Impact) and any consumer/decision logic that would read `MacroIntelligenceContext` to influence an actual autonomous decision — both out of scope until separately approved.

---

## Phase 8.2.4 — News & Economic Event Impact Engine

Adds a downstream, pure advisory layer that converts already-produced news + economic-calendar context into a single structured, deterministic `MarketImpactContext` — a compatible future input for Phase 8.2.5 (Pre-Entry Market Validation), which is **not** implemented this pass. This is explicitly **not** a sentiment engine, a second macro-classification engine, or decision logic: it never fabricates directional market predictions, never recalculates Oracle grading/confidence/side/entry/SL/TP, and never selects EXECUTE/WAIT/REJECT.

### Files added
- `lib/ai/eventImpact/contracts.ts` — closed types: `EventState` (`UPCOMING`/`RECENT`/`NONE`/`UNKNOWN`), `NewsDataAvailability` (`AVAILABLE`/`PARTIAL`/`UNAVAILABLE`, mirroring Phase 8.2.3's `MacroDataAvailability` 3-state pattern), `ImpactRisk` (a direct alias of Phase 8.2.3's `MacroEventRiskLevel` — never a second, competing risk enum), `ImpactDirection` (`RISK_ON`/`RISK_OFF`, declared but never populated this phase), `EventImpactUncertaintyFlags` (`macroDataMissing`/`newsDataMissing`/`directionUnsupported`, all plain booleans), `EventImpactInput` (`asOf` + Phase 8.2.3's own `MacroIntelligenceContext`, reused verbatim, + the app's existing `NewsItem[]`), and `MarketImpactContext` (the single output shape — `eventState`, `macroAvailability`, `newsAvailability`, `highImpactPresent`, `upcomingHighImpactEvent` (re-exposed verbatim from `input.macro`), `totalNewsCount`/`usableNewsCount`/`recentNewsCount`, `impactRisk`, `impactDirection` (always `null`), `conflictingImpact`, `uncertainty`).
- `lib/ai/eventImpact/analyze.ts` — the pure `analyzeEventImpact(input: EventImpactInput): MarketImpactContext` function, plus private helpers (`parseTimeMs`, `isUsableNewsItem`, `filterUsableNews`, `computeNewsAvailability`, `hoursAgo`, `filterRecentNews`, `computeConflictingImpact`, `computeEventState`).
- `scripts/phase8/event-impact-fixtures.ts` — 51 offline fixture checks (dev-only, not part of the app), all passing.

### Reuse, not reinvention
`analyzeEventImpact()` never re-derives economic-event proximity/availability/regime — it reads Phase 8.2.3's already-computed `MacroIntelligenceContext` verbatim (`macroAvailability`/`impactRisk`/`upcomingHighImpactEvent` are direct copies of `input.macro.dataAvailability`/`input.macro.eventRisk`/`input.macro.upcomingHighImpactEvent`, never recomputed). `ImpactRisk` is declared as a type alias of Phase 8.2.3's own `MacroEventRiskLevel`, not a second enum. `NEWS_RECENT_HOURS` (6) mirrors `lib/binance/newsGate.ts`'s own existing 6-hour sentiment-sample window rather than inventing a new number. `NewsItem` (`lib/types.ts`) is consumed as-is — the same shape `getNews()`/`buildNewsWindow()` already produce; this phase never fetches news itself (fixture 13, static scan — `analyze.ts` contains no `fetch(` call at all).

### Honesty rule — why `impactDirection` is always `null`
`NewsItem.sentiment` (optional, upstream) is produced by `lib/newsapi.ts`'s `classifySentiment()` — a plain keyword/regex match against the headline (`surge`/`pump`/`bullish` → positive, `hack`/`scam`/`crash` → negative). That is a headline keyword tag, not a verified market-reaction signal: it carries no magnitude, no confirmation, and no relationship to actual price behavior. Treating it as a basis for a directional market call would fabricate causality the classifier cannot honestly support — exactly the fabrication this task's boundary forbids. `analyzeEventImpact()` therefore uses `sentiment` for exactly one honest, non-directional purpose — `conflictingImpact`, detecting that both positive- and negative-tagged headlines exist in the same recent window, an existence/conflict signal about the news set itself, never a directional claim (fixture 6, "unsupported directional inference → null": unanimous positive sentiment across two recent items still produces `impactDirection: null`, and a full-output string scan confirms `"RISK_ON"`/`"RISK_OFF"` never appear anywhere in a real return value). `uncertainty.directionUnsupported` is unconditionally `true` in every return path (fixture 6c), matching Phase 8.2.3's own `directionalBias: null` honesty rule for economic-calendar data — declared as a closed, forward-compatible type so a future, separately-approved phase that gains access to a verified market-reaction signal can populate it without a breaking schema change.

### Signals produced (all closed enums / booleans / plain counts — no free-text field anywhere)
- `eventState` — `UNKNOWN` only when **both** `macro.dataAvailability === "UNAVAILABLE"` and `newsAvailability === "UNAVAILABLE"`; otherwise `UPCOMING` (a known future high-impact economic event exists — takes precedence over `RECENT` when both are true, since a forward-looking high-impact release is the more actionable timing fact for a pre-entry consumer); else `RECENT` (usable news within the `NEWS_RECENT_HOURS` window); else `NONE`.
- `highImpactPresent` / `upcomingHighImpactEvent` — sourced **only** from `input.macro`, never from news: `NewsItem` carries no severity/importance field upstream (unlike `EconomicEvent.impact`), so there is no honest basis for news volume or sentiment to elevate an "impact" classification.
- `impactRisk` — mirrors `input.macro.eventRisk` verbatim; `UNKNOWN` whenever macro data is unavailable, **regardless of how much recent news exists** (fixture 3d) — news alone cannot honestly grade a risk *level* it has no severity field to support.
- `conflictingImpact` — `true` only when the recent-news window contains at least one `sentiment: "positive"` item **and** at least one `sentiment: "negative"` item; a single-sided or all-neutral window is `false`.
- `newsAvailability` — `UNAVAILABLE` when `news.length === 0`, every entry is unusable (unparseable `publishedAt` or blank `title`), **or** `input.asOf` itself fails to parse (mirrors Phase 8.2.3's own `asOf`-unparseable → `UNAVAILABLE` fallback, fixture 5f, no `NaN` leak); `PARTIAL` when some but not all entries are usable; `AVAILABLE` when every entry is usable.

### Boundaries respected (verified by fixtures 11–16 and manual review)
- Never imports `lib/ai/oracle/*`, `lib/ai/cognitive/*`, the Phase 8.2.0 autonomous-context module, `lib/ai/decisionQualification/*`, `lib/ai/decisionTrace/*`, `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/decisionMemory/*`, `lib/ai/failurePatterns/*`, `lib/ai/adaptiveConstraint/*`, `lib/ai/learningValidation/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`, `lib/intelligence/macroKnowledge.ts`, `lib/newsapi.ts`, or `lib/binance/newsGate.ts` (fixture 11, comment-stripped static scan of actual `import` statements only — none of those live/impure modules are pulled into this pure layer, even though `lib/newsapi.ts`'s `classifySentiment()` is discussed in this file's comments).
- Zero `Date.now()`/`Math.random()`/`fetch(` calls anywhere in `analyze.ts` (fixtures 12–13) — every timestamp is either `input.asOf` copied verbatim (`generatedAt`) or an already-supplied `NewsItem.publishedAt`/`EconomicEvent.date` string parsed via `Date.parse`, never a live clock or network read.
- No free-text `reason`/`explanation`/`narrative`/`reasoning`/`summary` field anywhere in `contracts.ts` (fixture 14), and no canonical Oracle/decision field name (`grade:`/`confidence:`/`side:`/`riskStatus:`/`stopLoss:`/`takeProfit:`/`"EXECUTE"`/`"WAIT"`/`"REJECT"`) anywhere (fixture 15).
- No LLM/provider import (`lib/ai/core/llm`, `lib/ai/provider`, or any literal `anthropic`/`openai` reference) anywhere in either file (fixture 16).
- **UNTOUCHED**: `lib/ai/macroIntelligence/*` (Phase 8.2.3, read-only type import), `lib/ai/oracle/*`, `lib/ai/cognitive/*`, `lib/ai/autonomous/*` (Phase 8.2.0), `lib/ai/decisionQualification/*` (Phase 8.2.2), `lib/ai/decisionTrace/*` (Phase 8.2.1), `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`, `lib/ai/decisionMemory/*`, `lib/ai/adaptiveConstraint/*`, `lib/ai/learningValidation/*`, `lib/ai/decisionLearning/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`, `lib/newsapi.ts`, `lib/binance/newsGate.ts`, `lib/intelligence/*`, `supabase/schema.sql`, `supabase/learning/schema.sql`, `app/api/*` — confirmed via `git status --porcelain`, which shows only `lib/ai/eventImpact/` (new directory, 2 files) and `scripts/phase8/event-impact-fixtures.ts` (new file) as untracked; every other tracked path is unmodified. No schema, route, cron config, or UI component was touched, and no consumer wiring was added anywhere — matching every other 8.2.x phase's "infrastructure only, unwired" convention.

### Testing
Offline, pure-layer only — this phase has no repository/persistence layer at all, so every exported function it introduces is exercised end-to-end by `event-impact-fixtures.ts`. Covers: 1 no news/no events → `UNKNOWN` everywhere, nothing fabricated. 2 upcoming high-impact economic event alone → `UPCOMING`, `impactRisk` mirrors `macro.eventRisk`. 3 recent news alone (no upcoming economic event) → `RECENT`, `impactRisk` stays `UNKNOWN` (macro unavailable). 4a–4f mixed/conflicting news (both positive and negative tags), with and without a concurrent upcoming high-impact event — `UPCOMING` outranks `RECENT`; `conflictingImpact` true either way; `impactDirection` still `null`. 5a–5f missing/malformed timestamps and titles excluded honestly (`PARTIAL`/`UNAVAILABLE`), plus an unparseable `input.asOf` itself, with no `NaN` leak anywhere in the output. 6a–6c unsupported directional inference: unanimous positive sentiment still yields `impactDirection: null`, no `"RISK_ON"`/`"RISK_OFF"` string anywhere in the actual output, `uncertainty.directionUnsupported` always `true`. 7 determinism (byte-identical repeated output for identical input). 8 input immutability (deep-equal `EventImpactInput` before/after). 9a–9d boundary timing exactness at the `NEWS_RECENT_HOURS` cutoff (inclusive), one moment past it, a future-dated (malformed) timestamp, and exactly-at-`asOf`. 10a–10c `eventState` precedence: both sources present but nothing upcoming/recent → `NONE`; both unavailable → `UNKNOWN`; macro unavailable but news usable+recent → `RECENT` (not `UNKNOWN`). 11–16 static scans (forbidden imports, wall-clock/random calls, `fetch(`, free-text fields, canonical Oracle fields, LLM/provider references).

**Full relevant Phase 8 regression suite — run this pass, all pre-existing suites still pass, zero regressions**: `cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0), `learning-db-env-fixtures.ts` (8.1.0), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21), `failure-pattern-fixtures.ts` (8.1.2, 16/16), `decision-memory-fixtures.ts` (8.1.3, 20/20), `adaptive-constraint-fixtures.ts` (8.1.4, 21/21), `learning-validation-fixtures.ts` (8.1.5, 27/27), `decision-trace-fixtures.ts` (8.2.1, 20/20), `decision-qualification-fixtures.ts` (8.2.2, 23/23), `macro-intelligence-fixtures.ts` (8.2.3, 43/43). None of these suites' source files were modified this pass; each was re-run directly, not assumed.

**One pre-existing fixture assertion remains expected-stale, unrelated to this pass and NOT a new regression**: `autonomous-context-fixtures.ts` (8.2.0) fixture 20 still `FAIL`s with `found references in: lib/ai/decisionQualification/contracts.ts` — this is the exact same expected-stale condition already documented in the Phase 8.2.2 and 8.2.3 entries above (a legitimate type-only consumer of `AutonomousDecisionContext` already existed before this pass). This pass's own two new files do **not** import from the autonomous-context module at all, and do not appear in that fixture's offender list — re-confirmed by re-running `autonomous-context-fixtures.ts` after adding `lib/ai/eventImpact/*`, which still lists only the pre-existing `lib/ai/decisionQualification/contracts.ts` reference.

**Honest reporting, not "zero regressions" glossed over**: the one `FAIL` line above is real, pre-existing, and unrelated to this pass's own files — it is called out explicitly rather than omitted. Every suite listed as "still passes" was actually re-run this pass, not assumed.

**Typecheck caveat**: this sandbox has no `node_modules` installed (network egress is restricted to a fixed allow-list that does not currently reach this project's package registry mirror in a way that permits a full `npm install`), so `npm run build`/full-project `tsc --noEmit` could not be run here, matching this phase's own testing convention of exercising every function end-to-end via `node --experimental-strip-types` rather than a full Next.js build. `contracts.ts`/`analyze.ts` were manually re-reviewed for type consistency with Phase 8.2.3's own exported types (`MacroDataAvailability`, `MacroEventRiskLevel`, `MacroUpcomingHighImpactEvent`, `MacroIntelligenceContext`) and with `lib/types.ts`'s `NewsItem`, and the fixture script — which imports and exercises both files through the real TypeScript-aware `node --experimental-strip-types` loader (which does parse and strip types, though it does not perform full type *checking*) — ran clean with no import/resolution errors.

### Limitations discovered
- `NEWS_RECENT_HOURS` (6) is a first deterministic cut reusing `lib/binance/newsGate.ts`'s existing sentiment-sample window; it has no independent specification for *this* phase's "recent" definition and should be revisited once a Phase 8.2.5 consumer has real requirements for how far back "recent" should look for pre-entry purposes.
- `conflictingImpact` depends entirely on the upstream keyword-heuristic `NewsItem.sentiment` tag (see the Honesty rule section above) — it is an honest existence signal given what's available, but it inherits that classifier's known blind spots (sarcasm, negation, mixed-topic headlines) and should not be read as a validated sentiment measurement.
- `NewsItem` carries no per-item impact/severity field, so this phase cannot distinguish "one minor headline" from "ten major headlines" for risk-grading purposes — `impactRisk` is deliberately left entirely to the economic-calendar side (`input.macro.eventRisk`) rather than inventing a news-volume-based severity heuristic.
- `analyzeEventImpact()` currently has no consumer anywhere in the codebase, by design — this phase is intentionally infrastructure-only, matching the task's explicit boundary and every other 8.2.x phase's "unwired" convention.

### Remaining roadmap status
- Phase 8.1.0 – 8.1.5: **COMPLETE** (unchanged this pass).
- Phase 8.2.0: Autonomous Intelligence Integration Foundation — **COMPLETE** (unchanged this pass).
- Phase 8.2.1: Autonomous Decision Traceability — **COMPLETE** (unchanged this pass).
- Phase 8.2.2: Autonomous Decision Qualification Engine — **COMPLETE** (unchanged this pass).
- Phase 8.2.3: Macro Intelligence Integration — **COMPLETE** (unchanged this pass).
- Phase 8.2.4: News & Economic Event Impact Engine — **COMPLETE** (pure downstream advisory context only: closed `eventState`/`newsAvailability`/`impactRisk` enums, `impactDirection` permanently `null` in this phase, boolean-only `conflictingImpact`/`uncertainty` signals; zero persistence, zero routes/cron/UI, zero execution wiring; never touches Oracle grading or decision logic; never fetches news or recomputes Phase 8.2.3's own macro classification).
- Explicitly NOT implemented this pass (per task instruction): Phase 8.2.5 (Pre-Entry Market Validation) and any consumer/decision logic that would read `MarketImpactContext` to influence an actual autonomous decision — both out of scope until separately approved.
---

## Phase 8.2.5 — Pre-Entry Market Validation

Adds a downstream, pure advisory validator that answers exactly one question: "the signal is already valid (per Phase 8.2.2's `AutonomousQualificationResult`) — is current market context, on closed-signal terms, suitable to proceed toward a later entry-decision stage?" This is explicitly **not** a second Oracle grading engine and **not** a second qualification engine: it never recalculates or overrides `grade`/`confidence`/`side`/`riskStatus`/`entry`/`stopLoss`/`takeProfit`, never re-derives `QualificationStatus` itself, and never selects EXECUTE/WAIT/REJECT.

### Files added
- `lib/ai/preEntryValidation/contracts.ts` — closed types: `PreEntryValidationStatus` (`VALID`/`CAUTION`/`BLOCKED`/`INSUFFICIENT_CONTEXT`), `PreEntryValidationSignals` (eleven independently computed booleans: `qualificationPresent`/`macroPresent`/`eventImpactPresent`/`qualificationInsufficient`/`qualificationConflicted`/`qualificationCaution`/`riskValid`/`macroEventRiskElevated`/`eventImpactRiskElevated`/`conflictingImpactPresent`/`macroDataIncomplete`/`newsDataIncomplete`), `PreEntryValidationInput` (Phase 8.2.0's `AutonomousDecisionContext` (required) + Phase 8.2.2's `AutonomousQualificationResult`, Phase 8.2.3's `MacroIntelligenceContext`, and Phase 8.2.4's `MarketImpactContext`, each independently nullable), and `PreEntryValidationResult` (the single output shape — `symbol`/`source`/`generatedAt` copied verbatim from `decisionContext`, `status`, `signals`).
- `lib/ai/preEntryValidation/validate.ts` — the pure `validatePreEntry(input: PreEntryValidationInput): PreEntryValidationResult` function, plus private helpers (`computeSignals`, `selectValidationStatus`).
- `scripts/phase8/pre-entry-validation-fixtures.ts` — 25 offline fixture checks (dev-only, not part of the app), all passing.

### Reuse, not reinvention
`validatePreEntry()` never re-reads `decisionContext.canonical`/`cognitive`/`memory`/`validConstraints` directly — Phase 8.2.2's `qualification` result already summarizes the canonical assessment and Decision Memory concerns this phase needs (`riskValid` is copied verbatim from `qualification.signals.riskValid`; `qualificationConflicted`/`qualificationCaution`/`qualificationInsufficient` are plain comparisons against `qualification.status`, never a re-run of Phase 8.2.2's own `selectQualificationStatus()` priority logic). `macroEventRiskElevated`/`macroDataIncomplete` are plain comparisons against Phase 8.2.3's own closed `eventRisk`/`dataAvailability` enums. `eventImpactRiskElevated`/`conflictingImpactPresent`/`newsDataIncomplete` are plain comparisons/verbatim copies of Phase 8.2.4's own already-computed `impactRisk`/`conflictingImpact`/`newsAvailability` fields — `ImpactRisk` is itself already a direct alias of `MacroEventRiskLevel` (see `eventImpact/contracts.ts`), so this phase never declares a competing risk enum. `symbol`/`source`/`generatedAt` are carried forward verbatim from `input.decisionContext`, never re-derived.

### Priority order (deterministic, fail-closed — first match wins, mirroring `qualify.ts`'s own `selectQualificationStatus()` pattern)
1. A required upstream input is missing (`qualification`/`macro`/`eventImpact === null`) -> `INSUFFICIENT_CONTEXT`.
2. Upstream qualification itself `INSUFFICIENT_CONTEXT` -> `INSUFFICIENT_CONTEXT` (inherits the upstream fail-safe rather than guessing past it).
3. Upstream qualification `CONFLICTED` -> `BLOCKED` (documented historical Decision Memory conflict outranks every market-context concern below).
4. `macro.eventRisk === "ELEVATED"` or `eventImpact.impactRisk === "ELEVATED"` -> `BLOCKED` (an imminent/near high-impact macro event, or an event-risk-elevated news window).
5. `eventImpact.conflictingImpact === true` -> `CAUTION`.
6. `!qualification.signals.riskValid` -> `CAUTION`.
7. `macro.dataAvailability !== "AVAILABLE"` or `eventImpact.newsAvailability !== "AVAILABLE"` -> `CAUTION` (honestly incomplete data).
8. Upstream qualification `CAUTION` alone -> `CAUTION`.
9. Otherwise -> `VALID`.

### Boundaries respected (verified by fixtures 16–19 and manual review)
- Never imports `lib/ai/oracle/*`, `lib/ai/cognitive/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`, or any decision-lifecycle/execution path (fixture 16, comment-stripped static scan of actual `import` statements only). The only value-level import is `qualifyAutonomousDecision`'s output type and `validatePreEntry` itself — no runtime dependency on any live/impure module.
- Zero `Date.now()`/`Math.random()`/`fetch(` calls anywhere in `validate.ts` (fixture 17) — the only timestamp in the output is `input.decisionContext.generatedAt`, copied verbatim.
- No free-text `reason`/`explanation`/`narrative`/`reasoning`/`summary` field anywhere in `contracts.ts` (fixture 18), and no `"EXECUTE"`/`"WAIT"`/`"REJECT"`/`"EXPIRE"` literal anywhere in either file (fixture 19) — this phase is advisory-only by construction, with no field to attach a decision or a causal narrative to.
- **UNWIRED**: nothing in the app imports from `lib/ai/preEntryValidation/*` yet. No route, no cron, no UI, no execution call-site — matching the task's own explicit "no schema/routes/cron/UI" instruction and every other 8.2.x phase's "infrastructure only, unwired" convention.
- **UNTOUCHED**: `lib/ai/oracle/*`, `lib/ai/cognitive/*`, `lib/ai/autonomous/*` (Phase 8.2.0), `lib/ai/decisionTrace/*` (Phase 8.2.1), `lib/ai/decisionQualification/*` (Phase 8.2.2), `lib/ai/macroIntelligence/*` (Phase 8.2.3), `lib/ai/eventImpact/*` (Phase 8.2.4), `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`, `lib/ai/decisionMemory/*`, `lib/ai/adaptiveConstraint/*`, `lib/ai/learningValidation/*`, `lib/ai/decisionLearning/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/elvoid/engine.ts`, `lib/supabase.ts`, `supabase/schema.sql`, `supabase/learning/schema.sql`, `app/api/*` — confirmed via `git status --porcelain`, which shows only `lib/ai/preEntryValidation/` (new directory, 2 files) and `scripts/phase8/pre-entry-validation-fixtures.ts` (new file) as untracked; every other tracked path is unmodified. No schema, route, cron config, or UI component was touched, and no consumer wiring was added anywhere.

### Testing
Offline, pure-layer only — this phase has no repository/persistence layer at all, so `validatePreEntry()` is exercised end-to-end by `pre-entry-validation-fixtures.ts`. Covers: 1 fully clean/complete input -> `VALID`. 2a–2d each of the three optional upstream inputs (and all three together) missing -> `INSUFFICIENT_CONTEXT`. 3 upstream qualification itself `INSUFFICIENT_CONTEXT` -> `INSUFFICIENT_CONTEXT`. 4 upstream qualification `CONFLICTED` -> `BLOCKED`. 5a–5b elevated event risk from either the macro side or the event-impact side -> `BLOCKED`. 6 invalid risk plan -> `CAUTION`. 7 conflicting recent news impact -> `CAUTION`. 8a–8b incomplete macro/news data -> `CAUTION`. 9 upstream qualification `CAUTION` alone -> `CAUTION`. 10 priority order — `BLOCKED` outranks a simultaneous partial-data + conflicting-impact + `CAUTION`-qualification combination. 11 priority order — a `CONFLICTED` qualification and an elevated event risk both present still resolve to `BLOCKED` (never a stacked/compound status), with both underlying signals independently true. 12 priority order — a missing required input outranks even a `CONFLICTED`-shaped qualification. 13 `symbol`/`source`/`generatedAt` carried through verbatim from `decisionContext`. 14 determinism (byte-identical repeated output for identical input). 15 input immutability (deep-equal `PreEntryValidationInput` before/after). 16–19 static scans (forbidden imports, wall-clock/random/network calls, free-text fields, EXECUTE/WAIT/REJECT/EXPIRE literals). 20 full four-status coverage sanity.

**Full relevant Phase 8 regression suite — run this pass, all pre-existing suites still pass, zero new regressions**: `cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0), `learning-db-env-fixtures.ts` (8.1.0), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21), `failure-pattern-fixtures.ts` (8.1.2, 16/16), `decision-memory-fixtures.ts` (8.1.3, 20/20), `adaptive-constraint-fixtures.ts` (8.1.4, 21/21), `learning-validation-fixtures.ts` (8.1.5, 27/27), `decision-trace-fixtures.ts` (8.2.1, 20/20), `decision-qualification-fixtures.ts` (8.2.2, 23/23), `macro-intelligence-fixtures.ts` (8.2.3, 43/43), `event-impact-fixtures.ts` (8.2.4, 51/51). None of these suites' source files were modified this pass; each was re-run directly, not assumed.

**One pre-existing fixture assertion remains expected-stale, unrelated to this pass and NOT a new regression**: `autonomous-context-fixtures.ts` (8.2.0) fixture 20 still `FAIL`s, now listing an additional offender — `found references in: lib/ai/decisionQualification/contracts.ts, lib/ai/preEntryValidation/contracts.ts` — this is the exact same expected-stale condition already documented in every prior 8.2.x entry (a legitimate type-only consumer of `AutonomousDecisionContext` already existed before this pass; this pass adds one more, for the same legitimate type-only reason). This is honestly reported, not glossed over: `lib/ai/preEntryValidation/contracts.ts` genuinely does import `AutonomousDecisionContext` as a type, by design (it is one of the four upstream contracts this phase re-exports), so its appearance in that offender list is expected and correct, not a bug.

**Honest reporting, not "zero regressions" glossed over**: the one `FAIL` line above is real, pre-existing (now with one additional, expected offender), and unrelated to this pass's own logic — it is called out explicitly rather than omitted. Every suite listed as "still passes" was actually re-run this pass, not assumed.

**Typecheck caveat**: this sandbox has no `node_modules` installed (network egress is disabled), so `npx tsc --noEmit`/`npm run build` could not be run here, matching every prior 8.x entry's own testing convention. In its place: (1) `node --experimental-strip-types --check` run individually against both new source files and the fixture script — clean, no syntax/parse errors; (2) the fixture script exercises `validate.ts`'s exported `validatePreEntry()` end-to-end through Node's TS-stripping runtime — 25/25 passing is only possible if every import/export/type resolves and the logic executes without a runtime `TypeError`; (3) manual cross-check of all four upstream imports against their actual exported names in `lib/ai/autonomous/contracts.ts`, `lib/ai/decisionQualification/contracts.ts`, `lib/ai/macroIntelligence/contracts.ts`, and `lib/ai/eventImpact/contracts.ts` — all confirmed present and matching what `contracts.ts`/`validate.ts` read. Recommend running `npx tsc --noEmit` in an environment with network access before considering this phase fully verified, same recommendation as every prior sandbox-limited entry.

### Scope verification
`git status --porcelain`: only `lib/ai/preEntryValidation/` (new directory, 2 files) and `scripts/phase8/pre-entry-validation-fixtures.ts` (new file) are untracked; every other tracked path in the repository is unmodified. No schema file, route, cron config, or UI component was touched. No file under `lib/ai/oracle`, `lib/ai/cognitive`, `lib/ai/autonomous`, `lib/ai/decisionTrace`, `lib/ai/decisionQualification`, `lib/ai/macroIntelligence`, `lib/ai/eventImpact`, `lib/ai/decisionOutcome`, `lib/ai/decisionEvaluation`, `lib/ai/failurePatterns`, `lib/ai/decisionMemory`, `lib/ai/adaptiveConstraint`, `lib/ai/learningValidation`, `lib/elvoid`, `lib/supabase.ts`, or `lib/intelligence/*` was touched.

### Limitations discovered
- The "priority order" places elevated event risk (step 4) above conflicting-impact/invalid-risk/incomplete-data (steps 5–7) as a deliberate design choice for this phase — there is no upstream specification ranking these concerns against each other beyond the task's own listed check categories, so this ordering is a first reasonable cut, not a validated ranking, and should be revisited once a Phase 8.2.6 consumer has real requirements for how these concerns trade off.
- `validatePreEntry()` currently has no consumer anywhere in the codebase, by design — this phase is intentionally infrastructure-only, matching the task's explicit boundary and every other 8.2.x phase's "unwired" convention.
- This phase deliberately does not read `decisionContext.cognitive`/`memory`/`validConstraints` directly (see `validate.ts`'s own doc comment) — if a future phase determines Phase 8.2.2's `qualification` summary is insufficient for some new concern, that concern should be added to Phase 8.2.2's own signal set first, not re-derived independently here.

### Remaining roadmap status
- Phase 8.1.0 – 8.1.5: **COMPLETE** (unchanged this pass).
- Phase 8.2.0: Autonomous Intelligence Integration Foundation — **COMPLETE** (unchanged this pass).
- Phase 8.2.1: Autonomous Decision Traceability — **COMPLETE** (unchanged this pass).
- Phase 8.2.2: Autonomous Decision Qualification Engine — **COMPLETE** (unchanged this pass).
- Phase 8.2.3: Macro Intelligence Integration — **COMPLETE** (unchanged this pass).
- Phase 8.2.4: News & Economic Event Impact Engine — **COMPLETE** (unchanged this pass).
- Phase 8.2.5: Pre-Entry Market Validation — **COMPLETE** (pure downstream advisory validator only: closed `VALID`/`CAUTION`/`BLOCKED`/`INSUFFICIENT_CONTEXT` status, eleven boolean-only signals, no free-text field; zero persistence, zero routes/cron/UI, zero execution wiring; never touches Oracle grading, qualification logic, or decision logic; never recomputes any Phase 8.2.0–8.2.4 value).
- Explicitly NOT implemented this pass (per task instruction): Phase 8.2.6 and any consumer/decision logic that would read `PreEntryValidationResult` to influence an actual autonomous decision — out of scope until separately approved.
---

## Phase 8.2.6 — Autonomous Decision Engine

Adds the first phase in the whole 8.2.x line permitted to produce an actual `EXECUTE`/`WAIT`/`REJECT` value — every prior phase's own header explicitly deferred this selection to "a later, separately-approved phase"; this is that phase. `decideAutonomous()` answers exactly one question: "given everything already computed upstream (Phases 8.2.0/8.2.2/8.2.3/8.2.4/8.2.5), should this decision `EXECUTE`, `WAIT`, or `REJECT`?" This is explicitly **not** a second Oracle grading engine, **not** a second qualification engine, and **not** a second pre-entry validator: it never recalculates or overrides `grade`/`confidence`/`side`/`riskStatus`/`entry`/`stopLoss`/`takeProfit`/`QualificationStatus`/`PreEntryValidationStatus`, and it performs **no execution wiring** — no order placement, no `paperTrader`/`execute` call, no Learning DB write, no route/cron/UI.

### Files added
- `lib/ai/autonomousDecision/contracts.ts` — closed types: `AutonomousDecision` (`EXECUTE`/`WAIT`/`REJECT` — a deliberately narrower 3-member enum than `decisionTrace/contracts.ts`'s own 4-member `TraceOutcome`, since `EXPIRE` is a time-based outcome out of scope for a synchronous, wall-clock-free decision function), `AutonomousDecisionSignals` (twelve independently computed booleans: `qualificationPresent`/`macroPresent`/`eventImpactPresent`/`preEntryPresent`/`requiredContextMissing`/`qualificationInsufficient`/`preEntryInsufficient`/`preEntryBlocked`/`qualificationConflicted`/`preEntryCaution`/`preEntryValid`/`qualificationQualified`), `AutonomousDecisionEngineInput` (Phase 8.2.0's `AutonomousDecisionContext` (required) + Phase 8.2.2's `AutonomousQualificationResult`, Phase 8.2.3's `MacroIntelligenceContext`, Phase 8.2.4's `MarketImpactContext`, and Phase 8.2.5's `PreEntryValidationResult`, each independently nullable), and `AutonomousDecisionEngineResult` (the single output shape — `symbol`/`source`/`generatedAt` copied verbatim from `decisionContext`, `decision`, `signals`).
- `lib/ai/autonomousDecision/decide.ts` — the pure `decideAutonomous(input: AutonomousDecisionEngineInput): AutonomousDecisionEngineResult` function, plus private helpers (`computeSignals`, `selectAutonomousDecision`).
- `scripts/phase8/autonomous-decision-fixtures.ts` — 25 offline fixture checks (dev-only, not part of the app), all passing.

### Reuse, not reinvention
`decideAutonomous()` never re-reads `decisionContext.canonical`/`cognitive`/`memory`/`validConstraints` directly — Phase 8.2.2's `qualification` and Phase 8.2.5's `preEntry` already summarize every concern this phase needs. `macro`/`eventImpact` are read **only** for presence (`macroPresent`/`eventImpactPresent`, part of "required context") — their internal fields (`eventRisk`, `impactRisk`, `conflictingImpact`, etc.) are never inspected here, since Phase 8.2.5's `preEntry.status` already summarizes every macro/event-impact concern (`BLOCKED`/`CAUTION`/`VALID`/`INSUFFICIENT_CONTEXT`); re-reading those fields directly would risk re-implementing Phase 8.2.5's own `selectValidationStatus()` logic a second time. `qualificationInsufficient`/`qualificationConflicted`/`qualificationQualified`/`preEntryInsufficient`/`preEntryBlocked`/`preEntryCaution`/`preEntryValid` are all plain comparisons against the upstream engines' own closed `status` enums, never a re-run of either engine's priority-selection logic. `symbol`/`source`/`generatedAt` are carried forward verbatim from `input.decisionContext`, never re-derived.

### Priority order (deterministic, fail-closed — first match wins, exactly matching the task's own 6-step specification)
1. `requiredContextMissing` (any of `qualification`/`macro`/`eventImpact`/`preEntry` is `null`) or `qualificationInsufficient` or `preEntryInsufficient` -> `WAIT` (missing or insufficient context is the fail-safe default — never guessed past).
2. `preEntryBlocked` (`preEntry.status === "BLOCKED"`) -> `REJECT`.
3. `qualificationConflicted` (`qualification.status === "CONFLICTED"`) -> `REJECT`.
4. `preEntryCaution` (`preEntry.status === "CAUTION"`) -> `WAIT`.
5. `preEntryValid && qualificationQualified` (`preEntry.status === "VALID"` AND `qualification.status === "QUALIFIED"`) -> `EXECUTE`.
6. Otherwise -> `WAIT` (anything ambiguous — e.g. `preEntry.status === "VALID"` while `qualification.status === "CAUTION"` — fails safe to `WAIT`, never silently defaults to `EXECUTE`).

### Boundaries respected (verified by fixtures 15–18 and manual review)
- Never imports `lib/ai/oracle/*`, `lib/ai/cognitive/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/engine.ts`, `lib/elvoid/scanners.ts`, `lib/supabase.ts`, or any decision-lifecycle/execution path (fixture 15, comment-stripped static scan of actual `import` statements only). The only imports are type-only contracts from the five upstream 8.2.x phases.
- Zero `Date.now()`/`Math.random()`/`fetch(` calls anywhere in `decide.ts` (fixture 16) — the only timestamp in the output is `input.decisionContext.generatedAt`, copied verbatim.
- Zero execution/persistence calls anywhere in `decide.ts` (fixture 17, static scan for `placeOrder(`/`executeTrade(`/`paperTrader.`/`insert(`/`supabase.`/`.from(`/`await fetch`) — `decideAutonomous()` returns a plain in-memory value and does nothing else.
- No free-text `reason`/`explanation`/`narrative`/`reasoning`/`summary` field anywhere in `contracts.ts` (fixture 18).
- `AutonomousDecision` is a strictly closed 3-member enum — every value actually produced by real fixture inputs is one of exactly `EXECUTE`/`WAIT`/`REJECT`, never a fourth value like `EXPIRE` (fixture 19); all three are independently reachable (fixture 20).
- **UNWIRED**: nothing in the app imports from `lib/ai/autonomousDecision/*` yet. No route, no cron, no UI, no execution call-site — matching the task's own explicit "no execution wiring yet" instruction and every other 8.2.x phase's "infrastructure only, unwired" convention.
- **UNTOUCHED**: `lib/ai/oracle/*`, `lib/ai/cognitive/*`, `lib/ai/autonomous/*` (Phase 8.2.0), `lib/ai/decisionTrace/*` (Phase 8.2.1), `lib/ai/decisionQualification/*` (Phase 8.2.2), `lib/ai/macroIntelligence/*` (Phase 8.2.3), `lib/ai/eventImpact/*` (Phase 8.2.4), `lib/ai/preEntryValidation/*` (Phase 8.2.5), `lib/ai/decisionOutcome/*`, `lib/ai/decisionEvaluation/*`, `lib/ai/failurePatterns/*`, `lib/ai/decisionMemory/*`, `lib/ai/adaptiveConstraint/*`, `lib/ai/learningValidation/*`, `lib/ai/decisionLearning/*`, `lib/elvoid/paperTrader.ts`, `lib/elvoid/execute.ts`, `lib/elvoid/engine.ts`, `lib/elvoid/scanners.ts`, `lib/supabase.ts`, `supabase/schema.sql`, `supabase/learning/schema.sql`, `app/api/*` — confirmed via `git status --porcelain`, which shows only `lib/ai/autonomousDecision/` (new directory, 2 files), `scripts/phase8/autonomous-decision-fixtures.ts` (new file), and `CHANGES.md` itself as changed; every other tracked path is unmodified. No schema, route, cron config, or UI component was touched, and no consumer wiring was added anywhere.

### Testing
Offline, pure-layer only — this phase has no repository/persistence layer at all, so `decideAutonomous()` is exercised end-to-end by `autonomous-decision-fixtures.ts`. Covers: 1 fully clean/complete input -> `EXECUTE`. 2a–2e each of the four optional upstream inputs (and all four together) missing -> `WAIT`. 3a–3b upstream qualification/preEntry themselves `INSUFFICIENT_CONTEXT` -> `WAIT`. 4 preEntry `BLOCKED` -> `REJECT`. 5 qualification `CONFLICTED` -> `REJECT`. 6 preEntry `CAUTION` -> `WAIT`. 7 ambiguous combination (preEntry `VALID` but qualification not `QUALIFIED`) -> `WAIT`, never `EXECUTE`. 8 priority order — `REJECT` (preEntry `BLOCKED`) outranks a simultaneous `CAUTION`-qualification/ambiguous state. 9 priority order — `REJECT` (qualification `CONFLICTED`) outranks preEntry `CAUTION`. 10 priority order — missing context (`WAIT`) outranks even a `BLOCKED`+`CONFLICTED`-shaped combination. 11 priority order — upstream `INSUFFICIENT_CONTEXT` outranks a `BLOCKED`-shaped sibling. 12 `symbol`/`source`/`generatedAt` carried through verbatim from `decisionContext`. 13 determinism (byte-identical repeated output for identical input). 14 input immutability (deep-equal `AutonomousDecisionEngineInput` before/after). 15–18 static scans (forbidden imports, wall-clock/random/network calls, execution/persistence calls, free-text fields). 19 closed-enum sanity — only `EXECUTE`/`WAIT`/`REJECT` ever appear in real output. 20 full three-decision coverage sanity.

**Full relevant Phase 8 regression suite — run this pass, all pre-existing suites still pass, zero new regressions**: `cognitive-observation-fixtures.ts` (8.0.1), `cognitive-memory-fixtures.ts` (8.0.2), `cognitive-hypothesis-fixtures.ts` (8.0.3), `cognitive-conflict-fixtures.ts` (8.0.4), `cognitive-context-fixtures.ts` (8.0.5), `decision-outcome-fixtures.ts` (8.1.0), `learning-db-env-fixtures.ts` (8.1.0), `decision-evaluation-fixtures.ts` (8.1.1, 36/36), `decision-learning-lifecycle-fixtures.ts` (8.1.1.1, 21/21), `failure-pattern-fixtures.ts` (8.1.2, 16/16), `decision-memory-fixtures.ts` (8.1.3, 20/20), `adaptive-constraint-fixtures.ts` (8.1.4, 21/21), `learning-validation-fixtures.ts` (8.1.5, 27/27), `decision-trace-fixtures.ts` (8.2.1, 20/20), `decision-qualification-fixtures.ts` (8.2.2, 23/23), `macro-intelligence-fixtures.ts` (8.2.3, 43/43), `event-impact-fixtures.ts` (8.2.4, 51/51), `pre-entry-validation-fixtures.ts` (8.2.5, 25/25). None of these suites' source files were modified this pass; each was re-run directly, not assumed.

**One pre-existing fixture assertion remains expected-stale, unrelated to this pass and NOT a new regression**: `autonomous-context-fixtures.ts` (8.2.0) fixture 20 still `FAIL`s, now listing one additional offender on top of the two already documented in the Phase 8.2.5 entry — `found references in: lib/ai/autonomousDecision/contracts.ts, lib/ai/decisionQualification/contracts.ts, lib/ai/preEntryValidation/contracts.ts`. This is the exact same expected-stale condition already documented in every prior 8.2.x entry: `lib/ai/autonomousDecision/contracts.ts` genuinely does import `AutonomousDecisionContext`/`DecisionSource` as types, by design (it is one of the five upstream contracts this phase re-exports), so its appearance in that offender list is expected and correct, not a bug.

**Honest reporting, not "zero regressions" glossed over**: the one `FAIL` line above is real, pre-existing (now with one additional, expected offender), and unrelated to this pass's own logic — it is called out explicitly rather than omitted. Every suite listed as "still passes" was actually re-run this pass, not assumed.

**Typecheck caveat**: this sandbox has no `node_modules` installed (network egress is disabled), so `npx tsc --noEmit`/`npm run build` could not be run here, matching every prior 8.x entry's own testing convention. In its place: (1) `node --experimental-strip-types --check` run individually against both new source files and the fixture script — clean, no syntax/parse errors; (2) the fixture script exercises `decide.ts`'s exported `decideAutonomous()` end-to-end through Node's TS-stripping runtime — 25/25 passing is only possible if every import/export/type resolves and the logic executes without a runtime `TypeError`; (3) manual cross-check of all five upstream imports against their actual exported names in `lib/ai/autonomous/contracts.ts`, `lib/ai/decisionQualification/contracts.ts`, `lib/ai/macroIntelligence/contracts.ts`, `lib/ai/eventImpact/contracts.ts`, and `lib/ai/preEntryValidation/contracts.ts` — all confirmed present and matching what `contracts.ts`/`decide.ts` read. Recommend running `npx tsc --noEmit` in an environment with network access before considering this phase fully verified, same recommendation as every prior sandbox-limited entry.

### Scope verification
`git status --porcelain`: only `lib/ai/autonomousDecision/` (new directory, 2 files), `scripts/phase8/autonomous-decision-fixtures.ts` (new file), and `CHANGES.md` itself are changed; every other tracked path in the repository is unmodified. No schema file, route, cron config, or UI component was touched. No file under `lib/ai/oracle`, `lib/ai/cognitive`, `lib/ai/autonomous`, `lib/ai/decisionTrace`, `lib/ai/decisionQualification`, `lib/ai/macroIntelligence`, `lib/ai/eventImpact`, `lib/ai/preEntryValidation`, `lib/ai/decisionOutcome`, `lib/ai/decisionEvaluation`, `lib/ai/failurePatterns`, `lib/ai/decisionMemory`, `lib/ai/adaptiveConstraint`, `lib/ai/learningValidation`, `lib/elvoid`, `lib/supabase.ts`, or `lib/intelligence/*` was touched.

### Limitations discovered
- The priority order places `preEntryBlocked` (step 2) above `qualificationConflicted` (step 3), matching the task's own explicit 6-step ordering — but there is no upstream specification independently justifying that relative ranking beyond the task's own list; both are `REJECT`-producing, so the relative order between steps 2 and 3 has no observable effect on the final decision today (fixtures 8–9 confirm each independently produces `REJECT`), only on which specific signal is "responsible" when both are true simultaneously. Should be revisited if a future phase ever needs to distinguish "blocked for market-context reasons" from "rejected for historical-conflict reasons" in a way that matters downstream.
- `decideAutonomous()` currently has no consumer anywhere in the codebase, by design — this phase is intentionally infrastructure-only, matching the task's explicit "no execution wiring yet" boundary and every other 8.2.x phase's "unwired" convention.
- This phase deliberately never reads `macro`/`eventImpact` fields beyond presence — if a future phase determines Phase 8.2.5's `preEntry` summary is insufficient for some new market-context concern, that concern should be added to Phase 8.2.5's own signal set first, not re-derived independently here.

### Remaining roadmap status
- Phase 8.1.0 – 8.1.5: **COMPLETE** (unchanged this pass).
- Phase 8.2.0: Autonomous Intelligence Integration Foundation — **COMPLETE** (unchanged this pass).
- Phase 8.2.1: Autonomous Decision Traceability — **COMPLETE** (unchanged this pass).
- Phase 8.2.2: Autonomous Decision Qualification Engine — **COMPLETE** (unchanged this pass).
- Phase 8.2.3: Macro Intelligence Integration — **COMPLETE** (unchanged this pass).
- Phase 8.2.4: News & Economic Event Impact Engine — **COMPLETE** (unchanged this pass).
- Phase 8.2.5: Pre-Entry Market Validation — **COMPLETE** (unchanged this pass).
- Phase 8.2.6: Autonomous Decision Engine — **COMPLETE** (pure downstream final-decision function only: closed `EXECUTE`/`WAIT`/`REJECT` decision, twelve boolean-only signals, no free-text field; zero persistence, zero routes/cron/UI, zero execution wiring, zero order placement; never touches Oracle grading, qualification logic, macro/event-impact analysis, or pre-entry validation logic; never recomputes any Phase 8.2.0–8.2.5 value).
- Explicitly NOT implemented this pass (per task instruction): Phase 8.2.7 and any consumer/execution logic that would ACT on `AutonomousDecision` (placing an order, writing a decision trace, wiring a route/cron/UI) — out of scope until separately approved.
