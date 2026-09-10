# Phase 8.5 — Delta 4: Runtime Observability Terminal (180° redesign)

Same block, same rules as Delta 1-3. Not deployed yet — same blocker as before (no GitHub write access from this environment). Also applied directly to the live database (already verified): the `runtime_events` table.

## A. Files changed

**New:**
- `lib/ai/runtimeEvents/emit.ts` — fire-and-forget event emitter (never throws, never blocks the cycle)
- `lib/ai/runtimeEvents/repository.ts` — read-only, cursor-based event query
- `app/api/elvoid-pro/runtime-events/route.ts` — read-only API (triggers nothing)
- `components/ai-performance/cognitive/useRuntimeEvents.ts` — polling hook, dedupes by id
- Migration `create_runtime_events_table` (applied live) + `supabase/learning/schema.sql` updated in the same delta (the exact discipline this Phase's schema-drift bug taught)

**Modified:**
- `lib/ai/autonomousRuntime/orchestrator.ts` — instrumented with real event emission at every real stage boundary (see C/D below). **Zero lines of decision logic changed** — every `emitRuntimeEvent()` call reads a value that was already computed for the decision itself; nothing was added to produce a value *for* the terminal.
- `components/ai-performance/cognitive/RuntimeTerminal.tsx` — full rewrite
- `components/ai-performance/cognitive/CognitiveMapSection.tsx` — one line (removed the old `events` prop; the terminal now self-fetches)

## B. Runtime event sources discovered (Step 1 audit)

The **previous** terminal's root problem: `buildCognitiveMap()` (`lib/ai/cognitiveMap/build.ts`) synthesized its "events" by reading the **current** `autonomous_intelligence_snapshot` row (one row per symbol, overwritten every cycle) and turning each symbol's latest state into a fixed handful of lines, regenerated identically on every 20s poll until the next real cycle. That's not a log — it's a snapshot re-rendered to look like one, which is exactly why it read as a static, repeating dump. No table anywhere stored a genuine per-operation timeline. `runtime_events` is new infrastructure for exactly that reason, not a cosmetic layer on top of existing data.

Real execution paths confirmed and instrumented (all pre-existing, all reused as-is):
`assembleOracleContext` (market data) → `computeConfluence`/`buildOracleRiskPlan`/`gradeConfluence` (Oracle) → `buildMtfContext`/`classifyMarketRegime`/`buildLiquidityOrderFlowContext`/`buildScenarios` (Intelligence) → `classifyContradictions`/`resolveCognitiveConflict` (Conflict) → `qualifyAutonomousDecision` (Qualification) → `assembleExternalIntelligenceSignal` (External Intelligence) → `validatePreEntry` → `decideAutonomous` (Decision) → `executeAutonomousPaperTrade` (Execution) → `classifyAutonomousLearningLifecycle` (Learning).

## C. How live events reach the terminal
`runAutonomousCycle()` calls `emitRuntimeEvent()` (fire-and-forget) immediately after each real operation resolves, using the timestamp/status/result it already has in hand. The frontend hook polls `/api/elvoid-pro/runtime-events?since=<cursor>` every 4s (Step 13 — cursor-based, not a re-fetch of the same window; most polls return 0 rows since real cycles are sparse). No WebSocket/SSE infrastructure exists in this stack, and none was added — this stays inside the existing polling paradigm, just against a genuine append-only source instead of a re-synthesized snapshot.

## D. Which existing backend functions were instrumented
`assembleOracleContext`, `computeConfluence`, `buildOracleRiskPlan`, `gradeConfluence`, the Step-2 context block (mtf/regime/liquidity/scenario), `classifyContradictions`/`resolveCognitiveConflict`, `qualifyAutonomousDecision`, `assembleExternalIntelligenceSignal` (RUNNING marker emitted immediately before the call, real completion after), `validatePreEntry`, `decideAutonomous`, `executeAutonomousPaperTrade`, `classifyAutonomousLearningLifecycle`. Every one of these already existed and already ran on every cycle — none of their logic, thresholds, or return values were touched.

## E. How external research/source URLs are obtained
Not fabricated: the metadata shows `provider: "Binance"` **only** when `evidenceSatisfied` is true (a real funding-rate observation was obtained) — otherwise `provider: null`, rendered as `UNAVAILABLE`. No URL is shown anywhere because `assembleExternalIntelligenceSignal`'s real return type has never included one (checked the actual `ExternalIntelligenceSignal` shape before writing this) — inventing one would violate Step 4/17 directly, so the terminal shows the provider name only, exactly matching what Step 17 says to do when no URL exists.

## F. How fake/synthetic logs are prevented
- Every event row is written from inside `orchestrator.ts` at the instant a real function call resolved — there is no code path that inserts a `runtime_events` row without a real operation behind it.
- No client-side event generation, no interval-based fake ticks, no rotating symbols (Step 18 — current activity is derived from whatever the real latest events say, nothing rotates automatically).
- Idle state (`cycles.length === 0`) renders "IDLE — waiting for the next real market cycle" with no fake heartbeat.
- `RUNNING` is only ever emitted at the one point (`EXTERNAL_INTELLIGENCE`, right before the real `await`) where the code is genuinely mid-flight when the row is written.

## G. Auto-scroll implementation
Default: follows new events (`scrollTop = scrollHeight` on every new event while `autoScroll` is true). The instant `onScroll` detects the user isn't within 24px of the bottom, auto-scroll switches off and a "↓ N new events" pill appears showing the real count accumulated since — clicking it jumps to bottom and re-enables auto-scroll. No force-scroll while reading history.

## H. Error observability implementation
`ERROR` status carries the real thrown message (`err instanceof Error ? err.message : String(err)`) in both the market-data-fetch-threw path and the external-intelligence-gate-resolved-to-null path — never replaced with a generic string. Each event's expandable detail shows the real `operation` name and `cycleId` alongside it.

## I. Symbol/cycle deduplication
Every event carries a real `cycle_id` (one `crypto.randomUUID()` per `runAutonomousCycle()` invocation — one symbol, one tick). The frontend hook dedupes by event `id` (a `Set`, checked before appending) and advances its poll cursor only to the newest `createdAt` it actually received, so a slow network retry or an overlapping poll can never double-insert a row into the visible list.

## J. Tests executed
- `tsc --noEmit`, whole project: zero new diagnostics beyond the pre-existing, universal missing-`node_modules` noise (confirmed by exact-count comparison against the pre-Phase-8.5 baseline — e.g. the `{ key: ... }` prop-type noise affects 35 sites project-wide, including files never touched this Phase; my 2 new instances fit that identical pattern).
- Full 36-script fixture regression, final count: **8 — exactly the confirmed pre-existing baseline, 0 new**.

## K. Regression result
No behavioral fixture regressed. `autonomous-runtime-fixtures.ts` and `symbol-isolation-fixtures.ts` (both scan `orchestrator.ts`'s shape) both remain 0 FAIL despite ~150 new lines added to that file.

## L. Genuinely unavailable capabilities / known limitations
- **No row-retention/cleanup job yet** for `runtime_events` — it will grow unbounded over time. Flagged, not fixed in this delta (the codebase has a precedent, `storageGuard.ts`, for exactly this problem on `market_history` — a similar guard is the natural next step, not built here to keep this delta scoped).
- Only `EXTERNAL_INTELLIGENCE` gets a real mid-flight `RUNNING` row — every other stage is fast/synchronous enough that a separate start-marker would be a near-zero-duration, low-value event; they're reported as a single real completion event with a real duration instead.
- Sub-operation granularity inside `MARKET_DATA` (separate klines/trades/depth timings, as shown *illustratively* in your reference image) was **not** built — `assembleOracleContext` fetches all three via one `Promise.allSettled`, and splitting that open to time each leg individually would be a real, if small, change to that function's internals, not just observability wiring. Reported here rather than fabricated as three timed sub-rows.
- Production verification: **pending deploy**, same as Delta 2/3 — this is source-complete and fixture/regression-validated, not yet observed running against real traffic.
