# Phase 7.0–7.2 Delta — Elstand-intellegensi (cumulative)

This zip is CUMULATIVE — it includes everything from Phase 7.1 plus Phase 7.2's changes, so you only need to track one delta going forward.

## Upload instructions (GitHub web UI) — REPLACE these existing files:
1. `lib/ai/oracle/grading.ts` (unchanged since 7.1 — only `CLUSTERS` export)
2. `app/api/elvoid-pro/oracle/route.ts` (Phase 7.2: +8 lines, additive `mtf` field in response)
3. `components/elvoid-pro/AISignal/OraclePanel.tsx` (Phase 7.2: +28 lines, optional HTF/MTF/LTF UI block)
4. `changes.md` (grown with Phase 7.2 section)

## ADD these new files:
5. `lib/ai/oracle/evidence.ts` (from 7.1)
6. `lib/ai/oracle/mtf.ts` (Phase 7.2 — new MTF module)
7. `scripts/phase7/baseline.ts`, `alias-loader.mjs`, `baseline.snapshot.json` (from 7.1)
8. `scripts/phase7/mtf-fixtures.ts` (Phase 7.2 — offline relationship tests)

## What changed in Phase 7.2
- New `lib/ai/oracle/mtf.ts`: HTF/MTF/LTF context, deterministic timeframe mapping (1m↔15m, 5m↔1h/1m, 15m↔4h/5m, 1h↔1d/15m, 4h↔1d/1h, 1d↔4h). Reuses existing `getKlines()` (same 60s cache) and existing structure-scanning functions — no new engine, no new fetch layer.
- `classifyMtfRelationship()` returns a **descriptive label only** (e.g. `PULLBACK_IN_UPTREND`, `HTF_THESIS_THREATENED_BULLISH`) — it is never a second LONG/SHORT decision and is not consumed by grading.
- Oracle API route: added one line calling `buildMtfContext()`, wrapped in `.catch(() => null)` so any failure degrades gracefully — `assessment`/`confluence`/`insight`/`risk` are 100% unchanged.
- OraclePanel UI: small new section showing HTF/MTF/LTF bias + relationship, renders only if `mtf` is present.

## Verification done
- `scripts/phase7/mtf-fixtures.ts`: 7/7 relationship-logic test cases pass (offline, no network).
- Re-ran the Phase 7.1 baseline script — output is **byte-identical** to the recorded snapshot, confirming `grade`/`side`/`confidence`/`risk` are untouched by this phase.
- `git diff --stat` confirms zero files under `lib/elvoid/`, `lib/ai/core/`, `/api/ai-signals`, or `/api/elvoid-pro/insights`, `/api/elvoid-pro/execute-signal` were touched.

## Not verified in this sandbox
No `npm install`/network access here, so `getKlines()`'s real Binance fetch path for the new HTF/LTF calls has not been live-tested — only the offline relationship-classification logic has fixture coverage. Recommend a quick manual check against a live/staging symbol once deployed.

See `changes.md` → "Phase 7.2 — Multi-Timeframe Intelligence" for the full writeup.
