-- ---------------------------------------------------------------------------
-- ELVOID Learning Database — Phase 8.1.0 schema
--
-- Runs against a SEPARATE, DEDICATED Supabase project (see
-- lib/ai/learning/db.ts) — NOT the Main Supabase project. Do not run this
-- file against the Main Supabase project's schema (supabase/schema.sql,
-- untouched by this phase).
--
-- Access pattern mirrors the Main DB's system-scoped tables (ai_signals,
-- ai_journal, ai_statistics, paper_wallet, per supabase/schema.sql): RLS is
-- enabled with ZERO public policies. All reads/writes go through
-- lib/ai/learning/db.ts's service-role client, server-side only.
--
-- decision_experiences is a LEARNING PROJECTION, never a canonical trading
-- authority. `source_signal_id` is a logical reference to the Main DB's
-- `ai_signals.id` — there is no SQL foreign key across the two separate
-- Supabase projects, by design (cross-project FKs are not possible, and
-- would couple two independently-scaled/independently-resettable
-- databases even if they were).
-- ---------------------------------------------------------------------------

create table if not exists decision_experiences (
  id uuid primary key default gen_random_uuid(),

  -- Provenance / identity ----------------------------------------------------
  -- `source_signal_id` = the Main DB's `ai_signals.id` (a UUID, already
  -- globally unique across BOTH "AI_SIGNAL" and "ELVOID_PRO_ORACLE" rows,
  -- since both write into the same shared `ai_signals` table — see
  -- lib/elvoid/types.ts / lib/ai/oracle/execute.ts). `source` is carried
  -- alongside purely as a readable provenance label; uniqueness itself
  -- only needs to be enforced on `source_signal_id` (see UNIQUE below) —
  -- it is NOT a composite key, because the underlying identifier is
  -- already globally unique on its own.
  source text not null check (source in ('AI_SIGNAL', 'ELVOID_PRO_ORACLE')),
  source_signal_id text not null,

  -- Decision snapshot (frozen at insert time, NEVER updated) -----------------
  symbol text not null,
  side text not null check (side in ('LONG', 'SHORT')),
  grade text,                          -- AiSignal.trade_grade OR oracle_grade, whichever the source populates; null is valid
  confidence numeric not null,
  decision_timestamp timestamptz not null,   -- = AiSignal.created_at, copied verbatim

  -- Cognitive context snapshot, normalized + frozen (Phase 8.0.5 handoff).
  -- Null whenever the originating decision has no Cognitive Layer context
  -- (currently true for every AI_SIGNAL-sourced decision, and for any
  -- ELVOID_PRO_ORACLE decision made before this handoff existed, or where
  -- Phase 8.0 defensively returned null) — this is a valid, expected state,
  -- never backfilled or fabricated. Shape: LearningContextSnapshot, see
  -- lib/ai/decisionOutcome/contracts.ts. Written once, never mutated.
  learning_context jsonb,

  -- Outcome (nullable until the decision resolves; written AT MOST ONCE via
  -- a conditional UPDATE ... WHERE outcome_result IS NULL — see
  -- lib/ai/decisionOutcome/repository.ts — never overwritten afterward).
  -- Canonical source: Main DB `ai_journal`, copied verbatim, never
  -- recomputed here.
  outcome_result text check (outcome_result in ('win', 'loss', 'breakeven')),
  outcome_rr numeric,
  outcome_profit_percent numeric,
  outcome_duration_minutes integer,
  outcome_closed_at timestamptz,

  created_at timestamptz not null default now(),

  -- Idempotency: a retried/duplicated capture attempt for the same Main DB
  -- decision must never create a second experience row.
  unique (source_signal_id)
);

create index if not exists decision_experiences_symbol_idx on decision_experiences (symbol);
create index if not exists decision_experiences_decision_timestamp_idx on decision_experiences (decision_timestamp);

alter table decision_experiences enable row level security;
-- No policies defined — service-role key (used exclusively by
-- lib/ai/learning/db.ts, server-side only) bypasses RLS by design, same
-- convention as ai_signals/ai_journal/ai_statistics/paper_wallet in the
-- Main DB's supabase/schema.sql. There is intentionally zero public/anon
-- access to this table.

