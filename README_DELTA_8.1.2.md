# Phase 8.1.2 — Failure Pattern Detection — Delta Package

## How to apply (GitHub web UI, no terminal)

This zip contains **6 files**, all either brand-new or append-only edits to
one existing file. Upload each one through GitHub's web UI:

### 1. New files — upload as new files (GitHub will create the folders automatically)
- `lib/ai/failurePatterns/contracts.ts`
- `lib/ai/failurePatterns/detect.ts`
- `lib/ai/failurePatterns/repository.ts`
- `scripts/phase8/failure-pattern-fixtures.ts`

In GitHub: **Add file → Upload files**, drag these 4 files in — GitHub
recreates the `lib/ai/failurePatterns/` and `scripts/phase8/` folder paths
automatically as long as you upload them with their folder structure intact
(drag the whole `lib` and `scripts` folders from the unzipped package, not
just the loose files).

### 2. Modified files — REPLACE the existing file's content
- `supabase/learning/schema.sql` — open the existing file in GitHub, click
  the pencil (Edit), select all, paste in this version. It only **appends**
  a new `failure_pattern_candidates` table at the end — every line of the
  existing `decision_experiences`/`decision_evaluations` sections is
  byte-identical to what's already in the repo.
- `CHANGES.md` — same process. Only the new "Phase 8.1.2" section was
  appended at the end; nothing above it changed.

No other files in the repo were touched. Nothing needs deleting.

## What this phase does

Adds a deterministic, offline, **observational-only** layer that scans the
existing `decision_experiences` x `decision_evaluations` history (Phase
8.1.0/8.1.1) and surfaces recurring negative decision patterns — "this
evidence tag showed up alongside a losing outcome 7 times across 4
different days for AI_SIGNAL" — as plain frequency statistics. It never
claims or implies causation, never touches trading behavior, and is not
wired to run automatically anywhere yet.

## Architecture

```
lib/ai/failurePatterns/
  contracts.ts   types only — FailurePatternObservationInput (join row),
                 FailurePatternCandidateWithoutTimestamp (pure output),
                 FailurePatternCandidate (+ computedAt, persisted shape)
  detect.ts      detectFailurePatternCandidates(observations) — pure,
                 deterministic, zero DB/LLM/fetch/Date.now/randomness
  repository.ts  getFailurePatternObservations() [read + in-memory join],
                 persistFailurePatternCandidates() [recompute-and-upsert],
                 recomputeFailurePatterns() [orchestrator]
```

Same layering as Phase 8.1.1's `decisionEvaluation/` module: pure logic
never touches a database; `repository.ts` holds 100% of the
persistence-aware code.

## Detection rules (as specified)

- Grouped by `(source, evidenceTag)` — single tag only, never combined tags.
- `AI_SIGNAL` and `ELVOID_PRO_ORACLE` are never merged into one group.
- Only rows evaluated as `GOOD_DECISION_BAD_OUTCOME` or
  `BAD_DECISION_BAD_OUTCOME` (i.e. a losing market outcome) count.
- A group needs **>= 5** qualifying occurrences to be reported at all.
- A group needs those occurrences spread across **more than one calendar
  day** — a same-day cluster, however large, is excluded.
- `confidence` scales linearly with sample size up to 30 occurrences and
  is capped at **0.7** — this module's output is never asserted as
  certain.
- Output is frequency data only: version, source, evidenceTag,
  dominantEvaluationClass, occurrenceCount, dominantClassShare,
  confidence, firstObservedAt, lastObservedAt, computedAt. No free-text
  field exists anywhere in the output shape — there's nowhere for a
  causal claim to even be written.

## Persistence

New table `failure_pattern_candidates` in the **ELVOID Learning DB** (the
same isolated Supabase project `decision_experiences`/`decision_evaluations`
already live in — never Main Supabase). Unlike `decision_evaluations`
(append-only, one row per decision forever), this table is **aggregate
state**: a recompute safely *overwrites* a group's row
(`UNIQUE(source, evidence_tag)` + upsert), never accumulates duplicates.
This is safe because the detector is pure/stateless — every call
recomputes each group from scratch from whatever data it's given.

## Not done (deliberately, per scope)

- `recomputeFailurePatterns()` is **not** called from anywhere automatically
  — no cron, no per-trade hook, no retry queue. It's callable directly for
  manual/batch use today.
- No LLM calls, no causal inference, no auto-trading, no strategy/
  confidence/risk mutation, no position sizing changes.
- `decisionOutcome`, `decisionEvaluation`, `decisionLearning/lifecycle`,
  cognitive/oracle/insights, `paperTrader.ts`, Main DB, and auth are all
  untouched.

## Verification performed

- **New fixtures**: `scripts/phase8/failure-pattern-fixtures.ts` — **16/16
  passed** (min-occurrence threshold, confidence scaling/cap, source
  isolation, same-day exclusion, multi-day acceptance, determinism, input
  immutability, closed-output-shape/no-forbidden-imports, naming-collision
  scan, negative-class-only filtering, stateless-recompute safety,
  dominant-class arithmetic, multi-tag fan-out).
- **Full existing Phase 8 regression suite re-run**: `cognitive-observation`,
  `cognitive-memory`, `cognitive-hypothesis`, `cognitive-conflict`,
  `cognitive-context`, `decision-outcome` (33/33), `learning-db-env`
  (12/12), `decision-evaluation` (36/36), `decision-learning-lifecycle`
  (21/21) — **all still pass, zero regressions**, none of their source
  files were touched this pass.
- **Typecheck**: `npx tsc --noEmit` could not run — no network access to
  `npm install` in this sandbox (same pre-existing limitation as most
  prior phases). Substituted: `node --experimental-strip-types --check`
  passed clean on all 3 new `lib/` files; the fixture run itself exercises
  `detect.ts` end-to-end through Node's TS-stripping runtime; every
  cross-module import was manually cross-checked against the real
  exported names it references. Recommend a real `tsc --noEmit` pass once
  you're back on a machine with `node_modules` installed.
- **Scope check**: `git status --porcelain` shows only
  `supabase/learning/schema.sql` (append-only) and `CHANGES.md` modified,
  plus the 4 new files. Explicit diff check against every protected path
  (`decisionOutcome`, `decisionEvaluation`, `decisionLearning`,
  `cognitive`, `oracle`, `insights`, `paperTrader.ts`, `supabase.ts`,
  `app/api`) came back empty.

Full detail, including the exact confidence-formula/tie-break rules and
all 16 fixture case descriptions, is in the new "Phase 8.1.2" section
appended to `CHANGES.md`.
