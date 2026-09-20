# CHANGELOG — ELSTAND Intelligence

This document traces how ELSTAND Intelligence evolved — from a single
crypto dashboard into an intelligence ecosystem with ELVOID as its
decision-intelligence layer. It groups the project's real history (283
commits, `2026-07-25` → `2026-09-11`) into nine editorial phases for
readability. **The phase numbers below (Phase 1–9) are this document's own
organizing scheme, not new phase labels invented for the repo** — every
entry cites the actual in-repo version/phase label (`V1`–`V6.0`, `Phase
3.x`/`5.x`/`6.x`/`7.x`/`8.x`/`9`) exactly as it appears in commit history
and in the project's own prior changelogs, so nothing here silently
renames or reorders what actually happened.

Sources used: `git log` (full history), the project's prior
phase-by-phase engineering notes (Phase 6.5/6.6 Earn & On-chain, Phase 7
Oracle evolution, Phase 8 Cognitive/Learning/Autonomous evolution), and
the current `CHANGES.md` (Phase 8.5 UI polish delta, kept as-is —
see [Documentation](./README.md#documentation)).

---

## Project Evolution

ELSTAND started (`2026-07-25`) as a single-page crypto market dashboard —
aggregated public API data, a rule-based scoring engine, a chat panel. It
grew, phase by phase, into an ecosystem: multiple intelligence surfaces
(macro, market, order flow, on-chain, news), a full trading/execution
stack (paper and live), an on-chain token/membership layer, and — starting
around Phase 7 — **ELVOID**, a dedicated decision-intelligence layer that
turns that evidence into a graded, explainable, and (starting Phase 8.1)
self-evaluating trading decision.

---

## Phase 1 — Foundation

### What changed
The first dashboard (`V1`, `2026-07-25`–`07-26`): Top Market Overview,
Whale & Liquidity, Institutional Flow, Sector Rotation, AI Summary, and
Altcoin Scanner, backed by `lib/intelligence/shared.ts`,
`sectorRotation.ts`, `whaleLiquidity.ts`, `altcoinScanner.ts`. Auth (Google
OAuth via Supabase), the initial app shell, and the AI chat route
(`app/api/chat`) also date from this window.

### Why it mattered
This established the project's core discipline from day one: **no
fabricated data**. Sources without a free API were shown as "Waiting for
API Connection," never a placeholder number — a rule that is still
enforced across the codebase today (see [Security &
Integrity](./README.md#security--integrity) in the README).

### Result
A working single-page dashboard with a rule-based Intelligence Engine and
no dependency on any paid or unavailable API to function.

---

## Phase 2 — Market Intelligence

### What changed
- `V2` — Global Intelligence Map rebuilt around a real reasoning engine,
  `lib/intelligence/globalSentiment.ts`: Risk On / Risk Off / Neutral /
  Transition + a 0–100 confidence score, computed from Fear & Greed,
  market cap, DXY, Gold, stocks, BTC structure, altcoin momentum, and
  upcoming macro events — one engine shared by both the Market Status card
  and the map header, so the two never disagree.
- New source integrations, each gated behind an env var with graceful
  fallback: TwelveData (DXY/Gold), Finnhub (Nasdaq/S&P500/Dow via ETF
  proxy — documented as **proxy**, not real index data), CryptoPanic
  (optional news fallback).
- `V4.1` — the Map became a 3-tier interactive graph (Global Market → 6
  categories → assets), extending real data to ~40 nodes by reusing
  existing sources at finer granularity (adding tickers to an existing
  array, wrapping an existing fetch function for new pairs) rather than
  building new integrations. Nodes with no real source (DEX volume,
  Twitter, Telegram) stayed honestly labeled "Waiting for API," consistent
  with the Phase 1 rule.

### Why it mattered
A trading decision is only as good as the evidence behind it. Phase 2 is
where the evidence base stopped being "whatever the dashboard happened to
fetch" and became a deliberately broadened, source-tagged intelligence
layer — the direct ancestor of what the README now calls the [Intelligence
Ecosystem](./README.md#intelligence-ecosystem).

### Result
A market/macro/sentiment evidence base wide enough that later phases
(ELVOID's Oracle) had real, multi-source context to reason over instead of
a single price feed.

---

## Phase 3 — Trading / Decision Infrastructure

### What changed
- AI Router (`V2.9`, "Phase 3.0"): Groq (primary) → OpenRouter (fallback,
  free-tier models only) for AI chat, with a 45s cache and a hard 15s
  timeout per attempt. Zero-config-safe: with no keys set, chat still runs
  entirely on the rule-based engine.
- AI Energy System (`V3.0`, "Phase 3.2"): a real reserve-then-refund
  metering system gating three AI features (Analyze Coin, Generate
  Signal, AI Chat) — energy is spent atomically before the feature runs
  and refunded automatically on failure, so a failed AI call is never
  charged.
- Wallet Auth (git: "Phase 3.5 Wallet Auth") and an early AI Core Engine
  pass (git: "Phase 3.5 AI Core Engine") — EVM wallet connect and the
  first version of a modular AI reasoning layer (`lib/ai/core/`, 10
  narrative/analysis modules) that explicitly **never recomputes** the
  numbers the rule-based engine already finalized (confidence, grade,
  entry/SL/TP) — it only explains them.
- Paper trading, journal, and Binance integration existed and matured
  through this window (`lib/elvoid/paperTrader.ts`, `/api/ai-signals`,
  order/position/risk API routes) — Binance **Testnet** for validating
  the pipeline risk-free, Binance **Spot/Futures (Testnet or Live)** for
  real order execution once a Testnet or exchange API key is configured.

### Why it mattered
Before a decision engine can be trusted, the infrastructure around it —
metering, wallet identity, a place to log and review trades — has to
exist and be provably safe under failure (no double-charge, no phantom
trade). This phase built that scaffolding.

### Result
A working paper-trading loop with a metered AI layer that fails safe, and
a live-trading path clearly separated from it by an explicit Testnet/Live
distinction that the current README still preserves as a stated warning,
not an implementation detail buried in code.

---

## Phase 4 — ELVOID Foundation

### What changed
`lib/elvoid/engine.ts` — the rule-based signal engine — became the single
source of truth for `confidence`, `grade`, `entry`/`SL`/`TP`. The AI Core
modules built in Phase 3 formalized the rule that still governs ELVOID
today: an AI/LLM layer may narrate or reframe a decision, but it never
recomputes or overrides the deterministic values already produced. Any
numeric field an LLM returns is explicitly overwritten with the real
engine's number after the model responds — never trusted raw.

### Why it mattered
This is the paradigm shift the whole project is built on:

```
signal → decision intelligence
```

A signal is just a direction with a number attached. Decision
intelligence means a graded, risk-aware, explainable, and — as of
Phase 8.1 — evaluable decision that a person (or a judge) can trace back
through the evidence that produced it. Phase 4 is where that boundary was
drawn and enforced structurally, not just documented.

### Result
A hard architectural rule — "canonical decision numbers come from exactly
one place" — that every subsequent Oracle/Cognitive/Learning phase (5
through 8) continued to respect, verified in nearly every phase's own
changelog via `git diff --stat`.

---

## Phase 5 — ELVOID PRO / Oracle Evolution

This is ELVOID PRO's actual sub-phase history (`Phase 7.0`–`7.9`,
`2026-08-27`–`08-29`), each one adding a **context/evidence layer that
does not change the underlying decision** unless stated otherwise. All
nine sub-phases follow the same audit-first discipline: inspect what
already exists, reuse it, and add exactly one new capability.

| Sub-phase | Problem | Change | Result |
|---|---|---|---|
| **7.0 — Baseline Audit** | No one had traced the real runtime path of the Pro pipeline | Audited `/api/elvoid-pro/oracle`, confirmed Standard Elvoid AI is a fully separate system | Confirmed single source of truth per value (`gradeConfluence()` for side/confidence/grade, `buildOracleRiskPlan()` for entry/SL/TP) |
| **7.1 — Evidence Normalization** | Evidence factors existed but weren't a uniform, explicit shape | `lib/ai/oracle/evidence.ts`: pure adapter mapping each factor to a `NormalizedEvidence` record (source/direction/strength/quality/cluster) | Confluence's own decision output unaffected — verified byte-identical against a baseline snapshot |
| **7.2 — Multi-Timeframe Intelligence** | Oracle was single-timeframe only — a lower-timeframe move could be misread as a full reversal | `lib/ai/oracle/mtf.ts`: HTF/LTF context via a deterministic timeframe map, reusing the existing `getKlines()` cache | A `MtfContext` with a descriptive-only relationship classification (never LONG/SHORT itself) |
| **7.3 / 7.3B — UI Hierarchy + Regime-Aware Interpretation** | `marketRegime` was a display string, not a real classifier | `lib/ai/oracle/regime.ts`: ADX + trend-detection based `TRENDING_UP/DOWN`, `RANGING`, `VOLATILE_UNCLEAR` | Regime context feeding the insight layer, still not touching `gradeConfluence()` |
| **7.4 — Liquidity + Order Flow Intelligence** | No comparison existed between order-flow direction and what price actually did afterward | `lib/ai/oracle/liquidityOrderFlow.ts`: liquidity zones, sweep/reclaim/break/rejection classification, buying-pressure/absorption/exhaustion reads | A genuinely new analytical primitive (order-flow-vs-price-response), context-only |
| **7.5 — Scenario Engine** | `primaryScenario`/`alternativeScenario` were shallow presentation strings with no trigger or invalidation | `lib/ai/oracle/scenario.ts` | Scenarios with an explicit trigger and invalidation level, direction always inherited from the already-decided side |
| **7.6 — Contradiction Classifier** | Contradicting evidence across modules had no single reconciled view | `lib/ai/oracle/contradiction.ts`: reclassifies, does not re-detect | A `ContradictionReport` deduplicated against `confluence.contradictions` |
| **7.7 — Decision Arbitration** | No explicit read on how much the supporting evidence and the decision actually agreed | `lib/ai/oracle/arbitration.ts`: a 5-tier descriptive alignment readout | `DecisionArbitration`, still an annotation layer, not a second scoring engine |
| **7.8 — Risk Intelligence** | Risk was a single entry/SL/TP number with no surrounding context | `lib/ai/oracle/riskIntelligence.ts`: checks SL/TP proximity against Phase 7.4's liquidity zones | Richer risk context around the existing risk plan (a full multi-target TP1/TP2/TP3 redesign remained explicitly out of scope) |
| **7.9 — LLM Reasoning** | The decision had no plain-language explanation | `lib/ai/oracle/reasoning.ts`: an optional LLM narrative pass over the already-computed decision, never throws | A human-readable explanation layer with no execution or AI Energy gating attached at this stage |

### Honest, project-stated limitations from this phase
Every 7.x sub-phase's own notes record the same environment constraint:
`tsc --noEmit`/`next build` could not run to completion in the sandbox
that built them (no `npm install` network access; Google Fonts egress
blocked `next build` specifically) — each sub-phase instead relied on
deterministic, offline fixture scripts (`scripts/phase7/*.ts`) and
`git diff --stat` checks. A live smoke test against a real deployment was
recommended, in the project's own words, before considering each sub-phase
"fully verified in production." This CHANGELOG carries that caveat forward
rather than upgrading it to a clean bill of health.

---

## Phase 6 — Cognitive Intelligence

Sub-phases `8.0.1`–`8.0.5` (`2026-08-29`–`08-30`) added a downstream
observer layer over the Oracle's canonical decision — **it does not
replace or duplicate the Oracle decision**, which the project's own notes
confirm was verified structurally at every sub-phase (`canonical authority
preservation` checks appear in every one of these five entries).

| Sub-phase | What it added |
|---|---|
| **8.0.1 — Cognitive Observation** | An immutable snapshot of what the Oracle already knows, plus an honest aggregate data-quality read (`real`/`mixed`/`degraded`/`unavailable`) |
| **8.0.2 — Cognitive Working Memory** | A minimal, request-scoped, append-only container — explicitly no module-level state, no cross-request persistence |
| **8.0.3 — Cognitive Hypothesis Engine** | Deterministic reframing of Scenario/Contradiction/Arbitration into ≤3 hypotheses, each with a status and an uncertainty *level* (never a fabricated number) |
| **8.0.4 — Cognitive Conflict Resolution** | A single coherence classification (`INSUFFICIENT_CONTEXT`/`CONFLICTED`/`CAUTIOUS`/`CONSISTENT`) via deterministic precedence, not a weighted score |
| **8.0.5 — Cognitive Decision Context** | A pure assembly of the four outputs above — internal-only, not returned by the API since every field is already exposed elsewhere |

Full stage-by-stage mechanism: [`docs/ELVOID_COGNITIVE_LAYER.md`](./docs/ELVOID_COGNITIVE_LAYER.md).

**Known gap in this changelog, disclosed rather than hidden**: sub-phases
`8.3.1`–`8.3.6` (Cognitive Trace, Neural Edge Intelligence, further
memory/conflict/learning-loop modules — commits `2026-09-05`–`09-07`) exist
in git history but no prior engineering note was ever written for them;
the project's own Phase 8.3.7 entry flags this exact gap. This document
does not backfill invented detail for those six sub-phases — see [Needs
Verification](#needs-verification) below.

---

## Phase 7 — External Intelligence

Layered in incrementally rather than as one block:

- **Macro** — `lib/macro.ts` (FRED: DXY proxy, M2 supply, 10-Year
  Treasury, Fed Funds target range; US Treasury Fiscal Data API for
  national debt) and the Phase 8.2.3 "Macro Intelligence Integration" that
  wired macro context directly into the autonomous decision path.
- **News / Economic Events** — NewsAPI.org feed, ForexFactory economic
  calendar, and Phase 8.2.4's "News & Economic Event Impact Engine" —
  which deliberately reports `impactDirection: null` when it cannot
  honestly compute one, rather than guessing.
- **On-chain / Web3** — Alchemy whale-transfer feed (curated ERC-20
  watchlist), DefiLlama stablecoin supply, and BSC Testnet contract
  events (ELS token, faucet, swap/sell, rewards, escrow — see
  [Web3 / BNB Chain](./README.md#web3--bnb-chain)).
- **ELSTAND PREMIUM** (`V5.0`) — a second, non-trading intelligence
  destination (macro regime + altcoin screener + FOMC/news), explicitly
  named differently from "ELVOID PRO" per the project's own naming
  discipline, reusing existing data sources at zero additional fetch cost
  where possible.

### How this extended decision context
Every one of these sources feeds the same evidence base ELVOID's Oracle
and Cognitive layer read from — external intelligence didn't replace
market/order-flow evidence, it widened what "evidence" could mean before
a decision is graded.

---

## Phase 8 — Outcome & Learning

This is the project's most safety-relevant phase, and the one the audit
task specifically asked to get right.

```
Decision → Outcome → Evaluation → Failure Pattern → Adaptive Constraint
         → Learning Validation → Future Reasoning
```

**IMPLEMENTED**, confirmed wired into the autonomous runtime as of this
audit:

- **8.1.0 — Decision Outcome Capture.** A decision-time snapshot persisted
  to an isolated ELVOID Learning Database (a separate Supabase project —
  no cross-project SQL foreign key to main DB, ever). Outcome fields are
  written at most once, via a conditional `UPDATE ... WHERE outcome_result
  IS NULL` — a record is what ELVOID knew at decision time, never a
  retroactive rewrite.
- **8.1.1 (+ 8.1.1.1 wiring) — Decision Evaluation.** Pure, per-decision
  evaluation — no cross-decision inference, no causal claim.
- **8.1.2 — Failure Pattern Detection.** Frequency observations only: an
  evidence tag co-occurring with a negative outcome, minimum 5 qualifying
  occurrences across more than one calendar day, or it isn't persisted at
  all. Never states causality.
- **8.1.4 — Adaptive Constraint Generation** and **8.1.5 — Learning
  Validation.** Deterministic, priority-ordered rule engines building on
  8.1.2's output.
- **Orchestration (Phase 8.2.9 §7, `lib/ai/autonomousRuntime/learningRefresh.ts`).**
  Sequences the three recompute functions above in the required order,
  guarded by the same lock that protects the autonomous trading batch —
  confirmed by this audit to actually run inside
  `lib/ai/autonomousRuntime/orchestrator.ts`, not just exist as standalone
  modules.
- **8.2.1–8.2.9 — Autonomous Decision Infrastructure.** Decision
  traceability, a qualification engine, pre-entry market validation, and
  finally (8.2.9) the full autonomous background runtime — one EXECUTE/
  WAIT/REJECT decision per watchlist symbol per cycle, **paper-trade only**
  per the project's own explicit confirmation at that phase.
- **8.3.7 / 8.3.8 — Cognitive Replay & Causal Graph.** Read-only
  reconstruction of a historical decision cycle, and a causal-lineage
  engine that only ever draws an edge from verbatim field copy-forward, a
  real database join, or a cited unmodified code branch — never from
  naming or timestamp correlation alone. Every rejected candidate is
  returned with an explicit reason rather than silently dropped.

**EXPERIMENTAL** — present in the codebase, referenced by the autonomous
runtime, but explicitly *not* fully wired end-to-end per the project's own
notes:

- **8.1.3 — Decision Memory.** The project's own record is explicit:
  "Read-only — zero write path," "Not wired anywhere — callable
  infrastructure only." It also cannot ever be replayed historically
  (8.3.7's own limitation note): re-querying current memory state for a
  past cycle would present current state as historical fact, which the
  Cognitive Replay module explicitly refuses to do.
- **Autonomous-learning lifecycle classification** (`lib/ai/autonomousLearning/lifecycle.ts`,
  Phase 8.2.8). The project's own note: "currently has zero callers
  anywhere in the app... not wired into any route/cron/UI."

This project has never described any of the above as "fully autonomous
self-learning AI," and this document doesn't either — every stage above is
a deterministic, auditable function with a documented boundary, not a
model that decides its own scope.

---

## Phase 8.x — Controlled Self-Evolution

**8.6.1 (`2026-09-14`) — Novelty Detection + Self Performance Monitor.**
The first real implementation against this roadmap: the observation/
foundation layer only (`Monitor`/`Detect` below), never the
propose/apply steps. Two new, read-only, observation-only modules:

- **Self Performance Monitor** (`lib/ai/selfPerformance/`) — a
  read-only aggregate over the existing `decision_evaluations` +
  `decision_experiences` population (reusing Decision Memory's own
  join, `getDecisionMemoryJoinedExperiences()`, rather than a new query
  shape). Reports evaluation coverage (`COMPLETE`/`PARTIAL`/
  `INSUFFICIENT_DATA`, gated on the same `MIN_OCCURRENCE_COUNT` bar as
  8.1.2) and the distribution of the 4 existing evaluation axes
  (`evaluationClass`/`decisionQuality`/`marketOutcome`/
  `confidenceAlignment`) per (source, symbol). Deliberately reports no
  single "accuracy"/"score" — the two outcome axes stay independent, per
  8.1.1's own original reasoning.
- **Novelty Detection** (`lib/ai/noveltyDetection/`) — a pure,
  deterministic classifier (`FAMILIAR`/`PARTIALLY_FAMILIAR`/`NOVEL`/
  `INSUFFICIENT_MEMORY`/`UNAVAILABLE`) over Decision Memory's own
  already-computed `matchedExperiences`/`matchedPatterns` counts. No
  embeddings, no similarity score, no ML/LLM judgment — every threshold
  reused directly from 8.1.2's `MIN_OCCURRENCE_COUNT`, never a newly
  invented number. Fixed a real, pre-existing gap while building this:
  `describeLearningInfluence()` (`lib/ai/autonomousRuntime/orchestrator.ts`)
  previously returned the identical `null` for "no memory context" and
  for "memory context existed but genuinely matched nothing" — the two
  are now distinguished.

Both modules are read by exactly one place — the `AI Performance` API
route (`app/api/ai-performance/cognitive/route.ts`) and its new
"Self Performance & Novelty" panel — and by nothing else. Neither is
read by qualification, arbitration, execution, or risk. `Decision Memory`
remains query-time-only (8.1.3's own limitation, unchanged): a novelty
result describes the current retrieval, never a historical record of
what a past decision looked like at the time it was made.

**Still entirely unimplemented** after 8.6.1: everything past
`Monitor`/`Detect` below — deciding a gap is worth acting on, proposing
a change, testing it against Cognitive Replay, protecting via regression,
and the mandatory human-approval gate. No code anywhere lets ELVOID or
ELSTAND propose or apply a change to its own logic; 8.6.1 only gives a
future such step something real to observe.

**8.6.2-8.6.4 (`2026-09-14`) — Familiarity/Pattern Retrieval, Cognitive
Gap Detector, Reasoning Gap Detection, Evolution Need Evaluator,
Self-Evaluation Engine, Evolution Proposal Engine.** Extends the
observation layer up through `Decide`/`Propose` below — still never
`Test`/`Protect`/`Human Approval`/apply. Five new, read-only or
propose-only modules, all evidence-gated, none wired into decision
qualification/arbitration/execution/risk:

- **Familiarity + Cognitive Gap Detector** (`lib/ai/cognitiveGap/`) —
  familiarity reuses 8.6.1's `classifyNovelty()` verbatim (no second
  memory system), plus one derived field (`relevantEvidenceTags`, the
  distinct `EvaluationEvidenceTag`s across matched evaluations). Gap
  detection counts already-persisted `decision_evaluations.evidence`
  tag frequency (e.g. `CONFLICTED_STATE_PRESENT`,
  `REJECTED_HYPOTHESIS_PRESENT`) across a population — it derives
  nothing decisionEvaluation/evaluate.ts didn't already compute once,
  deterministically, per decision. 6 categories, gated at
  `MIN_OCCURRENCE_COUNT` (reused, never redefined):
  `CONTRADICTION_GAP`/`CONTEXT_GAP`/`REASONING_CONSISTENCY_GAP`/
  `CONFIDENCE_ALIGNMENT_GAP`/`EVIDENCE_GAP`/`PATTERN_GAP`. Deliberately
  6, not 7 — a `MEMORY_GAP` category was considered and dropped: the
  only familiarity signal available is a single current-cycle read (no
  persisted historical novelty trail exists), which can never honestly
  satisfy the "repeated evidence" bar every other category must clear.
- **Reasoning Gap Observation** (`lib/ai/reasoningGap/`) — a pure
  narrative filter/relabel over the 4 reasoning-related gap categories
  (not a second detector), using the required hedged vocabulary
  ("Observed reasoning gap", "Candidate reasoning weakness") and never a
  causal claim.
- **Evolution Need Evaluator** (`lib/ai/evolutionNeed/`) — a
  deterministic gate (`NO_EVOLUTION_NEEDED`/`INSUFFICIENT_EVIDENCE`/
  `MONITOR`/`EVOLUTION_WARRANTED`). Coverage-first (conservative when
  `EvaluationCoverageStatus === INSUFFICIENT_DATA`); a single
  low/medium-severity gap alone is never enough for
  `EVOLUTION_WARRANTED` — that requires either one HIGH-severity gap or
  2+ independently-active categories, and checks whether an existing
  `VALID` `constraint_validations` row already covers the (source,
  symbol) pair first.
- **Self-Evaluation Summary** (`lib/ai/selfEvaluation/`) — a pure
  composition tagging every field `OBSERVED`/`INFERRED`/`UNKNOWN`.
  `historicalNovelty` is always `UNKNOWN`, always `null` — never
  reconstructed.
- **Evolution Proposal Engine** (`lib/ai/evolutionProposal/`) — drafts a
  structured, non-executable proposal ONLY when
  `need === "EVOLUTION_WARRANTED"`. `proposalId` is a deterministic
  composite key (`source:symbol:gapCategory`), not a random UUID, so
  re-detecting the same gap updates rather than duplicates a proposal.
  `status` is closed to `DRAFT`/`AWAITING_VALIDATION` —
  `APPROVED`/`ACTIVE`/`DEPLOYED` do not exist as values anywhere.
  `proposedChange` always describes an investigation
  ("Investigate whether... validate through historical replay before
  considering any production change"), never a directly-executable
  instruction (no "change threshold from X to Y"). New table
  `evolution_proposals` (`supabase/learning/schema.sql`) — additive,
  service-role-only, no policies, same as every other table in this
  schema. `persistEvolutionProposals()` exists and is independently
  testable but is NOT called from the read-only AI Performance route or
  anywhere else yet — proposals are computed for display only in this
  pass, matching every prior Phase 8 "callable but not automatically
  wired" recompute function.

All five surface through the same `AI Performance` route and
"Self Performance & Novelty" panel 8.6.1 introduced — no new page, no
new route. UI language is deliberately "candidate"/"observed"/
"proposed"/"awaiting validation"; nothing claims "AI improved itself" or
shows a self-evolving badge.

**8.6.5-8.6.6 (`2026-09-14`) — Improvement Proposal Execution + Replay
Validation, Versioned Learning Validation + Regression Guard.** Extends
the observation/propose layer through `Implement Candidate`/`Replay`/
`Version Validation`/`Regression Guard` — still stops at
`Await Human Approval`, never applies anything. Forensic audit finding
that shaped this pass: `lib/ai/cognitiveReplay` (8.3.7) is a read-only
RECONSTRUCTION of a single already-recorded cycle, never a "run
different logic" engine, and no execution engine anywhere in this
repository can run a hypothetical modified decision rule against
history — building one would mean writing and running real candidate
code, explicitly forbidden. An `EvolutionCandidate` is therefore NOT a
counterfactual re-execution; it is a **split-history replication
check**: the exact same pure 8.6.1/8.6.2 functions
(`computeEvaluationCoverage`, `aggregatePerformance`,
`detectCognitiveGaps`) are run once on the older half and once on the
newer half of the same historical (source, symbol) population,
comparing whether the targeted gap's evidence rate fell (one axis) and
whether any OTHER gap category became active in the newer half (the
regression axis) — never a counterfactual, never claimed as proof.

- **Evolution Candidate + Replay Engine** (`lib/ai/evolutionCandidate/`)
  — `checkCandidateScope()` (a fixed forbidden-keyword scan of
  `hypothesis`/`proposedChange` only — never `validationRequirements`,
  which safely mentions qualification/arbitration as a human-review
  reminder) runs BEFORE any historical data is read, so an out-of-scope
  proposal never reaches replay at all. `status` is closed to
  `CANDIDATE_CREATED`/`REPLAYING`/`REPLAY_PASSED`/`REPLAY_FAILED`/
  `VALIDATION_BLOCKED` — the first two are never actually produced by
  this fully-synchronous implementation (documented, not silently
  dropped). `candidateId` is deterministic
  (`candidate:<proposalId>`), never random.
- **Versioned Learning Validation + Regression Guard**
  (`lib/ai/evolutionValidation/`) — `result` closed to
  `VALID`/`INVALID`/`INSUFFICIENT_EVIDENCE`/`INCONCLUSIVE`. Regression is
  checked on exactly one honestly-measurable axis: did MORE gap
  categories (other than the one targeted) become active in the newer
  window than the older one — if so, `INVALID` with
  `regressionDetected: true`, even when the targeted metric itself
  improved ("improvement yang naik tetapi merusak yang lain" never
  becomes `VALID`). `VALID` means only "the targeted gap's rate fell and
  nothing else regressed" — never "apply this". Qualification/
  arbitration/risk/execution invariants report `true` because nothing in
  either new module ever imports from those modules, by construction
  (verified by static-scan fixtures, not re-tested at runtime); source/
  symbol isolation ARE empirically checked against the candidate's own
  replay data.

Two new tables, kept deliberately separate to preserve the 8.6.5/8.6.6
architectural boundary even though both live in the same database:
`evolution_candidates` (8.6.5's own writes) and `evolution_validations`
(8.6.6's own writes, linked by `candidate_id`). Neither is written from
the read-only AI Performance route — both are computed fresh on every
request and persisted only when explicitly called, matching every prior
Phase 8.6 "callable but not automatically wired" convention.

Surfaced in the same "Self Performance & Novelty" panel as a new
"Evolution Candidates" section — `Candidate #<id>` / `Gap:` / `Proposal:`
/ `Baseline:` / `Candidate:` / `Replay:` / `Regression:` / `Evidence:` /
a result badge reading "Validated candidate — awaiting human approval" /
"Blocked (out of scope)" / "Insufficient evidence" / "Inconclusive" —
never "AI EVOLVED", "SELF-IMPROVED", or "SUPER AI". **Superseded by
Phase 8.6.5b:** "Validated candidate" overstated what a split-history
result shows and is no longer used anywhere in the UI — see the
Phase 8.6.5b entry at the end of this file.

```
Monitor → Detect → Decide → Propose → Test  → Protect → Human Approval
           \_____8.6.1_____/\___8.6.2-8.6.4___/\____8.6.5-8.6.6____/
```

Any future self-evolution work (8.6.7) is expected to require:
- **Human approval** as a hard gate before any self-modification takes
  effect — not an optional review step. This is the ONLY item left on
  this list after 8.6.5-8.6.6: replay validation, regression guard, and
  versioning now have real, evidence-gated implementations (above).
- **Execution/promotion** — a Git branch, commit, push/PR, CI run, and
  final promotion, none of which exist anywhere in this repository yet.

The system today produces `VALID`/`INVALID`/`INSUFFICIENT_EVIDENCE`/
`INCONCLUSIVE` candidates, awaiting a human, but does not itself
approve, execute, promote, or apply any change to its own reasoning —
`Human Approval` and everything after it (Git/PR/CI/deployment) remain
a direction, not a capability.

---

## Phase 9 — Product & Production Hardening

`2026-09-08`–`09-11`: focused on readiness and polish, not new
intelligence features.

- **Phase 8.5 (Deltas 1–6) — Mobile + Desktop UI/UX Polish.** AI
  Performance, Cognitive Map, and Runtime Terminal views fixed for real
  layout bugs (documented in the existing `CHANGES.md` — e.g. two
  competing fixed bottom bars on mobile silently hiding the in-page tab
  bar). Explicitly UI-only: no backend, autonomous runtime, Oracle,
  decision-threshold, or schema changes, and no fabricated
  activity/prices/timestamps introduced.
- **Phase 9 — Landing Implementation** and **Phase 9 — Settings
  Appearance**, plus a final cleanup pass ("Remove obsolete settings
  sections") — the last commits in the current history
  (`2026-09-11`).
- The README and this CHANGE.md itself are part of this same hardening
  pass — documentation brought in line with what the code actually does,
  including correcting an earlier README's undersold "deferred" status
  for the Phase 8.1.x learning modules (see [Current
  State](#current-state) below).

---

## Current State

### Implemented
- Macro / Market / Order Flow / Web3 / External data aggregation
- ELVOID PRO Oracle (7.0–7.9): confluence, MTF, regime, liquidity/order
  flow, scenario, contradiction, arbitration, risk intelligence, optional
  LLM narrative
- Cognitive Layer (8.0.1–8.0.5): observation, working memory, hypotheses,
  conflict resolution, decision context
- Decision Outcome Capture + isolated Learning Database (8.1.0)
- Decision Evaluation, Failure Pattern Detection, Adaptive Constraint
  Generation, Learning Validation — orchestrated as one sequence (8.1.1,
  8.1.2, 8.1.4, 8.1.5 + 8.2.9 §7)
- Autonomous background runtime, paper-trade only (8.2.1–8.2.9)
- Cognitive Replay and Causal Graph, evidence-proof-only (8.3.7, 8.3.8)
- Self Performance Monitor + Novelty Detection (8.6.1) — read-only
  observation layer only; not read by any decision-making path
- Cognitive Gap Detector, Evolution Need Evaluator, Evolution Proposal
  Engine (8.6.2-8.6.4) — evidence-gated observation + propose-only
  layer; drafts structured, non-executable proposals but never applies
  them, never read by any decision-making path
- Evolution Candidate + Replay Engine, Versioned Learning Validation +
  Regression Guard (8.6.5-8.6.6, hardened by 8.6.5b) — an
  OBSERVATIONAL split-history check (never counterfactual code
  execution; `counterfactualAvailable` is always `false`),
  evidence-gated VALID/INVALID/INSUFFICIENT_EVIDENCE/INCONCLUSIVE/
  NOT_APPLICABLE results; never applies, approves, or promotes anything,
  never read by any decision-making path
- Paper trading, live trading (Binance Testnet/Live), journal
- On-chain membership gating, ELS token, faucet, swap/sell, reward
  distributor, Bug Hunter escrow (all BSC Testnet)

### Experimental
- Decision Memory retrieval (8.1.3) — built, read-only, confirmed not
  wired into any live decision path
- Autonomous-learning lifecycle classification (8.2.8) — built, zero
  callers in the app today
- Cognitive Trace / Neural Edge Intelligence (8.3.1–8.3.6) — present in
  git history, no engineering note was ever written for them; scope not
  independently re-verified in this pass (see below)

### Roadmap
- Controlled Self-Evolution (Monitor→Detect→Decide→Propose→Test→Protect→Human
  Approval) — as of 8.6.6, every step through `Protect` (regression
  guard) has a real, evidence-gated implementation (Self Performance
  Monitor, Novelty Detection, Cognitive/Reasoning Gap Detection,
  Evolution Need Evaluator, Evolution Proposal Engine, Evolution
  Candidate + Replay Engine, Versioned Learning Validation + Regression
  Guard); only `Human Approval` and everything after it (execution,
  Git branch/commit/push/PR, CI, version promotion — Phase 8.6.7)
  remain design direction only, no implementation
- Mainnet deployment (all contracts are BSC Testnet only today)
- Cross-chain support beyond BNB Smart Chain
- Full multi-target (TP1/TP2/TP3) risk-plan redesign — explicitly deferred
  since Phase 7.8

### Needs verification
- Sub-phases 8.3.1–8.3.6 (Cognitive Trace, Neural Edge Intelligence):
  present in commit history (`2026-09-05`–`09-07`) but never documented in
  any prior changelog. This pass did not reverse-engineer or re-audit
  their source directly — flagged here rather than silently assumed
  complete or silently omitted.
- Live-network verification: nearly every Phase 7/8 sub-phase's own notes
  state that `tsc --noEmit`/`next build` could not run to completion in
  the sandbox that built them, and recommend a live smoke test before
  production reliance. No evidence in this repository confirms that
  live smoke test was subsequently performed.

---

## Key Engineering Lessons

- **More data does not automatically mean better decisions.** Phase 2
  through Phase 7 each added a new evidence source or context layer, but
  every one of them was built as a read-only *input* to grading — never a
  second scoring engine. The project's discipline of re-verifying
  `gradeConfluence()`'s output was byte-identical after each addition (via
  baseline snapshot diffs) is what kept "more evidence" from silently
  becoming "more ways to accidentally change the decision."
- **A signal without evidence is insufficient.** Phase 7.1's Evidence
  Normalization step existed specifically because a confluence factor with
  no explicit source/quality/cluster tag can't be reasoned about later —
  it can only be trusted or not trusted as a whole.
- **Confidence should not be confused with certainty.** The Cognitive
  Hypothesis Engine (8.0.3) enforces this by construction: uncertainty is
  always a level (`LOW`/`MEDIUM`/`HIGH`), never a number dressed up as
  precision the underlying evidence doesn't actually support.
- **Contradicting evidence needs explicit handling, not averaging.** The
  Contradiction Classifier (7.6) and Conflict Resolution (8.0.4) both
  exist because silently netting opposing signals into one number hides
  exactly the disagreement a decision-maker most needs to see.
- **Outcomes are necessary to evaluate decisions.** Nothing in Phases 1–7
  could tell you whether a decision was actually good — that required
  building Decision Outcome Capture (8.1.0) as its own persistence layer
  first, deliberately isolated from the main database so a learning
  experiment could never corrupt production auth/journal data.
- **Learning requires validation and regression protection.** Every
  8.1.x/8.2.x module shipped with its own fixture suite, and every
  subsequent phase re-ran all prior fixtures before proceeding (documented
  pass/fail counts in every entry). Phase 8.1.2's Failure Pattern Detection
  specifically refuses to persist a pattern below a minimum occurrence
  count — a small sample size is treated as "not learned yet," not as a
  weak signal worth keeping anyway.
- **Autonomous behavior needs boundaries and human oversight.** The
  autonomous runtime (8.2.9) is paper-trade only by explicit project
  decision, and every module capable of influencing a future decision
  (constraints, validation, memory) sits behind a documented authority
  boundary confirming it cannot bypass or duplicate the canonical Oracle
  decision. Controlled Self-Evolution — the one place where the system
  would modify its own logic — is designed (not built) around a mandatory
  human-approval gate for exactly this reason.

---

## Current Architecture Direction

```
Data → Evidence → Intelligence → Reasoning → Decision → Outcome → Evaluation → Learning
```

This loop — not any single feature — is ELSTAND Intelligence's actual
direction. Phases 1–3 built the Data/Evidence foundation. Phases 5–6 built
Reasoning (Oracle + Cognitive Layer) on top of that evidence. Phase 8 closed
the loop by adding Outcome, Evaluation, and Learning — turning a one-shot
decision engine into one that can, within a deterministic and auditable
boundary, account for what actually happened after it decided. Phase 8.x
(Controlled Self-Evolution) is where that loop would eventually be allowed
to change the system's own logic, gated behind human approval — and is the
clearest boundary between what ELSTAND Intelligence does today and what it
is designed, but not yet built, to do next.

---

## Phase 8.2.2.1 — Learning-Loop Correction (Post-Forensic-Audit)

*Added after this document's `2026-09-11` cutoff — not yet folded into the
nine-phase narrative above. Recorded here per this correction's own
validation requirements rather than left undocumented.*

### Confirmed root cause
Two independent forensic audits, plus a corrective-design audit, converged
on the same finding: `lib/ai/decisionQualification/qualify.ts`'s
`hasNegativeMemorySignal()` treated a single, unbounded-age negative
`decision_evaluations` row as sufficient, on its own, to set
`qualification.status = "CONFLICTED"` — which `decideAutonomous()` turns
directly into `REJECT`. The feeding `queryDecisionMemory()` call
(`autonomousRuntime/orchestrator.ts`) carried no `since`/`limit`. Live
Learning DB data (read-only query, `2026-09-17`) showed this was not
theoretical: 82.9% of REJECTs in a 7-day/1,275-cycle window traced to this
one mechanism, with 22 of 28 tracked `(symbol, side)` pairs already
permanently affected by single trades up to 17 days old. The separate,
properly-designed adaptive-constraint/learning-validation system
(`lib/ai/failurePatterns`, `lib/ai/adaptiveConstraint`,
`lib/ai/learningValidation`) was confirmed NOT the cause — it had produced
exactly one constraint in the project's history, flagged `OVERFIT_RISK`,
and had never once been the deciding factor (`CAUTION` occurred 0/1,275
times in the same window).

### Corrective design
A five-state, sample-size- and freshness-aware read on the raw
`matchedEvaluations` population (`NegativeMemoryState`:
`INSUFFICIENT_EVIDENCE` / `FAMILIAR_NEGATIVE` / `CURRENT_NEGATIVE_EVIDENCE`
/ `STALE_MEMORY` / `MIXED_EVIDENCE`), replacing the old bare existence
check, while leaving the already-thresholded `matchedPatterns` signal
(Phase 8.1.2) untouched. Full design rationale, alternatives considered,
and the six-way concept separation (negative memory / adaptive constraint
/ risk block / market context block / insufficient context / rejected
decision observation) are in the corrective-design report produced ahead
of implementation (not committed to this repository).

### P0 implementation — DONE
- `lib/ai/failurePatterns/detect.ts` — added `POSITIVE_EVALUATION_CLASSES`
  (additive; `detectFailurePatternCandidates()`'s own behavior unchanged).
- `lib/ai/decisionQualification/contracts.ts` — added `NegativeMemoryState`,
  `NegativeMemoryEvaluation`, and three new, locally-scoped, explicitly
  PROVISIONAL constants (`NEGATIVE_MEMORY_MIN_OCCURRENCE_COUNT = 5`,
  `NEGATIVE_MEMORY_FRESHNESS_WINDOW_DAYS = 30`,
  `NEGATIVE_MEMORY_DOMINANCE_SHARE_THRESHOLD = 0.95` — each a citation of
  an existing repository convention for the same shape of question, not
  an independently-proven value for this new use — see the constants'
  own doc comments). `AutonomousQualificationResult.version` bumped
  `1 -> 2` for the additive `negativeMemory` field; every existing field's
  meaning is unchanged. Also corrected a stale "UNWIRED" header comment
  in the same file (accurate when Phase 8.2.2 first shipped, stale since
  Phase 8.2.9 wired it in — corrected while already editing this file,
  not a separate change).
- `lib/ai/decisionQualification/qualify.ts` — replaced
  `hasNegativeMemorySignal()` with `evaluateNegativeMemorySignal()` and
  its supporting pure functions. `QualificationSignals.negativeMemorySignalPresent`
  keeps its exact original boolean type and meaning; only how it is
  computed changed (`matchedPatternPresent || state === "CURRENT_NEGATIVE_EVIDENCE"`
  instead of a bare `.some()`).
- `lib/ai/autonomousRuntime/orchestrator.ts` — `queryDecisionMemory()` is
  now called with a `since` bound (`asOf` minus
  `NEGATIVE_MEMORY_FRESHNESS_WINDOW_DAYS`), a defense-in-depth,
  payload-size measure; the primary correctness fix is `qualify.ts`'s own
  `evaluatedAt`-based freshness check, which this bound can only ever be
  equal to or looser than (see the inline comment at the call site for
  why). `matchedPatterns` is unaffected by `since` (confirmed against
  `decisionMemory/contracts.ts`'s own documented query semantics).
- Fixtures: `scripts/phase8/decision-qualification-fixtures.ts` — updated
  two existing cases whose expected outcome intentionally changed (a
  single negative evaluation no longer reaches `CONFLICTED` — that was
  exactly the defect), and added a 16-case matrix (section 21) covering
  every dimension this correction was required to handle: zero evidence,
  stale-only evidence, single recent evidence, a genuinely repeated
  current-negative population (confirmed still reaching `CONFLICTED`),
  repeated stale evidence, small mixed evidence below the occurrence
  floor, positive-dominated mixed evidence, negative-dominated evidence,
  source isolation, the occurrence-count boundary, the freshness-window
  boundary, the `negativeShare` formula, `matchedPatterns`'s continued
  independence from this change, determinism, and input immutability.
  Three other fixture scripts (`external-intelligence-gate-fixtures.ts`,
  `pre-entry-validation-fixtures.ts`, `autonomous-decision-fixtures.ts`)
  were updated only to keep their own, unrelated `qualification()` mock
  builders structurally valid against the new required field/version —
  none of their actual assertions changed.

### Validation status — CORRECTED, RE-RUN FOR REAL (see Phase 8.6 P1's own entry below)
The paragraph originally here said the fixture script and `tsc` could not
be executed in this sandbox. That was wrong, and was corrected in the
same working session as Phase 8.6 P1 below, before either phase shipped
to the user: this sandbox has no outbound network and no installed
`node_modules`, but Node 22 and a global `tsc` ARE both present, and
neither is needed to run a file that imports no actual npm package.
Every fixture file this phase touches imports only other files under
`lib/ai/` — none of them import `@supabase/supabase-js` or anything
else from `node_modules`. Actually run:

```
node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-qualification-fixtures.ts
# -> 40 passed, 0 failed
node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/autonomous-decision-fixtures.ts
# -> 25 passed, 0 failed
node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/external-intelligence-gate-fixtures.ts
# -> all fixtures passed
node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/pre-entry-validation-fixtures.ts
# -> 25 passed, 0 failed
```

`tsc --noEmit -p tsconfig.json` was also actually run (global `tsc`,
still no `node_modules`). As expected, it reports ~11,000 errors
project-wide — all `TS2307`/`TS2591` "cannot find module
next/server|react|viem" / "cannot find name process|crypto|Buffer",
the exact, uniform signature of missing `node_modules`/`@types/node`,
identical across files this phase never touched. Filtered to only the
files this phase changed
(`lib/ai/decisionQualification/{contracts,qualify}.ts`,
`lib/ai/failurePatterns/detect.ts`,
`lib/ai/autonomousRuntime/orchestrator.ts`, all four fixture files):
every remaining error is that same missing-node_modules signature —
**zero** type errors of any other kind (no `TS2339`/`TS2322`/`TS2345`/
`TS2741` — no property mismatch, no assignability error, no missing
required field) in any of them. `npm run build` itself still was not
attempted (needs the full `next`/React toolchain from `node_modules`,
which is genuinely not installed) — that step remains for the real
environment.

### P1 (Decision Population Observation, 8.6.1/8.6.2/8.6.4 wiring) and P2
(confluence-source attribution) — NOT YET IMPLEMENTED. Designed, not
built. See the corrective-design report.

### Known limitations after P0 alone
- 8.6.1–8.6.6 remain unable to observe REJECT/WAIT decisions at all
  (that is P1's scope, not P0's) — this correction fixes the qualification
  defect itself, not the self-improvement pipeline's blind spot to it.
- The three PROVISIONAL constants above are starting baselines, not
  calibrated values — see the corrective-design report's calibration
  requirements before treating them as final.
- Setup-vs-execution/context attribution (P2) is unchanged.

### 8.6.5–8.6.7
Status correction (Phase 8.6.5b): this entry originally described all
three as unimplemented. **8.6.5–8.6.6 were already implemented** (see the
"8.6.5-8.6.6" entry under Phase 8.x, commit `a17dbd0`) and are untouched
by P0's own changes; **8.6.7 (Human Approval Gate) remains unimplemented.**
ELVOID's self-improvement capability remains a **controlled
self-improvement proposal pipeline** with **human-gated evolution** —
observation, gap detection, proposal drafting, and observational
replay/validation only; no production decision logic can be auto-modified by
anything in `lib/ai/cognitiveGap`, `lib/ai/reasoningGap`,
`lib/ai/evolutionNeed`, `lib/ai/evolutionProposal`,
`lib/ai/evolutionCandidate`, or `lib/ai/evolutionValidation`, confirmed
again by this phase's own repository-wide import/keyword scan (no match
for any auto-promotion, Git-push, deployment, or messaging mechanism in
any of those directories).

---

## Phase 8.6 P1 — Decision Population Observation + 8.6 Wiring

*Builds on Phase 8.2.2.1 (P0) above. P0's files/behavior are unchanged by
this phase — confirmed by `git diff` showing no further edits to
`qualify.ts`/`decisionQualification/contracts.ts`/`failurePatterns/detect.ts`
beyond what P0 already delivered.*

### Problem this phase closes
`decision_experiences`/`decision_evaluations` (the population
`lib/ai/selfPerformance` and `lib/ai/cognitiveGap` already read) are
EXECUTE-only — `lib/ai/autonomousExecution/execute.ts`'s
`SKIPPED_WAIT`/`SKIPPED_REJECT` paths never write one. WAIT/REJECT
decisions were invisible to 8.6.1/8.6.2 before this phase.

### Architecture (files added/changed)
- `lib/ai/decisionPopulation/{contracts,observe,repository}.ts` (new) —
  read-only observer. Source of truth: `runtime_events`'
  `component: "DECISION"` rows (Phase 8.5), NOT `cognitive_trace` —
  verified during this phase that neither `cognitive_trace` nor
  `decision_traces` actually persists `qualification.status`/
  `preEntry.status` as fields (an earlier, higher-level design pass had
  assumed `cognitive_trace` alone would suffice; closer inspection here
  corrected that before any code was written — see
  `decisionPopulation/contracts.ts`'s header for the full account). The
  `DECISION` component's own `metadata` already carries `decision`,
  `rawDecision`, `side`, `dedupApplied`, `qualificationStatus`, AND
  `preEntryStatus` together, keyed by a real `cycleId` — no fuzzy/
  timestamp-based join across tables was needed or attempted.
- `lib/ai/runtimeEvents/repository.ts` — `listRuntimeEvents()` gained an
  optional `components` filter (additive; every existing caller
  unaffected) and now re-exports `RuntimeEventComponent`/`RuntimeEventStatus`.
- `lib/ai/cognitiveGap/{contracts,repository}.ts` +
  `lib/ai/cognitiveGap/detectPopulationGap.ts` (new file) — a 7th
  `GapCategory`, `REJECT_DOMINANCE_GAP`, detected by a genuinely separate
  pure function (NOT a branch inside the existing, unchanged
  `detectCognitiveGaps()`) over the new `DecisionPopulationReport`
  instead of the EXECUTE-only population. Surfaced on a NEW,
  SEPARATE `CognitiveGapReport.populationGaps` field — never appended to
  the existing `gaps` field, so `reasoningGap`/`evolutionNeed` (both
  unchanged, both still reading `gaps` only) are unaffected.
- `app/api/ai-performance/cognitive/route.ts` — composes
  `decisionPopulation` (one `fetchDecisionPopulationReport()` per
  symbol) alongside the existing `selfPerformance`, and passes each
  symbol's report into `buildCognitiveGapReport()` as a new 5th, optional
  argument.

### Deliberate scoping decision — 8.6.3/8.6.4 NOT auto-wired
`evaluateEvolutionNeed()` (8.6.3) and `draftEvolutionProposals()` (8.6.4)
are BYTE-IDENTICAL to before this phase — confirmed by `git diff`
showing no changes to `lib/ai/evolutionNeed/evaluate.ts` or
`lib/ai/evolutionProposal/propose.ts`. `REJECT_DOMINANCE_GAP` is
computed and visible (`populationGaps`) but deliberately NOT merged into
the `gaps` array `evaluateEvolutionNeed()` reads, and deliberately NOT
given its own proposal-drafting trigger in this phase. Reasoning: the
task's own brief for this wiring is explicitly hedged ("may use
observed population gaps, BUT: do not create an evolution proposal
merely because EXECUTE is low") and `evaluateEvolutionNeed()`'s
existing `coverage.status === "INSUFFICIENT_DATA"` gate returns early
without even inspecting `gaps` — under current live data volumes
(sparse evaluated-experience counts per symbol), merging the new gap in
would mean it either gets silently swallowed by that gate most of the
time, or — if the gate were loosened to let it through — a
production-decision-adjacent behavior would be changing on the strength
of a single, not-yet-execution-tested phase. The data is fully available
and typed for 8.6.3/8.6.4 to consume in a future, separately-approved
wiring pass; this phase stops at making it visible.

### Fixtures
`scripts/phase8/decision-population-fixtures.ts` (new) — unit coverage
of every `attributeDecisionPath()` branch, every `parse*()` function's
malformed/missing-value handling, and the population-level matrix the
task specified (all-EXECUTE, all-WAIT, all-REJECT, mixed, missing
decision/qualification/pre-entry fields, unknown-reason, symbol
isolation, side breakdown, empty dataset, partial/insufficient/complete
coverage, dedup counting, determinism, immutability), plus
`detectDecisionPopulationGap()`'s gate and severity logic. Existing
`cognitive-gap-fixtures.ts` exercises `detectCognitiveGaps()`/
`buildFamiliarityEvidence()` directly (both pure, both unchanged by this
phase) and constructs no `CognitiveGapReport`/`AutonomousQualificationResult`
literals — confirmed unaffected, not edited.

### Validation status — ACTUALLY RUN (see the correction on P0's own entry above for why this is possible in this sandbox)
```
node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/decision-population-fixtures.ts
```
First run: 41 passed, 3 failed. All 3 failures traced to one bug in the
FIXTURE FILE's own `decisionEvent()` test builder (a ternary using
`value === undefined` couldn't distinguish "caller omitted this
override" from "caller wants the metadata key itself absent" — so cases
3f/3g/3l silently got a builder-supplied default instead of exercising
the missing-key path they claimed to). It was not a bug in
`observe.ts`: `parseObservedQualificationStatus`/`parseObservedPreEntryStatus`'s
own direct unit tests (section 2) already covered `undefined` input
correctly and were passing. Fixed the builder (explicit
`omitQualificationStatus`/`omitPreEntryStatus` flags instead of an
ambiguous `undefined`), re-ran: **44 passed, 0 failed.**

`tsc --noEmit -p tsconfig.json`, filtered to every file this phase
touched (`lib/ai/decisionPopulation/*`, `lib/ai/cognitiveGap/*`,
`lib/ai/runtimeEvents/repository.ts`,
`app/api/ai-performance/cognitive/route.ts`,
`scripts/phase8/decision-population-fixtures.ts`): the same
missing-`node_modules` signature only (`next/server`, `process`) where
those files happen to reference them —
`lib/ai/decisionPopulation/*`, `lib/ai/cognitiveGap/contracts.ts`,
`lib/ai/cognitiveGap/repository.ts`, and
`lib/ai/cognitiveGap/detectPopulationGap.ts` specifically produced
**zero** `tsc` errors of any kind. `npm run build` was not attempted —
same reason as P0.

### Final forensic check (this phase's own required self-answers)
A. Observe REJECT/WAIT/EXECUTE independently — YES.
B. Distinguish observed population from evaluated-experience population —
YES, two separate reports, never merged; `evaluatedExperienceCount` is
threaded through read-only, never recomputed by this module.
C. Can 8.6.1 see the complete observed population — YES, `decisionPopulation`
is composed alongside `selfPerformance` on the same route response.
D. Can 8.6.2 detect repeated WAIT/REJECT patterns — YES,
`REJECT_DOMINANCE_GAP`, gated at >= `MIN_OCCURRENCE_COUNT` REJECTs and a
>50% REJECT share.
E. Can 8.6.3/8.6.4 consume this without changing production decisions —
the data is available and typed for them to consume; NOT auto-wired
into either module's existing decision gate in this phase (see the
scoping decision above) — a deliberate stop short of "yes, and it already
does", not a gap.
F. Any causal attribution inferred without persisted evidence — NO;
`attributeDecisionPath()` reads only two already-persisted status
fields against `decide.ts`'s/`validate.ts`'s own unchanged, already-
audited branch logic, and returns `UNKNOWN` whenever either input
itself is `UNKNOWN` — never inferred from row ordering.
G. Did any Phase 7 behavior change — NO.
H. Did P0 behavior change — NO (no further edits to any P0 file).
I. Did this phase touch 8.6.5-8.6.7 — NO (8.6.5-8.6.6 were already
implemented before this phase; 8.6.7 is not started; repository-wide scan for
auto-promotion/Git-push/deployment/messaging keywords inside every 8.6.x
directory returned no matches, same check as the corrective-design
report's Part 3, re-run for this phase's new files too).

### P2 (confluence-source attribution) — still not implemented; unaffected by this phase.

---

## Hotfix — REJECT_DOMINANCE_GAP missing from two exhaustive Record<GapCategory,...> maps

Reported by a real `npm run build` in the actual project environment
(the sandbox this work was done in cannot run that build — see Phase
8.6 P1's validation entry above), pointing at
`components/ai-performance/SelfPerformancePanel.tsx:125` —
`Record<GapCategory, string>` was missing the new `REJECT_DOMINANCE_GAP`
key added in Phase 8.6 P1. This is exactly the kind of consumer a
repository-wide grep for `CognitiveGapReport`/`buildCognitiveGapReport()`
does not surface — a `Record<GapCategory, ...>` keys off the TYPE, not
the function, and this particular one lives in a `.tsx` component that
earlier searches during P1 did not specifically check.

**Fixed, both real, both located and closed before either could surface
as a second broken build:**
- `components/ai-performance/SelfPerformancePanel.tsx` — added
  `REJECT_DOMINANCE_GAP: "Reject dominance"` to `GAP_CATEGORY_LABEL`.
  Not reachable at runtime through this component today (`gap.category`
  in the `.map()` this label serves only ever iterates `report.gaps`,
  still exclusively the original 6 categories) — added for type
  soundness and so it's ready if a future pass renders
  `report.populationGaps` here too.
- `lib/ai/evolutionProposal/propose.ts` — same situation, a SECOND,
  independently-discovered exhaustive `Record<GapCategory, CategoryCopy>`
  (`COPY_BY_CATEGORY`) that would have failed the same way. Added a real
  template entry — not a placeholder — pointing investigation at the
  ACTUAL mechanism (`qualify.ts`'s bounded negative-memory signal +
  `lib/ai/decisionPopulation`'s decision-path attribution), correcting
  the exact misdirection two forensic audits found in `PATTERN_GAP`'s
  own template ("adaptive constraint scoping" — not where that defect
  lived). Also not reachable at runtime today, same reason as above —
  `evolutionNeed.consideredGaps` still only ever contains the original 6
  categories.

**Verification:** a repository-wide re-grep for every remaining
`Record<GapCategory` and every file referencing `GapCategory` at all
(not scoped to `.ts`, included `.tsx`) found no third instance. Re-ran
`tsc --noEmit` project-wide: the specific reported error
("Property 'REJECT_DOMINANCE_GAP' is missing... required in type
Record<GapCategory, string>") no longer appears anywhere in the output.
Re-ran all six 8.6.x fixture scripts that could plausibly be affected —
`decision-qualification-fixtures.ts` (40/40),
`decision-population-fixtures.ts` (44/44), `cognitive-gap-fixtures.ts`
(19/19), `evolution-need-fixtures.ts` (17/17),
`evolution-proposal-fixtures.ts` (15/15 — including the new
`REJECT_DOMINANCE_GAP` template entry, exercised by this run),
`evolution-candidate-fixtures.ts` (17/17),
`evolution-validation-fixtures.ts` (15/15) — all pass, zero
regressions.

**Honest limitation:** this sandbox still cannot run the project's real
`npm run build` (same missing-`node_modules` constraint as every prior
entry in this file) — `tsc --noEmit` here is running against a
different, incomplete type environment than the user's real one (their
build has working `@types/react`; this sandbox does not, which is why
its own `tsc` output is dominated by unrelated React/JSX noise this
entry did not chase down). The SPECIFIC reported error is the textbook
"object literal missing a required key" shape, and the fix is the
complete, structural fix for that shape of error — but a second,
different error surfacing on the user's next real build (from something
this sandbox's degraded type-checking couldn't see) cannot be ruled out
with certainty from here.

---

## Phase 8.6 P2 — Confluence-Source Attribution

*Builds on P0 and P1 above, both confirmed unchanged by this phase (see
"P0/P1 regression" below).*

### Forensic finding
The canonical, 8-member `ConfluenceSource` vocabulary
(`lib/ai/oracle/confluenceTypes.ts`:
`market_structure|smc_ict|tpo|footprint|orderbook|liquidity|microstructure|macro`)
is computed for every real confluence factor, every cycle, and
immediately re-expressed as fully-structured `NormalizedEvidence[]`
(source + cluster + direction + strength + quality + text, Phase 7.1,
`lib/ai/oracle/evidence.ts`), then wrapped into
`CognitiveObservation.evidence` (Phase 8.0.1,
`lib/ai/cognitive/observation.ts`) — already computed, every cycle,
before this phase. None of it reached persistence: `cognitive_trace`'s
own `evidence` stage only ever stored three hardcoded narrative STRINGS
(`liquidityEvidence`/`structureEvidence`/`volumeEvidence`, for exactly 3
of the 8 real sources via `orchestrator.ts::evidenceForSource()`),
discarding direction/strength/quality and the other 5 sources entirely.
`decision_experiences`/`decision_evaluations`' `EvaluationEvidenceTag`
vocabulary has no confluence-source dimension at all (confirmed
unchanged, matches the original forensic audit). The one place
structured `ConfluenceSource` data already reached persistence:
`cognitive_trace.contradictions` (`ClassifiedContradiction[]`, Phase
8.3.5) — real, already-queryable historical data, but scoped to
disagreeing factor pairs only, never "which sources were present."

### Minimal, safe instrumentation added
One new field, `CognitiveTraceEvidenceStage.confluenceEvidence`
(verbatim `CognitiveObservation.evidence`, already computed, now
persisted for the first time instead of discarded). `cognitive_trace.evidence`
is an existing `jsonb` column — **no database migration was needed**,
only a documentation note added to `supabase/learning/schema.sql`. No
change to Phase 7, Oracle decision logic, qualification, pre-entry,
arbitration, risk, execution, or paper trading — confirmed by `git diff`
touching only `lib/ai/cognitiveTrace/contracts.ts` (the type) and one
object literal inside `lib/ai/autonomousRuntime/orchestrator.ts`'s
already-existing `persistCognitiveTrace()` call (the value).

### Architecture
`lib/ai/confluenceAttribution/{contracts,derive,repository}.ts` (new),
modeled on `lib/ai/decisionPopulation` (Phase 8.6 P1)'s own shape. Two
deliberately SEPARATE, never-merged tallies per `ConfluenceSource` (8
entries always present, zero-filled honestly, never omitted):
- `evidenceSources` — from the new `confluenceEvidence` field. Real
  direction/strength/quality, but only populated for cycles run AFTER
  this phase ships (every historical row honestly reports
  `NOT_RECORDED` for this half — there is no data yet, and none is
  fabricated).
- `contradictionSources` — from the pre-existing `contradictions`
  field. Real, already-populated historical data, narrower in meaning
  (disagreement, not presence).
Both reuse `lib/ai/decisionPopulation/contracts.ts`'s
`ObservedDecisionCounts` (EXECUTE/WAIT/REJECT) type verbatim for the
per-source decision breakdown — satisfying "connect to decision
population" via type-level reuse; the decision itself is read directly
off the SAME `cognitive_trace` row (`decision.decision`), no join to
`runtime_events` needed for this phase. `ConfluenceAttributionStatus`
(`OBSERVED`/`INFERRED`/`UNKNOWN`/`NOT_RECORDED`) is a closed 4-value
vocabulary per the brief; this phase's own derivation only ever produces
`OBSERVED` or `NOT_RECORDED` — everything it reads is a controlled,
already-typed `jsonb` array (not free-text metadata needing defensive
parsing the way P1's `runtime_events.metadata` did), so nothing is ever
deduced (`INFERRED`) or malformed (`UNKNOWN`) by construction. Wired into
`GET /api/ai-performance/cognitive` as a new, additive
`confluenceAttribution: [{symbol, report}]` field — `decisionPopulation`,
`cognitiveGaps`, `selfPerformance`, `novelty`, `evolution` all untouched.
NOT wired into `buildCognitiveGapReport()`/`evaluateEvolutionNeed()`/
`draftEvolutionProposals()` — same deliberate "observe now, wire in a
later explicit phase" scoping decision P1 made for `populationGaps`.

### Files added
`lib/ai/confluenceAttribution/contracts.ts`, `derive.ts`, `repository.ts`;
`scripts/phase8/confluence-attribution-fixtures.ts` (22 cases).

### Files modified
`lib/ai/cognitiveTrace/contracts.ts` (new field, new import);
`lib/ai/autonomousRuntime/orchestrator.ts` (one object literal, one new
line); `app/api/ai-performance/cognitive/route.ts` (new composed field);
`supabase/learning/schema.sql` (doc comment only, no migration).

**Lesson applied from the P1 hotfix, before this phase shipped, not
after:** adding a required field to `CognitiveTraceEvidenceStage`
carries the exact same risk P1's `GapCategory` extension did —
pre-existing object literals typed against that interface need the new
key too. This time, searched for every constructor BEFORE calling the
phase done, not after a real build failed: `grep -rn "liquidityEvidence"`
across the whole repository (not scoped to any one directory) found and
fixed FOUR pre-existing fixture files that construct this exact object
literal — `cognitive-replay-fixtures.ts`, `wiring-conflict-correlation-fixtures.ts`,
`cognitive-trace-fixtures.ts`, `cognitive-memory-conflict-learning-fixtures.ts`
— each given `confluenceEvidence: null` (the correct, honest default;
none of these fixtures concern confluence evidence). Two structurally
similar but genuinely SEPARATE types
(`components/elvoid-pro/AISignalIntelligence/AISignalIntelligencePanel.tsx`'s
local `Snapshot` interface, `lib/ai/autonomousSnapshot/contracts.ts`'s
own evidence fields — a different table, `autonomous_intelligence_snapshot`)
were checked and confirmed NOT affected, correctly left untouched.

### Validation status — actually run
```
node --experimental-strip-types --loader ./scripts/phase7/alias-loader.mjs scripts/phase8/confluence-attribution-fixtures.ts
-> 22 passed, 0 failed
```
Also re-ran every fixture script that could plausibly be touched by the
`CognitiveTraceEvidenceStage` field addition, for real:
`cognitive-replay-fixtures.ts` (61/61), `cognitive-trace-fixtures.ts`
(16/16), `cognitive-memory-conflict-learning-fixtures.ts` (27/27),
`wiring-conflict-correlation-fixtures.ts` (17/17) — all pass, zero
regressions. Re-ran P0/P1's own suites again too:
`decision-qualification-fixtures.ts` (40/40),
`decision-population-fixtures.ts` (44/44), `cognitive-gap-fixtures.ts`
(19/19), `evolution-proposal-fixtures.ts` (15/15),
`evolution-need-fixtures.ts` (17/17) — unchanged, still all pass.

`tsc --noEmit -p tsconfig.json`, actually run, filtered to every file
this phase touched: the P2 fixture file's own import statement
originally reached into `lib/ai/oracle/evidence.ts` for two types
(`ConfluenceSource`, `OracleDataQuality`) that module only imports
internally, not re-exports — a real `TS2459` error, caught by this run,
fixed by importing both from `lib/ai/confluenceAttribution/contracts.ts`
instead (which already re-exports them). Every other file this phase
touched: zero errors beyond the project's pre-existing, uniform missing-
`node_modules`/`@types/node` noise (confirmed identical in files this
phase never touched). Re-ran the FULL project `tsc --noEmit` a second
time after that fix: zero `TS2459` errors anywhere, zero "is missing in
type ... Record<GapCategory" or equivalent exhaustiveness errors
introduced by this phase. `npm run build` was not attempted — same
reason as every prior phase (`node_modules` genuinely not installed in
this sandbox).

### P0 regression
`git diff` confirms zero further edits to `lib/ai/decisionQualification/{contracts,qualify}.ts`,
`lib/ai/failurePatterns/detect.ts` beyond what P0/the hotfix already
delivered.

### P1 regression
`git diff` confirms zero further edits to `lib/ai/decisionPopulation/*`,
`lib/ai/runtimeEvents/repository.ts`. `lib/ai/cognitiveGap/{contracts,repository,detectPopulationGap.ts}`
and `lib/ai/evolutionProposal/propose.ts` (touched by the hotfix, not
this phase) are also unchanged by P2. `decisionPopulation`'s own
composed field on the API route is untouched — `confluenceAttribution`
was added as a new, separate field alongside it, not merged in.

### Phase 7 regression
Zero. `computeConfluence()`/`gradeConfluence()`/`normalizeEvidence()`/
`buildCognitiveObservation()` are all read-only inputs to this phase's
new persistence line — none of their own logic was touched. Confirmed
by `git diff` showing no changes under `lib/ai/oracle/` or
`lib/ai/cognitive/observation.ts` themselves — only orchestrator.ts's
own call-site object literal changed.

### Known limitations
- `evidenceSources` will report `NOT_RECORDED` for essentially all
  traffic until real cycles run after this phase ships — this is
  expected and honestly reported, not a bug.
- `listCognitiveTracesBySymbol()` has no `since` parameter (unlike P1's
  `listRuntimeEvents`, which gained one) — population windowing is
  `limit`-only for this phase; noted as a possible future enhancement,
  not implemented now, to keep this phase's footprint minimal.
- Side (`LONG`/`SHORT`) is available on each raw `cognitive_trace` row
  but deliberately not broken out as its own tally dimension in this
  phase (see contracts.ts header) — combinatorial growth (8 sources x 3
  decisions x 3 sides x 2 tally types) was judged not worth it for a
  first pass; a caller can pre-filter rows by side before calling
  `deriveConfluenceAttribution()` if needed today.
- `contradictionSources` structurally cannot report per-source
  direction/quality (a `ClassifiedContradiction` doesn't carry them) —
  `directionCounts`/`qualityCounts` are `null` there by design, not a
  gap.

### P2 completion
A-L (this phase's own acceptance criteria): satisfied. Vocabulary was
audited, not invented (A/B); attribution is a pure, deterministic
function of persisted jsonb arrays (C); OBSERVED vs NOT_RECORDED is
explicit and INFERRED/UNKNOWN are reserved, never fabricated (D);
source x decision aggregation exists and is descriptive-only, with an
explicit non-causal-language check in the fixtures (E/F); P0/P1/Phase 7
unchanged (G/H, see above); tests actually executed, results reported
honestly including the one real bug found and fixed (I/J); 8.6.5-8.6.6
(already implemented before this phase) and 8.6.7 (not started) untouched
by this phase, no self-modification exists anywhere in this module (K/L).

### 8.6.3/8.6.4 wiring decision — not reviewed by this phase
Per this phase's own Step 8, `confluenceAttribution` was deliberately
NOT wired into `evaluateEvolutionNeed()`/`draftEvolutionProposals()`,
mirroring P1's identical decision for `populationGaps`. Whether/how to
wire either (or both) in is a decision for a future, explicit,
separately-scoped phase — this phase does not recommend a timeline for
that review, only that the data both would need is now available and
type-compatible.

---

## Phase 8.6.5b — Replay/Validation Hardening (semantic honesty + auditability)

Additive hardening of the already-implemented 8.6.5 (Evolution Candidate +
Replay) and 8.6.6 (Validation + Regression Guard). **No production decision
behavior changed**; nothing was added to Phase 7, qualification, pre-entry,
thresholds, `evolutionNeed`, or the proposal engine; 8.6.7 is not
implemented; no counterfactual engine exists.

### Why
Forensic review found the replay is — and always was — an **observational
split-history comparison** (an older window versus a newer window of
already-recorded outcomes; no candidate logic is applied to either window),
but that was stated only in prose. Three problems followed: nothing in the
data said so; `VALID` was shown in the UI as "Validated candidate", which
reads as proof the proposal works; and `REJECT_DOMINANCE_GAP` — the
population-level gap the whole P0/P1 correction was about — cannot be
measured by a replay that reads executed decisions only, yet would have come
out as `INCONCLUSIVE` (confirmed by mutation: with the applicability rule
removed, the real REJECT_DOMINANCE_GAP proposal yields `INCONCLUSIVE`).

### What changed
- `lib/ai/evolutionCandidate/semantics.ts` (new): `VALIDATION_MODE =
  "OBSERVATIONAL_SPLIT_HISTORY"`, `COUNTERFACTUAL_AVAILABLE = false`,
  `COUNTERFACTUAL_MISSING_INPUTS` (5 fixed entries, each naming where the
  absence was verified: per-cycle oracle input, per-cycle decision memory,
  per-cycle decision-rule configuration, outcomes for WAIT/REJECT cycles,
  and any engine that runs modified logic), and
  `replayApplicabilityFor()` — an exhaustive `Record<GapCategory, ...>`, so
  a new category cannot be added without deciding whether replay can
  measure it. Only `REJECT_DOMINANCE_GAP` is not applicable.
- Every replay slice carries `sampleAccounting`: `scopedTotal`, `eligible`
  (rows with a persisted evaluation — exactly what the slice's metrics
  consume, so `eligible === performance.totalEvaluated`), `excluded`, and
  `exclusionReasons` (`OPEN_NO_OUTCOME`, `CLOSED_UNEVALUATED`; both always
  listed, fixed order). Existing slice fields, deltas and the sufficiency
  gate are unchanged.
- Candidates carry `replayApplicability`. A not-applicable candidate is
  finalized as `CANDIDATE_CREATED` with `replay: null` — the status the
  contract already documented as "replay never ran" — **before any
  historical read**. Scope is still checked first, so an unsafe proposal is
  still `VALIDATION_BLOCKED` / `INVALID`.
- Validation results carry `validationMode`, `counterfactualAvailable`
  (typed as the literal `false`), and `missingCounterfactualInputs`; a new
  result value `NOT_APPLICABLE` (a verdict about the method, not about the
  proposal); two new limitations stating "observational" and "not
  counterfactual validation"; per-window sample-accounting evidence lines.
- UI (`SelfPerformancePanel.tsx`): "Validated candidate" removed. `VALID` now
  reads "Observational evidence — target gap rate lower in newer window";
  the card shows "Observed split-history result · Not counterfactual
  validation", per-window eligible/excluded counts, regression as "Not
  evaluated" when no replay ran, and a collapsible list of what a
  counterfactual replay would need. `REPLAY_PASSED`/`REPLAY_FAILED` labels now
  say "Both windows had sufficient data" / "Insufficient data in a window".

### Semantics — before vs after
| | Before | After |
|---|---|---|
| Mode | prose only | `validationMode: OBSERVATIONAL_SPLIT_HISTORY` on every result |
| Counterfactual | prose only | `counterfactualAvailable: false` + fixed missing-input list |
| Sample accounting | coverage ratio only | eligible / excluded / reasons per slice |
| REJECT_DOMINANCE_GAP | would run executed-only replay → `INCONCLUSIVE` | `NOT_APPLICABLE`, no historical read |
| `VALID` | UI: "Validated candidate" | same enum, UI: observational evidence only |
| VALID / INVALID / INSUFFICIENT_EVIDENCE / INCONCLUSIVE | decision table | unchanged |

### Database compatibility
No migration. No enum value was renamed or removed. `sampleAccounting`
lives inside the existing `replay` / `metrics_observed` jsonb columns;
`replayApplicability`, `validationMode`, `counterfactualAvailable` and
`missingCounterfactualInputs` are not stored — they are deterministic from
`gap_category` or constants of the method and are re-attached on read. Rows
persisted before 8.6.5b read back with `sampleAccounting: null` ("not
recorded"), never reconstructed.
**Known limitation:** the stored `evolution_validations.result` and
`evolution_candidates.gap_category` CHECK constraints do not list
`NOT_APPLICABLE` / `REJECT_DOMINANCE_GAP`. A not-applicable candidate or
result is therefore computed and shown but **not persisted**:
`persistEvolutionCandidate()` / `persistEvolutionValidation()` return
`{ persisted: false, reason: "not_persistable" }` explicitly, before
touching the database. Relaxing those constraints is a schema decision left
to a future, separately-approved change. (Nothing persists automatically
today; the route remains compute-only.)

### Not done (out of scope, unchanged)
Phase 7, decision thresholds, qualification, pre-entry, P1/P2 wiring into
`evolutionNeed`/proposals, any counterfactual engine, code generation,
persistence from GET routes, 8.6.7 (Human Approval Gate).

### Fixtures
`scripts/phase8/evolution-hardening-fixtures.ts` (new, 38 checks). The two
existing suites' assertions are unchanged; only their hand-built helper
objects gained the new fields.