-- ---------------------------------------------------------------------------
-- Phase 8.1.1 — Decision Evaluation Engine
--
-- decision_evaluations is a DERIVED INTERPRETATION of an already-frozen
-- decision_experiences row — never a second source of decision/outcome
-- truth. `source_signal_id` is the same logical reference
-- decision_experiences itself uses (ultimately, the Main DB's
-- `ai_signals.id`) — no cross-project SQL foreign key, same reasoning as
-- decision_experiences above. grade/confidence/outcome_result/symbol/
-- side/source are intentionally NOT duplicated here; a decision_evaluations
-- row is only ever meaningful joined against its decision_experiences row
-- by source_signal_id.
--
-- Append-only, one row per experience: UNIQUE(source_signal_id). No update
-- path exists for this phase — a changed evaluation algorithm produces a
-- new row in a future phase, never a mutation of an existing evaluation
-- (matches decision_experiences' own "never reinterpret history" rule).
-- ---------------------------------------------------------------------------

create table if not exists decision_evaluations (
  id uuid primary key default gen_random_uuid(),

  source_signal_id text not null,
  version integer not null,

  decision_quality text not null check (decision_quality in ('GOOD', 'BAD', 'UNKNOWN')),
  market_outcome text not null check (market_outcome in ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'UNKNOWN')),
  evaluation_class text not null check (
    evaluation_class in ('GOOD_DECISION_GOOD_OUTCOME', 'GOOD_DECISION_BAD_OUTCOME', 'BAD_DECISION_GOOD_OUTCOME', 'BAD_DECISION_BAD_OUTCOME', 'NEUTRAL_OUTCOME', 'INSUFFICIENT_EVIDENCE')
  ),

  confidence_alignment text not null check (confidence_alignment in ('ALIGNED', 'MISALIGNED', 'UNKNOWN')),
  risk_alignment text not null check (risk_alignment in ('ALIGNED', 'MISALIGNED', 'NOT_APPLICABLE', 'UNKNOWN')),
  conflict_alignment text not null check (conflict_alignment in ('ALIGNED', 'MISALIGNED', 'NOT_APPLICABLE', 'UNKNOWN')),
  hypothesis_alignment text not null check (hypothesis_alignment in ('ALIGNED', 'MISALIGNED', 'NOT_APPLICABLE', 'UNKNOWN')),

  -- Closed EvaluationEvidenceTag[] — see lib/ai/decisionEvaluation/contracts.ts.
  -- Stored verbatim, never re-derived on read (same convention as
  -- ai_signals.scans/extra_reasoning in the Main DB schema).
  evidence jsonb not null,

  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),

  -- Idempotency: one experience -> one evaluation for this phase. A
  -- retried/duplicated evaluation attempt must never create a second row.
  unique (source_signal_id)
);

create index if not exists decision_evaluations_evaluation_class_idx on decision_evaluations (evaluation_class);

alter table decision_evaluations enable row level security;
-- No policies defined — same service-role-only convention as every other
-- table in this schema. Zero public/anon access.

-- ---------------------------------------------------------------------------
-- Phase 8.1.2 — Failure Pattern Detection
--
-- failure_pattern_candidates is a DERIVED, AGGREGATE STATISTIC computed
-- over many already-frozen decision_evaluations rows (joined against
-- decision_experiences for source/decision_timestamp) — never a third
-- source of decision/outcome/evaluation truth, and never a causal claim.
-- Purely observational: "this evidence tag recurred alongside a negative
-- outcome N times, across multiple calendar days, for this source."
--
-- Unlike decision_evaluations (append-only, one row per experience,
-- forever), this table is AGGREGATE STATE for its (source, evidence_tag)
-- group. A recompute (lib/ai/failurePatterns/repository.ts::
-- recomputeFailurePatterns()) safely OVERWRITES the existing row for a
-- group via UPSERT ... ON CONFLICT (source, evidence_tag) DO UPDATE —
-- never accumulates/duplicates, never merges partial state, since the
-- pure detector (lib/ai/failurePatterns/detect.ts) always recomputes each
-- group's aggregate from scratch, from the full current population.
-- ---------------------------------------------------------------------------

