-- ---------------------------------------------------------------------------
-- Phase 9 — Controlled Self-Coding: patch runs + patch events
-- Learning Database ONLY (spyadldinhdbazjuglqh). NEVER Main DB.
--
-- ADDITIVE ONLY: two new tables. No existing table/column/constraint is
-- altered. evolution_change_artifacts (2026-09c) is untouched — its
-- patch_status stays permanently 'NOT_EXECUTED' forever; Phase 9 tracks its
-- OWN real execution state here, keyed off the SAME record_hash, rather
-- than reopening that table's closed enum (see
-- lib/ai/evolutionCoding/contracts.ts's own header for why).
--
-- WHY TWO TABLES WITH DIFFERENT MUTABILITY (unlike every table before this):
--   * evolution_patch_runs — ONE row per artifact, and it is allowed to be
--     UPDATED as the run progresses (CODE_GENERATION -> GIT_PUSH ->
--     DEPLOY_VERIFY). This is the first mutable evolution_* table in the
--     codebase because it is the first genuinely asynchronous, multi-stage
--     process: a deployment can still be building when this app's own
--     request has already returned (see lib/ai/evolutionPipeline/run.ts's
--     header). An append-only table cannot represent "the current status of
--     something still in progress" without either a second query to find
--     the latest row or an ever-growing full-history read — this table is
--     the answer to "what is the CURRENT status", nothing else.
--   * evolution_patch_events — append-only, exactly like every table
--     before it. The durable, ordered lineage Section M requires (proposal
--     -> candidate -> validation -> approval -> change -> commit ->
--     deployment -> result) lives here, independent of whatever the mutable
--     row above says right now.
--
-- ENFORCED BY THE DATABASE:
--   * evolution_patch_runs: BEFORE INSERT requires a HUMAN_APPROVED
--     evolution_change_artifacts row to already exist for this record_hash
--     (same guard shape as 2026-09c) — a run can never be created for an
--     artifact nobody approved. UPDATE is allowed (unlike 2026-09c) but
--     record_hash/artifact_id/proposal_id/started_at are immutable once
--     set — a trigger rejects any UPDATE that changes them. DELETE and
--     TRUNCATE are rejected outright, same as every other evolution_* table.
--   * evolution_patch_events: append-only — UPDATE/DELETE/TRUNCATE rejected
--     outright, same convention as every table before it.
--
-- Both tables are service-role only (RLS enabled, zero policies — same
-- convention as everywhere else in this schema).
--
-- NOT YET APPLIED to the live Learning DB from this environment: this
-- sandbox has no network access and no Supabase credentials — this file is
-- prepared SQL only, same caveat 2026-09c already states. Apply via
-- `supabase db push` / the SQL editor as a manual step, AFTER
-- 2026-09c-evolution-change-artifacts.sql.
-- ---------------------------------------------------------------------------

create table if not exists evolution_patch_runs (
  id uuid primary key default gen_random_uuid(),
  patch_run_id text not null unique,
  record_hash text not null unique references evolution_change_artifacts (record_hash),
  artifact_id text not null,
  proposal_id text not null,
  status text not null check (status in (
    'CODE_GENERATION_FAILED','NO_AFFECTED_FILES_SCOPE','SCOPE_VIOLATION',
    'BRANCH_FAILED','COMMIT_FAILED','MERGE_CONFLICT','MERGE_FAILED',
    'PUSH_SUCCESS_DEPLOY_PENDING','DEPLOY_SUCCESS','DEPLOY_FAILED',
    'DEPLOY_TIMEOUT','DEPLOY_UNKNOWN','NOT_CONFIGURED'
  )),
  branch text,
  base_sha text,
  commit_sha text,
  merge_commit_sha text,
  deployment_id text,
  deployment_url text,
  failed_stage text,
  error_summary text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists evolution_patch_runs_proposal_idx on evolution_patch_runs (proposal_id, started_at desc);
create index if not exists evolution_patch_runs_merge_sha_idx on evolution_patch_runs (merge_commit_sha);

alter table evolution_patch_runs enable row level security;

create table if not exists evolution_patch_events (
  id uuid primary key default gen_random_uuid(),
  patch_run_id text not null,
  record_hash text not null references evolution_change_artifacts (record_hash),
  stage text not null check (stage in ('CODE_GENERATION', 'GIT_PUSH', 'DEPLOY_VERIFY', 'CONFIG', 'PIPELINE')),
  outcome text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists evolution_patch_events_run_idx on evolution_patch_events (patch_run_id, created_at);

alter table evolution_patch_events enable row level security;

create or replace function evolution_patch_reject_mutation() returns trigger
language plpgsql
as $fn$
begin
  raise exception 'evolution_patch_events is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$fn$;

create or replace function evolution_patch_runs_require_approved_artifact() returns trigger
language plpgsql
as $fn$
begin
  if not exists (
    select 1
    from evolution_change_artifacts a
    where a.record_hash = new.record_hash
      and a.artifact_status = 'AWAITING_HUMAN_PATCH'
  ) then
    raise exception 'evolution_patch_runs: no AWAITING_HUMAN_PATCH evolution_change_artifacts row exists for this record_hash'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

create or replace function evolution_patch_runs_guard_update() returns trigger
language plpgsql
as $fn$
begin
  if new.record_hash <> old.record_hash or new.artifact_id <> old.artifact_id or new.proposal_id <> old.proposal_id or new.started_at <> old.started_at then
    raise exception 'evolution_patch_runs: record_hash/artifact_id/proposal_id/started_at are immutable once set'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists evolution_patch_runs_guard_insert on evolution_patch_runs;
create trigger evolution_patch_runs_guard_insert
  before insert on evolution_patch_runs
  for each row execute function evolution_patch_runs_require_approved_artifact();

drop trigger if exists evolution_patch_runs_guard_update on evolution_patch_runs;
create trigger evolution_patch_runs_guard_update
  before update on evolution_patch_runs
  for each row execute function evolution_patch_runs_guard_update();

drop trigger if exists evolution_patch_runs_no_delete on evolution_patch_runs;
create trigger evolution_patch_runs_no_delete
  before delete on evolution_patch_runs
  for each row execute function evolution_patch_reject_mutation();

drop trigger if exists evolution_patch_runs_no_truncate on evolution_patch_runs;
create trigger evolution_patch_runs_no_truncate
  before truncate on evolution_patch_runs
  for each statement execute function evolution_patch_reject_mutation();

drop trigger if exists evolution_patch_events_no_update_delete on evolution_patch_events;
create trigger evolution_patch_events_no_update_delete
  before update or delete on evolution_patch_events
  for each row execute function evolution_patch_reject_mutation();

drop trigger if exists evolution_patch_events_no_truncate on evolution_patch_events;
create trigger evolution_patch_events_no_truncate
  before truncate on evolution_patch_events
  for each statement execute function evolution_patch_reject_mutation();
