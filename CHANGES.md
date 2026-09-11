# PHASE 8.5 — Mobile + Desktop UI/UX Polish (AI Performance / Cognitive Map / Runtime Terminal)

UI/UX only. No backend, autonomous runtime, oracle, decision-threshold, or schema changes.
No fabricated activity/prices/timestamps introduced anywhere.

## Files changed (8)
- components/ai-performance/AiPerformanceView.tsx
- components/ai-performance/CurrentActivityPanel.tsx
- components/ai-performance/ExternalIntelligencePanel.tsx
- components/ai-performance/cognitive/CognitiveMapSection.tsx
- components/ai-performance/cognitive/RuntimeTerminal.tsx
- components/intelligence/ui/useZoomPan.ts
- components/AppShell.tsx
- components/mobile/BottomNav.tsx

## Real bug found and fixed
**Two competing fixed bottom bars on the AI Performance page.** AiPerformanceView's
own in-page tab bar (Overview / AI Journal / Paper Trader / Portfolio / Performance)
and AppShell's global BottomNav (Dashboard / Earn / Wallet / Leaderboard) were both
`fixed inset-x-0 bottom-0 z-30`. Same z-index, later-in-DOM wins → the global bar
always painted over the page's own tab bar, so the in-page tab bar was fully hidden
and unusable on mobile the whole time, not just "cramped." Fixed by stacking the
in-page bar directly above the global bar (`bottom: calc(3.5rem + safe-area)`)
instead of overlapping it, and increasing the page's bottom padding so content
clears both bars.

## Problems fixed, file by file

**CognitiveMapSection.tsx**
- Graph now auto-fits the fixed 640px canvas to the real viewport width on first
  load (new `zoomPan.fitToViewport()`, additive — see below) instead of always
  opening at scale=1, which on a ~360–430px phone showed only the dead-center
  quarter of the map. Desktop (viewport ≥ 640px) clamps to scale 1, unchanged.
  Manual zoom/pan/pinch/reset still works exactly as before after the initial fit.
- Header row (`flex-wrap` description + status dot) now has `min-w-0`/`break-words`
  so the description text wraps instead of demanding its `max-w-xl` width.
- The old single "LIVE"/"IDLE" dot conflated two different truths (is polling
  succeeding vs. is anything actually active). Split into: the dot now reflects
  telemetry connectivity ("GRAPH LIVE"/"CONNECTING"), and a new line underneath
  states plainly whether there's fresh runtime activity this cycle or the system
  is just observing — both computed from the existing snapshot, nothing invented.
- Structural-edge warning list: smaller/tighter on mobile, `break-words` so long
  reasons wrap instead of running off-screen. Still shown in full — not removed.
- `min-w-0` added to both the graph pane and the Runtime Terminal column at every
  breakpoint (was `lg:min-w-0` only, so mobile flex children weren't
  shrink-constrained).
- Selected-node detail card: the `Module` path now truncates with a `title`
  tooltip instead of running unbounded.
- Card min-heights trimmed slightly on mobile (520→460 / 360→300 / 260→220) to
  cut some of the excessive vertical space without touching desktop heights.

**CognitiveGraph.tsx** — not modified. The fixed 640×640 canvas + contained
`overflow-hidden` viewport is the correct pattern for a pannable/zoomable graph;
the actual fix was giving mobile a sane *initial* scale (above), not the graph
markup itself.

**useZoomPan.ts** — additive only. Added `fitToViewport(contentWidth, padding?)`,
which computes `min(1, (viewportWidth - padding*2) / contentWidth)` and sets the
camera to that scale, centered. It's opt-in: `GlobalIntelligenceMap.tsx` (the
other consumer of this hook) never calls it, so its behavior is unchanged.

**CurrentActivityPanel.tsx**
- Mobile: compact 2-column grid instead of one tall single-column list (15
  symbols was making the card unnecessarily long). `sm:` and up reverts to the
  original single-column list.
- Added a small real-data summary — "N tracked · M active" — where N is
  `latestPerSymbol.length` and "active" counts symbols whose latest real event
  status is `RUNNING`. Nothing synthesized.
- Status label now truncates per-row (`min-w-0`/`truncate`) so long labels like
  "Idle — insufficient data" don't force the row wider than its grid cell.

**ExternalIntelligencePanel.tsx**
- `Capability` changed from one truncated comma-joined string to wrapping compact
  chips (one per capability), which was the actual overflow/cramping source on
  narrow screens. Source/Duration/Symbol are still simple label/value rows since
  they're always short. `evidenceSatisfied` semantics and the UNAVAILABLE-vs-real-
  provider truthfulness are untouched.

**RuntimeTerminal.tsx**
- Event row: the fixed component-label column (168px, larger than a third of a
  360px screen) is now 92px on mobile and 168px from `sm:` up, giving the
  truncating message span room to actually show something on narrow phones.
  Timestamp, duration, and status pill are unchanged and still always shown —
  nothing was hidden to save space.
- Expanded event detail grid: 1 column on mobile, 2 columns from `sm:` up (was
  always 2, which cramped key/value pairs on narrow screens).

**AiPerformanceView.tsx**
- Fixed the overlapping-bottom-bars bug described above.
- No changes to any KPI, metric, formula, or data source.

**AppShell.tsx / BottomNav.tsx** (shared mobile chrome, per the audit list)
- Added `overflow-x-hidden` on the main content column (`lg:overflow-x-visible`
  restores normal desktop behavior at `lg:`) as a safety net against any residual
  horizontal page overflow, since the dashboard shell had no such guard at all
  (only the separate marketing/landing page did).
- Trimmed mobile header padding (`py-3`→`py-2.5`, `pb-2.5`→`pb-2`) and BottomNav
  tab padding (`py-2.5`→`py-2`) slightly — small, deliberate vertical-space
  reduction, not a redesign.

## Mobile behavior
- No component intentionally exceeds viewport width at 320/360/390/430px; every
  flex/grid ancestor touched now has `min-w-0` where it was missing.
- Cognitive Map opens showing the whole node ring, not just the center, and pans/
  zooms from there.
- Current Activity is a compact 2-col grid; External Intelligence capabilities
  wrap as chips; Runtime Terminal rows fit without forcing horizontal scroll.
- The AI Performance in-page tab bar is now actually visible above the global
  bottom nav instead of being invisible underneath it.
- Journal table's existing `overflow-x-auto` container (contained horizontal
  scroll only, not page-wide) was already correct and untouched.

## Desktop behavior
- All `lg:` styles preserved or widened defaults reset back to their original
  values at `lg:` — multi-column terminal layout, card heights, nav padding, and
  the Journal table are all visually unchanged at desktop widths.

## Validation performed
This sandbox has no network access and no `npx tsc`/`npm run typecheck` per your
existing workflow, so I ran a static check instead (bracket/brace balance on
every touched file — all balanced) and read every changed file back in full to
check for stray JSX. **Please still run `npm run typecheck` (or `tsc --noEmit`)
and eyeball it at 320/360/390/430px + desktop on your end before shipping** —
that's the one thing I genuinely can't verify from here.

## Confirmed untouched
- No new phases/sub-phases, no architecture changes.
- No autonomous runtime, oracle, decision-threshold, or database-schema changes.
- No fabricated activity, prices, timestamps, sources, or statuses — every new
  label above ("N tracked · M active", "Fresh runtime activity this cycle",
  chips, etc.) is computed from data the components already had, not invented.
- `CognitiveGraph.tsx`, `useRuntimeEvents.ts`, and all `/api/*` routes are
  untouched.