create table if not exists failure_pattern_candidates (
  id uuid primary key default gen_random_uuid(),

  -- Group identity — AI_SIGNAL and ELVOID_PRO_ORACLE are NEVER merged
  -- into the same group; single evidence tag only, never a combination.
  source text not null check (source in ('AI_SIGNAL', 'ELVOID_PRO_ORACLE')),
  -- Phase 8.3.0.1 §7 — SYMBOL ISOLATION. Added so one symbol's failure
  -- patterns can never pool with, or influence, another symbol's
  -- learning statistics. See the additive migration block below this
  -- table for how an existing deployment (created before this column
  -- existed) is safely upgraded without deleting historical rows.
  symbol text not null,
  evidence_tag text not null,          -- one EvaluationEvidenceTag member — see lib/ai/decisionEvaluation/contracts.ts.

  version integer not null,

  -- Most frequent evaluation class among this group's qualifying
  -- negative-outcome rows. Only these two EvaluationClass members are
  -- ever possible here (see NEGATIVE_EVALUATION_CLASSES in detect.ts) —
  -- a group only exists in this table because it has >= 5 rows in one
  -- of these two classes.
  dominant_evaluation_class text not null check (dominant_evaluation_class in ('GOOD_DECISION_BAD_OUTCOME', 'BAD_DECISION_BAD_OUTCOME')),

  -- occurrence_count >= 5 always (MIN_OCCURRENCE_COUNT in detect.ts) —
  -- groups below that threshold are never persisted as a row here.
  occurrence_count integer not null check (occurrence_count >= 5),
  dominant_class_share numeric not null,   -- dominant_evaluation_class's own count / occurrence_count — a frequency share (0..1), never a probability/causal-strength score.
  confidence numeric not null,             -- scales with occurrence_count up to 30 samples, capped at 0.7 — see MAX_CONFIDENCE in detect.ts. Never 1.0.

  first_observed_at timestamptz not null,  -- earliest decision_timestamp among this group's qualifying rows.
  last_observed_at timestamptz not null,   -- latest decision_timestamp among this group's qualifying rows. Must differ in calendar date from first_observed_at (temporal-recurrence rule enforced in detect.ts, not re-enforced in SQL to avoid a timezone-dependent CHECK).

  computed_at timestamptz not null,        -- stamped once per recompute batch by repository.ts, shared across every candidate produced by that same recompute run. This IS the "last updated" marker for a row — no separate updated_at column, to avoid a second timestamp that a naive upsert could silently leave stale.
  created_at timestamptz not null default now(),

  -- Phase 8.3.0.1 §7: one row per (source, symbol, evidence_tag) group —
  -- widened from (source, evidence_tag) so a recompute UPSERT can never
  -- pool two symbols' occurrences into the same aggregate row. See the
  -- migration block below for how a pre-existing (source, evidence_tag)
  -- unique constraint from before this phase is dropped in favor of this
  -- one, on a deployment that already has this table.
  unique (source, symbol, evidence_tag)
);

-- ---------------------------------------------------------------------------
-- Phase 8.3.0.1 §7 — additive migration for a deployment that already ran
-- the Phase 8.1.2 `create table if not exists failure_pattern_candidates`
-- above BEFORE the `symbol` column/constraint existed. `create table if
-- not exists` is a no-op on such a deployment, so this block explicitly
-- upgrades it in place — and MUST run before the `create index ...
-- (symbol)` statement below, since that statement would otherwise fail
-- with "column symbol does not exist" on a pre-existing table (exactly
-- the ordering bug an earlier version of this migration had). NEVER
-- deletes historical rows — a backfill value is required (existing rows
-- predate symbol-aware aggregation and cannot be retroactively
-- attributed to a real symbol), so this migration marks them `'UNKNOWN'`
-- rather than guessing, and the next `recomputeFailurePatterns()` run
-- naturally replaces every `'UNKNOWN'` row with correctly symbol-scoped
-- groups (old rows simply stop being upserted into, since no future
-- observation ever has `symbol = 'UNKNOWN'`); a manual cleanup of
-- leftover `'UNKNOWN'` rows once that has happened is optional, not
-- required for correctness.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'failure_pattern_candidates' and column_name = 'symbol'
  ) then
    alter table failure_pattern_candidates add column symbol text;
    update failure_pattern_candidates set symbol = 'UNKNOWN' where symbol is null;
    alter table failure_pattern_candidates alter column symbol set not null;
    alter table failure_pattern_candidates drop constraint if exists failure_pattern_candidates_source_evidence_tag_key;
    alter table failure_pattern_candidates add constraint failure_pattern_candidates_source_symbol_evidence_tag_key unique (source, symbol, evidence_tag);
  end if;
end $$;

create index if not exists failure_pattern_candidates_source_idx on failure_pattern_candidates (source);
create index if not exists failure_pattern_candidates_symbol_idx on failure_pattern_candidates (symbol);
create index if not exists failure_pattern_candidates_computed_at_idx on failure_pattern_candidates (computed_at);

alter table failure_pattern_candidates enable row level security;
-- No policies defined — same service-role-only convention as every other
-- table in this schema. Zero public/anon access.

