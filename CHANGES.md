# Phase 8.5 — Delta 5: AI Performance page redesign

UI-only, exactly per your freeze list. Not deployed yet — same blocker.

## Step 1 audit — what already existed (before touching anything)

- `app/ai-performance/page.tsx` (server component) already fetches from
  `getWallet()`, `getStatistics()`, `listSignals()`, `getPerformanceReport()`,
  `getJournalEntries()` — its own header comment already says: **"single
  source of truth... every number here is re-read from the exact same
  tables Portfolio, AI Journal, and Paper Trader already used — nothing
  new is computed or duplicated."** Untouched — zero changes to this file.
- `lib/elvoid/performance.ts` (`getPerformanceReport`) already computes
  real `equityCurve`, `bestCoin`/`worstCoin`, per-strategy win rate —
  untouched.
- `AiStatistics` (`ai_statistics` table) already has `win_rate`,
  `profit_factor`, `average_rr`, `max_drawdown`, `total_trade` — exactly
  the KPI strip your reference wants. Untouched.
- The site already has a real, shared, multi-page `Sidebar` (grouped:
  Intelligence / Premium / Ecosystem / System, "AI Performance" already
  in it) rendered by `AppShell` on every page — **not rebuilt**. A
  page-specific sidebar fork would have fragmented navigation across the
  rest of the app for a page-level redesign task; the existing one
  already delivers the "left sidebar with ELVOID branding" requirement
  site-wide.
- `StatCard`/`SectionHeader` (shared components, used elsewhere in the
  app) already implement a Bloomberg-terminal-style aesthetic (`<CODE
  <GO>>` header chips, `mono-num`, `glow-card`) — closer to your "quant
  terminal" target than a generic SaaS look already. Left untouched
  (not forked) to avoid an inconsistent visual split with every other
  page that reuses them.
- Delta 4's Runtime Terminal + Intelligence Graph (`CognitiveMapSection`)
  already existed on this exact page before this delta — reused as-is,
  not rebuilt a second time.

## What this delta actually changed
**3 files. Zero new backend. Zero new database reads beyond what Delta
4's `runtime_events` API already serves.**

1. **`CurrentActivityPanel.tsx`** (new) — per-symbol current status.
   Derived from the *same* `useRuntimeEvents()` hook the terminal already
   uses (Delta 4) — the most recent real event per symbol, mapped to a
   human label (e.g. `EXTERNAL_INTELLIGENCE:RUNNING` → "Fetching external
   evidence"). A symbol with **no event yet is not listed** — never shown
   as "Idle" by invention.
2. **`ExternalIntelligencePanel.tsx`** (new) — same hook, filtered to the
   most recent `EXTERNAL_INTELLIGENCE` event. Every field (`Symbol`,
   `Capability`, `Duration`, `Source`) is read verbatim from that event's
   real metadata — `Source` shows the provider name **only** when the
   event's own `evidenceSatisfied` was true at emission time (see
   Delta 4's orchestrator instrumentation); otherwise `UNAVAILABLE`. No
   URL is fabricated — `assembleExternalIntelligenceSignal`'s real return
   type has never included one.
3. **`AiPerformanceView.tsx`** (restyled, not rewritten) — added a
   command-center header bar (`ELVOID AI PERFORMANCE` + real `LIVE`
   pulse), widened the top row to 3 columns (Equity Curve, Performance
   Breakdown, Current Activity), and put External Intelligence alongside
   the existing Intelligence/Terminal section. **Every existing
   computation in this file — expectancy, allocation map, win/loss
   counts, all of it — is byte-identical to before.** No prop, no
   calculation, no number changed.

## Explicitly NOT done (honest, not silently dropped)
- **4 separate mobile route/views** — not built. This delta keeps one
  responsive page (existing `lg:grid-cols-*` breakpoints + the existing
  mobile anchor-tab bar), which already reorganizes content by priority
  on small screens rather than shrinking the desktop layout, but it is
  not 4 independently-routed mobile screens. Building those as literal
  separate views is a materially larger scope (routing, separate mobile
  state) than a same-page responsive pass — flagging rather than
  quietly half-building it.
- **Per-sub-fetch MARKET_DATA granularity** in the terminal (klines vs.
  order book as separate timed rows) — already flagged as not built in
  Delta 4's CHANGES.md; unchanged here.
- Visual polish beyond the above (deeper node-glow tuning, chart
  re-theming) was judged lower priority than shipping real, working,
  non-fabricated new panels within this delta's scope.

## Validation
- `tsc --noEmit`: zero new diagnostics beyond the same confirmed
  pre-existing environmental noise pattern as every prior delta.
- Full 36-script regression: **8/8, unchanged from baseline.**
- No `ai_statistics`/`ai_journal`/`paper_wallet` query, calculation, or
  API route touched. No Oracle/decision/learning/threshold code touched.

## Production verification (still pending deploy)
Once live: confirm the KPI strip/equity curve/breakdown still show the
exact same numbers as the current production page (proving the restyle
didn't touch the data path), and that Current Activity / External
Intelligence populate from real events once a cycle runs — empty/honest
states until then.
