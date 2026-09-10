# Phase 8.5 — Delta 6: terminal event ordering bug (found from your live screenshots)

## Bug (confirmed from Image 3)
Terminal showed: Pre-entry validation → External intelligence (RUNNING) →
Qualification → External intelligence (SUCCESS) → Execution → Learning.
Real pipeline order is: Qualification → External Intelligence (RUNNING
→ SUCCESS) → Pre-entry validation → Decision → Execution → Learning.
Several of these carried the identical displayed millisecond
(`16.41.55.788`/`.789`).

## Root cause
`emitRuntimeEvent()` is deliberately fire-and-forget (never `await`ed —
so a Learning DB write can never slow the trading cycle). That means
multiple emits fired in the correct code order are independent network
round-trips to Supabase, and can *land* (get their `created_at`) in a
different order than they were raised — especially for stages that
complete within the same millisecond. Sorting by `created_at` (DB-assigned)
was therefore unreliable exactly when it mattered most.

## Fix
Added `sequence` — an integer assigned **synchronously** by
`runAutonomousCycle`'s own per-cycle counter (`eventSequence++`), read
and incremented in true code order *before* each event's async insert
ever starts. The terminal now sorts by `sequence` within a cycle instead
of `created_at` (falls back to `created_at` only for older rows emitted
before this column existed).

## Files changed
- Migration `add_sequence_to_runtime_events` (applied live) — additive
  `integer` column + index, nothing else touched.
- `lib/ai/runtimeEvents/emit.ts` — accept/write `sequence`.
- `lib/ai/autonomousRuntime/orchestrator.ts` — one counter declared once
  per cycle, `sequence: eventSequence++` added to all 17
  `emitRuntimeEvent()` calls (mechanical, verified — grepped for every
  call site before and after, all 17 confirmed updated, no call site
  missed or double-touched). Zero decision logic changed.
- `lib/ai/runtimeEvents/repository.ts`, `useRuntimeEvents.ts` — thread
  `sequence` through the read path.
- `RuntimeTerminal.tsx` — sort by `sequence` first.

## On the other two things in your screenshots
- **Current Activity showing all 14 symbols "Idle" simultaneously**: not
  changed — this is very likely honest, not a bug. If a batch tick just
  finished for every symbol (all ending `CYCLE:SUCCESS`), all of them
  legitimately read "Idle" at once. I did not find a code path that
  fabricates this — flagging as "watch, not fixed" rather than guessing
  further without more evidence.
- **External Intelligence showing `1ms` duration for a `SUCCESS`**: also
  not changed. Plausible, non-buggy explanation: `getFundingSnapshot()`
  fetches the whole market in one bulk call and caches it — a symbol
  processed later in the same batch tick can legitimately hit that cache
  in ~1ms. Didn't touch working fetch/cache code on a guess.

## Validation
- `tsc --noEmit`: clean beyond the same confirmed environmental noise.
- Full 36-script regression: **8/8, unchanged from baseline.**
