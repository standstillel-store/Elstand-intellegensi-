-- ---------------------------------------------------------------------------
-- P4 Step 2 — Controlled Change Artifacts (evolution_change_artifacts)
-- Learning Database ONLY (spyadldinhdbazjuglqh). NEVER Main DB.
--
-- WHY THIS IS ITS OWN FILE, NOT APPENDED TO supabase/learning/schema.sql:
-- two existing regression fixtures each scan schema.sql for an EXACT,
-- unbounded-from-their-own-section trigger count —
-- scripts/phase8/evolution-validation-record-fixtures.ts check M6 (expects
-- exactly 2 "drop trigger if exists" between evolution_validation_records
-- and evolution_approvals) and scripts/phase8/evolution-approval-fixtures.ts
-- check 20f (expects exactly 3 from evolution_approvals to end of file).
-- There is no position inside schema.sql where a new evolution_* section
-- could be inserted without breaking one or the other's fixed count —
-- confirmed by trying both positions during P4 Step 2 and watching each
-- fixture suite fail in turn. Editing either fixture's count to make room
-- would be lowering an existing regression invariant to force a PASS, which
-- P4's own rules forbid. Putting the new table in its own additive file
-- avoids touching either fixture's scanned region at all — zero test edits,
-- zero weakened invariants. Requires this table's own equivalent regression
-- coverage in code instead (see scripts/phase8/evolution-artifact-fixtures.ts).
--
-- ADDITIVE, IDEMPOTENT: one new table, two functions, three triggers, two
-- indexes. No existing table/column/constraint anywhere is altered. Safe to
-- run more than once (if not exists / drop trigger if exists / create or
-- replace). Apply AFTER supabase/learning/schema.sql (this table's
-- record_hash column references evolution_validation_records, and its own
-- insert-guard trigger reads evolution_approvals — both must already exist).
--
-- ONE ROW = ONE structured pointer produced after a human APPROVES an
-- evolution_validation_records row on Telegram (lib/ai/evolutionArtifact).
-- NOT a code change. NOT a deploy. `patch_status` is CONSTRAINED to the
-- single value 'NOT_EXECUTED' — this application has no code-generation,
-- branch/worktree or diff-execution capability, and this table does not
-- pretend otherwise; `patch_reference` is always null for the same reason.
-- `artifact_status` is closed to AWAITING_HUMAN_PATCH / VALIDATION_FAILED —
-- there is deliberately no APPLIED/DEPLOYED/MERGED value anywhere here.
--
-- ENFORCED BY THE DATABASE, not only by the application:
--   * a BEFORE INSERT trigger requires a HUMAN_APPROVED row to already exist
--     in evolution_approvals for this exact record_hash — an artifact can
--     never be inserted for a record nobody approved;
--   * UPDATE and DELETE are rejected per row, TRUNCATE per statement, for
--     every role including the service role;
--   * `record_hash` is unique — one artifact per approved record, upsert-
--     with-ignoreDuplicates on `artifact_id` (deterministic:
--     `artifact:<record_hash>`, see lib/ai/evolutionArtifact/create.ts) so a
--     redelivered Telegram webhook is a safe no-op, never a duplicate row.
-- Caveat stated plainly: a schema owner can still drop the trigger or table.
--
-- NOT YET APPLIED to the live Learning DB from this environment: this
-- sandbox has no network access and no Supabase credentials, so this file
-- is prepared SQL only — running it against spyadldinhdbazjuglqh is a
-- manual step (`supabase db push` / execute via the SQL editor), same as
-- every other file already sitting in supabase/migrations/ before this one.
-- See the P4 Step 2 final report for this being reported as BLOCKED, not PASS.
-- ---------------------------------------------------------------------------

create table if not exists evolution_change_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_id text not null unique,
  record_hash text not null unique references evolution_validation_records (record_hash),
  approval_record_hash text not null,
  proposal_id text not null,
  candidate_id text not null,
  source text not null check (source in ('AI_SIGNAL', 'ELVOID_PRO_ORACLE')),
  symbol text not null,
  gap_category text not null check (gap_category in (
    'CONTRADICTION_GAP','CONTEXT_GAP','REASONING_CONSISTENCY_GAP',
    'CONFIDENCE_ALIGNMENT_GAP','EVIDENCE_GAP','PATTERN_GAP'
  )),
  affected_files jsonb not null default '[]'::jsonb,
  proposed_change text not null,
  patch_status text not null check (patch_status = 'NOT_EXECUTED'),
  patch_reference text check (patch_reference is null),
  regression_check jsonb not null,
  gates jsonb not null,
  artifact_status text not null check (artifact_status in ('AWAITING_HUMAN_PATCH', 'VALIDATION_FAILED')),
  status_reason text not null,
  generated_at timestamptz not null default now()
);

create index if not exists evolution_change_artifacts_proposal_idx on evolution_change_artifacts (proposal_id, generated_at desc);
create index if not exists evolution_change_artifacts_candidate_idx on evolution_change_artifacts (candidate_id);

alter table evolution_change_artifacts enable row level security;
-- No policies defined — same service-role-only convention as every other
-- table in supabase/learning/schema.sql. Zero public/anon access.

create or replace function evolution_change_artifacts_reject_mutation() returns trigger
language plpgsql
as $fn$
begin
  raise exception 'evolution_change_artifacts is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$fn$;

create or replace function evolution_change_artifacts_require_approved_record() returns trigger
language plpgsql
as $fn$
begin
  if not exists (
    select 1
    from evolution_approvals a
    where a.record_hash = new.approval_record_hash
      and a.record_hash = new.record_hash
      and a.resulting_status = 'HUMAN_APPROVED'
  ) then
    raise exception 'evolution_change_artifacts: no HUMAN_APPROVED evolution_approvals row exists for this record_hash'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists evolution_change_artifacts_guard_insert on evolution_change_artifacts;
create trigger evolution_change_artifacts_guard_insert
  before insert on evolution_change_artifacts
  for each row execute function evolution_change_artifacts_require_approved_record();

drop trigger if exists evolution_change_artifacts_no_update_delete on evolution_change_artifacts;
create trigger evolution_change_artifacts_no_update_delete
  before update or delete on evolution_change_artifacts
  for each row execute function evolution_change_artifacts_reject_mutation();

drop trigger if exists evolution_change_artifacts_no_truncate on evolution_change_artifacts;
create trigger evolution_change_artifacts_no_truncate
  before truncate on evolution_change_artifacts
  for each statement execute function evolution_change_artifacts_reject_mutation();