-- ---------------------------------------------------------------------------
-- Phase 8.1.4 — Adaptive Constraint Engine
--
-- adaptive_constraints is ADVISORY METADATA ONLY, derived from an
-- already-qualified failure_pattern_candidates row and copied verbatim —
-- never a new source of decision/outcome/pattern truth, never a causal
-- claim, and never behavior. This phase GENERATES AND STORES these rows
-- only; nothing reads this table to influence a canonical decision yet
-- (that remains a future, separately-approved Phase 8.1.5 "qualification
-- consumer").
--
-- AUTHORITY BOUNDARY: no column here ever adjusts a canonical
-- grade/confidence/score/riskStatus/entry/stopLoss/takeProfit value, and
-- no column here is an execution-blocking flag — see constraint_type's
-- closed, deliberately small v1 enum below.
--
-- Same recompute-and-upsert model as failure_pattern_candidates (Phase
-- 8.1.2): a recompute (lib/ai/adaptiveConstraint/repository.ts::
-- recomputeAdaptiveConstraints()) safely OVERWRITES the existing row for
-- a (source, evidence_tag) group via UPSERT ... ON CONFLICT (source,
-- evidence_tag) DO UPDATE — never accumulates/duplicates, never merges
-- partial state, since the pure generator
-- (lib/ai/adaptiveConstraint/generate.ts) always recomputes each
-- constraint from scratch, from the current failure_pattern_candidates
-- population. No append-only event semantics.
-- ---------------------------------------------------------------------------

create table if not exists adaptive_constraints (
  id uuid primary key default gen_random_uuid(),

  -- Group identity — inherited verbatim from the originating
  -- failure_pattern_candidates row. AI_SIGNAL and ELVOID_PRO_ORACLE are
  -- never merged into the same row; single evidence tag only.
  source text not null check (source in ('AI_SIGNAL', 'ELVOID_PRO_ORACLE')),
  -- Phase 8.3.0.1 §7 — SYMBOL ISOLATION, inherited verbatim from the
  -- originating failure_pattern_candidates row. See that table's own
  -- symbol column doc above.
  symbol text not null,
  evidence_tag text not null,          -- one EvaluationEvidenceTag member, copied verbatim — see lib/ai/decisionEvaluation/contracts.ts.

  version integer not null,

  -- Closed v1 advisory label. Deliberately excludes
  -- BLOCK_AUTONOMOUS_EXECUTION and any confidence/grade/risk-adjustment
  -- or execution-blocking value — see
  -- lib/ai/adaptiveConstraint/contracts.ts's AdaptiveConstraintType doc.
  constraint_type text not null check (constraint_type in ('FLAG_HISTORICAL_UNRELIABILITY', 'INCREASE_CAUTION', 'REQUIRE_STRONGER_CONFIRMATION')),

  -- basis.* — verbatim copies of the originating failure_pattern_candidates
  -- row's own already-validated statistics. Never recomputed here; see
  -- lib/ai/failurePatterns/detect.ts for where these values were
  -- originally derived and qualified (MIN_OCCURRENCE_COUNT >= 5,
  -- temporal-spread >= 2 distinct calendar days).
  occurrence_count integer not null check (occurrence_count >= 5),
  dominant_class_share numeric not null,
  statistical_confidence numeric not null,  -- verbatim copy of failure_pattern_candidates.confidence, renamed here to make clear this is inherited observational confidence, never a new score this phase computes.

  first_observed_at timestamptz not null,  -- copied verbatim from the originating failure_pattern_candidates row. Recency-window/expiry semantics belong to Phase 8.1.5, not modeled here.
  last_observed_at timestamptz not null,   -- copied verbatim from the originating failure_pattern_candidates row.

  generated_at timestamptz not null,       -- stamped once per recompute batch by repository.ts, shared across every constraint produced by that same recompute run — same "no separate updated_at column" convention as failure_pattern_candidates.computed_at.
  created_at timestamptz not null default now(),

  -- Phase 8.3.0.1 §7: one row per (source, symbol, evidence_tag) group —
  -- widened from (source, evidence_tag), mirroring
  -- failure_pattern_candidates' own widened key above.
  unique (source, symbol, evidence_tag)
);

-- ---------------------------------------------------------------------------
-- Phase 8.3.0.1 §7 — additive migration, same reasoning/UNKNOWN-backfill
-- convention as failure_pattern_candidates' own migration block above.
-- Runs BEFORE the `create index ... (symbol)` statement below — same
-- ordering fix as that table (a pre-existing deployment would otherwise
-- hit "column symbol does not exist" on the index statement).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'adaptive_constraints' and column_name = 'symbol'
  ) then
    alter table adaptive_constraints add column symbol text;
    update adaptive_constraints set symbol = 'UNKNOWN' where symbol is null;
    alter table adaptive_constraints alter column symbol set not null;
    alter table adaptive_constraints drop constraint if exists adaptive_constraints_source_evidence_tag_key;
    alter table adaptive_constraints add constraint adaptive_constraints_source_symbol_evidence_tag_key unique (source, symbol, evidence_tag);
  end if;
