# CHANGES — `/ai-performance` UI/UX Redesign (ELVOID Cognitive Runtime Command Center)

Scope: **UI/UX ONLY**. Tidak ada perubahan ke backend/API/database/schema/evolution
logic/AI logic. Semua komponen di bawah membaca dari endpoint yang **sudah ada**
(`/api/ai-performance/cognitive`) — tidak ada route baru, tidak ada schema baru,
tidak ada module/capability AI yang dikarang.

## Files touched

### New files
- **`components/ai-performance/cognitive/gauges.tsx`**
  Shared `RadialGauge` (ring) + `LinearGauge` (literal `0% ──── 100%` bar)
  presentational primitives. Pure rendering — no data, no logic.

- **`components/ai-performance/cognitive/AiCoreGrid.tsx`**
  New **AI Core** panel: a 3×3 grid re-layout of the exact same 9 modules
  already registered in `lib/ai/cognitiveMap/registry.ts` — the same data the
  Live Intelligence Graph (ring) next to it already renders. Shows a real
  `{active}/{total} Active` count. Independently polls the same read-only
  `/api/ai-performance/cognitive` endpoint every 20s (same pattern
  `CognitiveMapSection.tsx` already uses) — no new endpoint. Click a module
  tile to see its real `facts`. The registry has 9 modules but a 3×3 grid
  only has 8 outer slots once the center is reserved for the core badge, so
  the 9th (today: `oracle`) gets its own full-size tile in the row below —
  never hidden or shrunk.

- **`components/ai-performance/cognitive/EvolutionCharge.tsx`**
  New **Evolution Charge** card — the `0% ──── 100%` bar you asked for. The
  fill % is a real, derived ratio: (validation gates passed / validation
  gates evaluated) across every real evolution candidate currently observed
  — never an invented score. With no candidate yet, the bar stays empty (no
  fake percentage) and the status line shows the real `EvolutionNeed` gate
  instead (`NO_EVOLUTION_NEEDED` / `INSUFFICIENT_EVIDENCE` / `MONITOR` /
  `EVOLUTION_WARRANTED`).

### Modified files
- **`components/ai-performance/cognitive/RuntimeTerminal.tsx`**
  Reskinned to the exact bracket-log format you asked for:
  `[HH:MM:SS] [COMPONENT] message [STATUS] [SYMBOL]`, flattened into one
  continuous scrolling terminal log (previously grouped into per-cycle
  boxes). Every bracketed field is the row's own real field
  (`component`/`status`/`symbol`/`message`/`operation`) — nothing
  fabricated; `STATUS` uses the real enum (`SUCCESS`/`WARNING`/`ERROR`/
  `RUNNING`/`WAIT`/`REJECT`/`SKIPPED`/`UNAVAILABLE`), not the illustrative
  `INFO` from the spec example, since `INFO` isn't a real status in this
  system and I didn't want to misrepresent one. Same filters, same
  click-to-expand metadata, same autoscroll/"new events" button, same
  `useRuntimeEvents` hook — only the render/format changed. Header renamed
  to **ELVOID RUNTIME TERMINAL**. Empty state now reads clearly:
  *"UNAVAILABLE — no runtime events recorded yet... This terminal never
  fabricates log lines."*

- **`components/ai-performance/SelfPerformancePanel.tsx`**
  "Self Performance" bagian atas dirombak jadi **3 card utama** (per spec):
  - **AI Signal Reliability** — Confidence Average (same `avgConfidence` the
    old standalone section used; Sample Size + Best Setup + Recent W/L
    folded in, nothing dropped).
  - **Execution Performance** — Execution Rate, from `decisionPopulation`:
    real data this panel's own fetch already retrieved but never rendered
    before now. Deliberately NOT relabeled "Win Rate" — it answers a
    different question (share of decision *cycles* that resolved EXECUTE,
    not trade outcomes) from the "AI Win Rate" KPI at the top of the page.
  - **Portfolio Performance** — Return, same formula as the Portfolio
    section further down. Labeled "all-time", not "(30D)", since there's no
    30-day-windowed return computed anywhere in this codebase.

  All the existing detailed evidence (Evaluation Coverage, Novelty,
  Cognitive Gaps, Evolution Need & Proposals, Evolution Candidates +
  approval flow) is still 100% there — just moved behind a **"View Detailed
  Report"** toggle (collapsed by default) so nothing is lost, only
  decluttered.

