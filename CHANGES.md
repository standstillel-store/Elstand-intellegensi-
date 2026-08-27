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