end $$;

create index if not exists adaptive_constraints_source_idx on adaptive_constraints (source);
create index if not exists adaptive_constraints_symbol_idx on adaptive_constraints (symbol);
create index if not exists adaptive_constraints_generated_at_idx on adaptive_constraints (generated_at);

alter table adaptive_constraints enable row level security;
-- No policies defined — same service-role-only convention as every other
-- table in this schema. Zero public/anon access.

-- ---------------------------------------------------------------------------
-- Phase 8.1.5 — Learning Validation
--
-- constraint_validations is a TIMESTAMPED SNAPSHOT of an already-generated
-- adaptive_constraints row (Phase 8.1.4) — never a new source of
-- decision/outcome/pattern/constraint truth, and never a causal claim.
-- This phase VALIDATES constraints only; nothing reads this table to
-- influence a canonical decision yet (that remains a future,
-- separately-approved consumer phase).
--
-- AUTHORITY BOUNDARY: no column here ever adjusts a canonical
-- grade/confidence/score/riskStatus/entry/stopLoss/takeProfit value, and
-- no column here is an execution-blocking flag. status is a closed,
-- fail-closed, priority-ordered v1 enum — see
-- lib/ai/learningValidation/validate.ts's selectStatus() doc.
--
-- Same recompute-and-upsert model as adaptive_constraints (Phase 8.1.4): a
-- recompute (lib/ai/learningValidation/repository.ts::
-- recomputeConstraintValidations()) safely OVERWRITES the existing row for
-- a (source, evidence_tag) group via UPSERT ... ON CONFLICT (source,
-- evidence_tag) DO UPDATE — never accumulates/duplicates, never merges
-- partial state, since the pure validator
-- (lib/ai/learningValidation/validate.ts) always recomputes each
-- validation from scratch, from the current adaptive_constraints
-- population plus a single shared asOf. No append-only event semantics.
-- validated_at is the "as of" marker for the snapshot: because
-- freshness/overfit signals can shift as new evaluations accumulate
-- upstream, a validation is only ever trustworthy as of this timestamp —
-- it is intentionally NOT dropped or replaced by created_at, since
-- freshness can decay between recomputes even if the row itself is not
-- re-upserted.
-- ---------------------------------------------------------------------------

create table if not exists constraint_validations (
  id uuid primary key default gen_random_uuid(),

  -- Group identity — inherited verbatim from the originating
  -- adaptive_constraints row. AI_SIGNAL and ELVOID_PRO_ORACLE are never
  -- merged into the same row; single evidence tag only.
  source text not null check (source in ('AI_SIGNAL', 'ELVOID_PRO_ORACLE')),
  -- Phase 8.3.0.1 §7 — SYMBOL ISOLATION, inherited verbatim from the
  -- originating adaptive_constraints row.
  symbol text not null,
  evidence_tag text not null,          -- one EvaluationEvidenceTag member, copied verbatim — see lib/ai/decisionEvaluation/contracts.ts.

  version integer not null,

  -- Copied verbatim from the originating adaptive_constraints row — never
  -- re-derived here. See lib/ai/adaptiveConstraint/contracts.ts's
  -- AdaptiveConstraintType doc for the closed v1 enum this belongs to.
  constraint_type text not null check (constraint_type in ('FLAG_HISTORICAL_UNRELIABILITY', 'INCREASE_CAUTION', 'REQUIRE_STRONGER_CONFIRMATION')),

  -- Closed, fail-closed, priority-ordered v1 status. Exactly one value per
  -- row — see lib/ai/learningValidation/validate.ts::selectStatus().
  status text not null check (status in ('INCONSISTENT', 'STALE', 'OVERFIT_RISK', 'PROVISIONAL', 'VALID')),

  -- signals.* — the four independently computed booleans status is a
  -- deterministic function of. No free-text/reason/explanation field
  -- anywhere in this table, by design.
  sample_size_adequate boolean not null,
  within_freshness_window boolean not null,
  structurally_consistent boolean not null,
  overfit_risk_flag boolean not null,

  -- basis.* — verbatim copies of the originating adaptive_constraints
  -- row's own already-validated statistics. Never recomputed here; see
  -- lib/ai/failurePatterns/detect.ts for where these values were
  -- originally derived and qualified.
  occurrence_count integer not null check (occurrence_count > 0),
  dominant_class_share numeric not null,
  statistical_confidence numeric not null,

  first_observed_at timestamptz not null,  -- copied verbatim from the originating adaptive_constraints row.
  last_observed_at timestamptz not null,   -- copied verbatim from the originating adaptive_constraints row.

  validated_at timestamptz not null,       -- the "as of" instant this snapshot was computed against, stamped once per recompute batch by repository.ts, shared across every validation produced by that same recompute run. Freshness/overfit signals can decay after this instant — this column is what makes the row a snapshot rather than a permanently-current judgment.
  created_at timestamptz not null default now(),

  -- One row per (source, symbol, evidence_tag) group (Phase 8.3.0.1 §7 —
  -- widened from (source, evidence_tag)). A recompute UPSERTs this key,
  -- safely replacing the previous validation snapshot for the same group.
  unique (source, symbol, evidence_tag)
);