- **`components/ai-performance/AiPerformanceView.tsx`**
  Page shell restyle: Command Center header wording, icons added to the 6
  top KPI cards (via `StatCard`'s existing `icon` prop — `StatCard.tsx`
  itself untouched), new AI Core + Evolution Charge row above the existing
  Live Intelligence Graph row, `SelfPerformancePanel` now receives
  `report`/`stats`/`wallet`/`winCount`/`lossCount` as props (all already
  server-fetched on this page — zero new fetch). The old standalone "AI
  Signal Reliability" section was removed (its numbers now live on Card A
  above); its one disclaimer sentence about the 50-trade threshold was kept
  verbatim, just relocated.

## Layout decision worth flagging
The reference image puts AI Core / Live Intelligence Graph / Evolution
Charge in one 3-column row. I split it into two rows instead — AI Core +
Evolution Charge together, then the existing Live Intelligence Graph +
External Intelligence pairing unchanged below — because the ring graph
already has its own internal ~320px terminal sidebar and was originally
sized for ~75% of its row (`3fr/1fr`). Squeezing a third sibling into that
same row would starve it at common laptop widths (~1024–1280px). This keeps
the ring graph exactly as wide as it already was; nothing about
`CognitiveMapSection.tsx` changed.

## Not touched (confirmed)
`CognitiveMapSection.tsx`, `CognitiveGraph.tsx`, `useRuntimeEvents.ts`,
`status.ts`, `StatCard.tsx`, `SectionHeader.tsx`, `LiveDot.tsx`,
`EquityCurveChart.tsx`, `CurrentActivityPanel.tsx`,
`ExternalIntelligencePanel.tsx`, `app/api/ai-performance/cognitive/route.ts`,
and every `lib/**` file — zero backend/API/DB/schema/evolution-logic/AI-logic
changes.

## How to apply
This delta zip contains ONLY the files above, at their exact real path from
the repo root — upload/replace each one via GitHub's web UI:
- `components/ai-performance/AiPerformanceView.tsx`
- `components/ai-performance/SelfPerformancePanel.tsx`
- `components/ai-performance/cognitive/RuntimeTerminal.tsx`
- `components/ai-performance/cognitive/AiCoreGrid.tsx` *(new)*
- `components/ai-performance/cognitive/EvolutionCharge.tsx` *(new)*
- `components/ai-performance/cognitive/gauges.tsx` *(new)*

## Verification done in this environment
- No `node_modules` here (matches the mobile-first zip workflow), so a full
  `next build`/`tsc` against the real project couldn't be run directly.
  Instead: every field/type/prop referenced in the new/edited code was
  cross-checked line-by-line against the real contracts
  (`lib/ai/**/contracts.ts`, `app/api/ai-performance/cognitive/route.ts`)
  and the real shared components (`StatCard`, `SectionHeader`, `LiveDot`).
  A standalone `tsc` pass (with the real `@/*` path alias wired up) was also
  run against just these 6 files — the only remaining diagnostics were
  confirmed to be artifacts of the missing `node_modules` (reproduced the
  identical error pattern on untouched, already-shipping files like
  `CognitiveGraph.tsx` and `TokenScannerView.tsx` to prove it), not real
  bugs in this change.
- Manual read-through for: brace/JSX balance (scripted check), no duplicate
  `SectionHeader` codes, no dropped data point (every value the old page
  showed is still shown somewhere), mobile stacking (every new grid only
  sets `lg:grid-cols-*`, so it's a single column below `lg:` with no extra
  work).

## Belum bisa saya verifikasi langsung
Tidak ada dev server/browser di environment ini, jadi saya tidak bisa
screenshot pixel-by-pixel. Tolong cek sekali di real deploy (Vercel
preview), khususnya:
1. Panjang label module di `AiCoreGrid` (mis. "Structure & Liquidity") pada
   layar sempit (~1024px, laptop kecil) — sudah di-`truncate` di kode, tapi
   saya belum lihat hasil render-nya langsung.
2. Kepadatan `RuntimeTerminal` kalau event real-nya banyak — belum ada data
   runtime nyata untuk saya cek volumenya di sini.
