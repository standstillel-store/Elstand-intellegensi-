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

**ROADMAP / FUTURE DIRECTION — not implemented.** No code in this
repository currently allows ELVOID or ELSTAND to modify its own logic. If
and when this is pursued, the intended shape (per the project's own
forward-looking design notes) is:

```
Monitor → Detect → Decide → Propose → Test → Protect → Human Approval
```

Any future self-evolution work is expected to require:
- **Replay validation** against the Cognitive Replay mechanism already
  built in Phase 8.3.7, so a proposed change can be checked against real
  historical cycles before being trusted.
- **Regression guard** — the same fixture-suite discipline every 7.x/8.x
  sub-phase already used (re-running every prior phase's fixtures before
  accepting a new change).
- **Versioning** of whatever logic would be subject to change.
- **Human approval** as a hard gate before any self-modification takes
  effect — not an optional review step.

The system today does not propose or apply changes to its own reasoning;
this section describes a direction, not a capability.

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
  Approval) — design direction only, no implementation
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