-- ---------------------------------------------------------------------------
-- Phase 8.3.0.1 §7 — additive migration, same reasoning/UNKNOWN-backfill
-- convention as failure_pattern_candidates'/adaptive_constraints' own
-- migration blocks above. Runs BEFORE the `create index ... (symbol)`
-- statement below — same ordering fix as those two tables.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'constraint_validations' and column_name = 'symbol'
  ) then
    alter table constraint_validations add column symbol text;
    update constraint_validations set symbol = 'UNKNOWN' where symbol is null;
    alter table constraint_validations alter column symbol set not null;
    alter table constraint_validations drop constraint if exists constraint_validations_source_evidence_tag_key;
    alter table constraint_validations add constraint constraint_validations_source_symbol_evidence_tag_key unique (source, symbol, evidence_tag);
  end if;
end $$;

create index if not exists constraint_validations_source_idx on constraint_validations (source);
create index if not exists constraint_validations_symbol_idx on constraint_validations (symbol);
create index if not exists constraint_validations_status_idx on constraint_validations (status);
create index if not exists constraint_validations_validated_at_idx on constraint_validations (validated_at);

alter table constraint_validations enable row level security;
-- No policies defined — same service-role-only convention as every other
-- table in this schema. Zero public/anon access.

-- ---------------------------------------------------------------------------
-- Phase 8.2.1 — Autonomous Decision Traceability
--
-- decision_traces is infrastructure-only traceability for FUTURE ELVOID Pro
-- autonomous decisions, including decisions that never execute. It is a
-- NEW, INDEPENDENT identity space: `id` here is a stable trace identifier
-- that exists whether or not an `ai_signals` row was ever created — never
-- derived from or equal to `ai_signals.id`. `source_signal_id` is an
-- OPTIONAL logical reference to the Main DB's `ai_signals.id` (same
-- no-cross-project-FK reasoning as decision_experiences.source_signal_id
-- above), populated only for `outcome = 'EXECUTE'` rows; every
-- `WAIT`/`REJECT`/`EXPIRE` row has `source_signal_id IS NULL` by design AND
-- by the CHECK constraint below (belt-and-suspenders alongside
-- lib/ai/decisionTrace/contracts.ts's validateDecisionTraceInput) — these
-- outcomes must be fully self-contained without any Main DB dependency.
--
-- ELVOID Pro only for this phase (hard boundary): `source` is a
-- single-value CHECK, not the two-value union `decision_experiences.source`
-- uses — this table structurally cannot accept an `AI_SIGNAL` row yet, by
-- design, preserving source isolation. Widening to AI_SIGNAL is a future,
-- separately-approved phase, not this one.
--
-- Immutable: rows are INSERT-only. No UPDATE path exists in
-- lib/ai/decisionTrace/repository.ts — a decision-time snapshot, once
-- written, is never revised (matches decision_experiences' own frozen-
-- snapshot fields, applied here to the ENTIRE row, not just a subset of
-- columns).
--
-- `snapshot` reuses `LearningContextSnapshot` (Phase 8.1.0,
-- lib/ai/decisionOutcome/contracts.ts) verbatim — no new/competing
-- snapshot shape is introduced. Nullable for the same reason it already is
-- nullable in decision_experiences (no Cognitive Layer context yet for the
-- originating decision).
--
-- No grade/confidence/entry/stopLoss/takeProfit/riskStatus column exists
-- here at all, by design — this table records THAT a decision resolved and
-- HOW (outcome + frozen snapshot), never recomputes or stores a second
-- copy of any canonical Oracle/grading value outside the opaque `snapshot`
-- jsonb blob, which is itself only ever a verbatim copy.
-- ---------------------------------------------------------------------------

create table if not exists decision_traces (
  id uuid primary key default gen_random_uuid(),

  source text not null check (source in ('ELVOID_PRO_ORACLE')),
  outcome text not null check (outcome in ('EXECUTE', 'WAIT', 'REJECT', 'EXPIRE')),

  -- Optional logical reference to the Main DB's ai_signals.id. Only ever
  -- populated for outcome = 'EXECUTE'; enforced structurally (not just in
  -- application code) so WAIT/REJECT/EXPIRE can never smuggle in a Main DB
  -- dependency.
  source_signal_id text,
  constraint decision_traces_signal_ref_only_on_execute check (
    (outcome = 'EXECUTE') or (source_signal_id is null)
  ),

  symbol text not null,
  side text check (side in ('LONG', 'SHORT')),
  decision_timestamp timestamptz not null,

  -- Frozen decision-time snapshot — LearningContextSnapshot shape, see
  -- lib/ai/decisionOutcome/contracts.ts. Null when no Cognitive Layer
  -- context exists for the originating decision (valid, not an error).
  snapshot jsonb,

  created_at timestamptz not null default now()
);

create index if not exists decision_traces_source_idx on decision_traces (source);
create index if not exists decision_traces_outcome_idx on decision_traces (outcome);
create index if not exists decision_traces_symbol_idx on decision_traces (symbol);
create index if not exists decision_traces_decision_timestamp_idx on decision_traces (decision_timestamp);
create index if not exists decision_traces_source_signal_id_idx on decision_traces (source_signal_id);

alter table decision_traces enable row level security;
-- No policies defined — same service-role-only convention as every other
-- table in this schema. Zero public/anon access.

-- ---------------------------------------------------------------------------
-- ELVOID Learning Database — Phase 8.2.9 additions
--
-- Two small, narrowly-scoped tables that exist ONLY to make the Phase
-- 8.2.0-8.2.8 pipeline (already fully built) runnable unattended, without
-- re-implementing or widening any canonical authority from an earlier
-- phase:
--
--   autonomous_execution_dedup — one row per (source, symbol). Records the
--   "setup identity" (see lib/ai/autonomousRuntime/dedup.ts) of the most
--   recent EXECUTE this runtime actually produced for that symbol, so a
--   later cycle over an unchanged setup safely WAITs instead of creating a
--   second Paper Trade. This is NOT a second copy of
--   `buildOracleSignalId()`'s own per-assessment idempotency
--   (lib/ai/oracle/execute.ts, unchanged) — that key changes every cycle
--   because `assessment.timestamp` always advances; this key is
--   deliberately coarser (symbol + side + grade + invalidation text) so it
--   stays stable across repeated cycles over the same underlying market
--   read.
--
--   autonomous_runtime_lock — a single-row mutex the runtime tick route
--   claims before running a batch of cycles, so two overlapping
--   invocations (a Vercel Cron tick landing mid-way through a client-side
--   tick, for example) can never run concurrently. A stale lock (crashed
--   invocation) is safely reclaimed after LOCK_STALE_MS
--   (lib/ai/autonomousRuntime/lock.ts) — this is a plain advisory
--   application-level lock, not a Postgres advisory lock/transaction, kept
--   deliberately simple per the phase's own "proportional, not distributed
--   infrastructure" requirement.
-- ---------------------------------------------------------------------------

create table if not exists autonomous_execution_dedup (
  source text not null check (source in ('ELVOID_PRO_ORACLE')),
  symbol text not null,

  -- Deterministic identity of the setup this runtime last EXECUTEd for this
  -- symbol — see buildAutonomousSetupIdentity() in
  -- lib/ai/autonomousRuntime/dedup.ts. Never the same value as
  -- ai_signals.oracle_signal_id / buildOracleSignalId()'s hash — a
  -- deliberately different, coarser key (see file header above).
  setup_identity text not null,

  -- The resulting Main DB ai_signals.id (buildOracleSignalId() output) for
  -- traceability only — never read back into decision logic anywhere.
  paper_trade_id text,

  executed_at timestamptz not null default now(),

  primary key (source, symbol)
);

alter table autonomous_execution_dedup enable row level security;
-- No policies defined — same service-role-only convention as every other
-- table in this schema. Zero public/anon access.

create table if not exists autonomous_runtime_lock (
  id text primary key,
  running boolean not null default false,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Single fixed row this runtime always claims/releases — see
-- lib/ai/autonomousRuntime/lock.ts. Seeded here so the first claim attempt
-- is always an UPDATE (safe, atomic `WHERE running = false`), never an
-- INSERT race.
insert into autonomous_runtime_lock (id, running)
values ('elvoid_pro_oracle_autonomous_cycle', false), ('elvoid_pro_oracle_learning_refresh', false)
on conflict (id) do nothing;

alter table autonomous_runtime_lock enable row level security;
-- No policies defined — same service-role-only convention as every other
-- table in this schema. Zero public/anon access.

-- ---------------------------------------------------------------------------
-- Phase 8.3.0.1 — Autonomous Intelligence Snapshot (Module 1)
--
-- Bounded, OBSERVATION-ONLY storage: exactly ONE row per (source, symbol),
-- overwritten every autonomous cycle via upsert on the
-- `autonomous_intelligence_snapshot_source_symbol_key` unique constraint.
-- This is deliberately NOT an append-only history table (see decision_traces
-- for the append-only trace record of the same cycles) — the AI Signal
-- Intelligence UI reads the single latest row per symbol, nothing else.
--
-- AUTHORITY BOUNDARY (mirrors decision_traces' own header):
--   - Every value here is a VERBATIM copy of an already-computed Phase 7/
--     8.2.x field (OracleAssessment, ConfluenceResult, MacroIntelligenceContext,
--     MarketImpactContext, DecisionMemoryResult, AutonomousDecisionEngineResult).
--     No column here is scored, graded, or decided independently — this
--     table cannot become a second decision authority because it never
--     computes anything, only stores what `runAutonomousCycle()` already
--     produced.
--   - `decision` mirrors `decision_traces.outcome` for the SAME cycle
--     (EXECUTE/WAIT/REJECT) — written by the same orchestrator call, from
--     the same `effectiveDecision.decision` value, never re-derived.
--   - Written for every `stage: "ASSESSED"` cycle regardless of decision —
--     WAIT and REJECT are persisted exactly like EXECUTE (spec §15).
--     A `stage: "NO_ASSESSMENT"` cycle (insufficient candle history, or an
--     early exception) does NOT overwrite the last good snapshot — an
--     honest "no fresh read this cycle" is preferred over erasing the most
--     recent real assessment.
create table if not exists autonomous_intelligence_snapshot (
  id uuid primary key default gen_random_uuid(),

  source text not null check (source in ('ELVOID_PRO_ORACLE')),
  symbol text not null,

  generated_at timestamptz not null,
  decision text not null check (decision in ('EXECUTE', 'WAIT', 'REJECT')),
  side text check (side in ('LONG', 'SHORT')),
  grade text not null,
  confidence numeric not null,
  risk_status text not null check (risk_status in ('unavailable', 'valid', 'invalid')),

  entry numeric,
  take_profit numeric,
  stop_loss numeric,
  risk_reward numeric,

  -- Phase 8.3.0.1 §6 (Mini Chart, Option A) — a small, bounded array of
  -- real closing prices lifted verbatim from `OracleContext.candles`
  -- (Binance real candles, already fetched once per symbol per
  -- autonomous cycle by `assembleOracleContext()` — the SAME candles the
  -- Oracle pipeline itself grades against). NEVER a second live market
  -- request per UI card, NEVER decorative/fabricated data — jsonb array
  -- of numbers, capped small (<=24 points) purely for a sparkline, not a
  -- full OHLC chart. Null when fewer than 2 real candles were available
  -- this cycle (never padded/interpolated to look fuller than it is).
  sparkline jsonb,

  -- Evidence strings, verbatim from ConfluenceResult.factors[].evidence for
  -- the matching ConfluenceSource — joined with "; " when more than one
  -- factor of that source fired. Null when no factor of that source
  -- produced evidence this cycle (never fabricated as an empty string).
  liquidity_evidence text,
  structure_evidence text,
  volume_evidence text,

  -- Short, deterministic strings assembled from MacroIntelligenceContext /
  -- MarketImpactContext fields verbatim (e.g. "EVENT_LIGHT / LOW") — never
  -- a fabricated directional read (spec §6/§18).
  macro_state text,
  event_state text,

  -- Verbatim from OracleAssessment.
  reasoning_summary text,
  invalidation text,

  -- Deterministic, count-based description of DecisionMemoryResult for
  -- this cycle (e.g. "2 pengalaman serupa, 1 pola kegagalan") — never a
  -- fabricated narrative. Null when no memory context was available.
  learning_influence text,

  dedup_applied boolean not null default false,
  execution_outcome text,
  paper_trade_id text,

  updated_at timestamptz not null default now()
);

create unique index if not exists autonomous_intelligence_snapshot_source_symbol_key
  on autonomous_intelligence_snapshot (source, symbol);
create index if not exists autonomous_intelligence_snapshot_decision_idx
  on autonomous_intelligence_snapshot (decision);
create index if not exists autonomous_intelligence_snapshot_updated_at_idx
  on autonomous_intelligence_snapshot (updated_at);

alter table autonomous_intelligence_snapshot enable row level security;
-- No policies defined — same service-role-only convention as every other
-- table in this schema. Zero public/anon access.
