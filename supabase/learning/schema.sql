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
