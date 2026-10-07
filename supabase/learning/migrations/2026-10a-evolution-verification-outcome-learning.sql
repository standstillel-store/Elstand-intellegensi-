-- ---------------------------------------------------------------------------
-- Evolution post-deploy loop: PRODUCTION_VERIFICATION -> OUTCOME -> LEARNING.
-- Learning Database ONLY (spyadldinhdbazjuglqh). NEVER Main DB.
--
-- ADDITIVE + IDEMPOTENT. Three new tables, one widened CHECK constraint. No
-- existing table/column/trigger is altered except evolution_patch_events'
-- stage vocabulary (three values added, none removed). Safe to run more
-- than once. All three tables follow the convention of every evolution_*
-- table before them: service-role only (RLS enabled, zero policies),
-- append-only (UPDATE/DELETE/TRUNCATE rejected by trigger), identity by a
-- deterministic text id, and a BEFORE INSERT trigger so the DATABASE — not
-- only the application — refuses a row whose upstream fact does not exist.
--
-- CHAIN ENFORCED BY THE DATABASE (each link refuses to exist without the
-- previous one):
--   evolution_patch_runs (status DEPLOY_SUCCESS, human-authorized)
--     -> evolution_production_verifications (VERIFIED requires: deployment
--        READY, deployed sha = expected sha, every check passed)
--     -> evolution_outcomes (requires a VERIFIED verification for the same
--        patch run and the same commit sha)
--     -> evolution_learnings (requires a TERMINAL outcome whose kind matches
--        the learning, OR a FAILED verification and no VERIFIED one)
--
-- WHAT THIS DOES NOT DO: it does not create, approve, merge, deploy or
-- modify anything. It records evidence about something that already
-- happened. Nothing here can insert a fake candidate/approval/patch run —
-- every row must reference a real evolution_patch_runs row, which itself can
-- only exist for a HUMAN_APPROVED artifact (2026-09d) and can only reach
-- DEPLOY_SUCCESS with a recorded human authorization (2026-09f).
-- ---------------------------------------------------------------------------

-- 1. Widen the event-stage vocabulary (additive: three new values).
alter table evolution_patch_events drop constraint if exists evolution_patch_events_stage_check;
alter table evolution_patch_events add constraint evolution_patch_events_stage_check
  check (stage in ('CODE_GENERATION','GIT_PUSH','DEPLOY_VERIFY','CONFIG','PIPELINE','CHECKS','AUTHORIZATION','PRODUCTION_VERIFICATION','OUTCOME','LEARNING'));

-- 2. Production verifications (append-only; one row per ATTEMPT).
create table if not exists evolution_production_verifications (
  id uuid primary key default gen_random_uuid(),
  verification_id text not null unique,
  patch_run_id text not null references evolution_patch_runs (patch_run_id),
  record_hash text not null references evolution_change_artifacts (record_hash),
  artifact_id text not null,
  proposal_id text not null,
  candidate_id text not null,
  attempt_no integer not null check (attempt_no >= 1),
  status text not null check (status in ('VERIFIED','FAILED')),
  deployment_id text,
  deployment_state text,
  deployment_target text,
  deployment_ready_at timestamptz,
  expected_commit_sha text not null,
  deployed_commit_sha text,
  affected_endpoints jsonb not null default '[]'::jsonb,
  runtime_probes jsonb not null default '[]'::jsonb,
  checks jsonb not null,
  failure_reasons jsonb not null default '[]'::jsonb,
  verified_at timestamptz not null default now(),
  unique (patch_run_id, attempt_no)
);

-- At most ONE VERIFIED row per patch run: once verified, the run is verified
-- exactly once (idempotent under concurrent sweeps).
create unique index if not exists evolution_production_verifications_one_verified
  on evolution_production_verifications (patch_run_id) where status = 'VERIFIED';
create index if not exists evolution_production_verifications_run_idx
  on evolution_production_verifications (patch_run_id, attempt_no desc);

alter table evolution_production_verifications enable row level security;

-- 3. Outcomes (append-only; one row per EVALUATION of a verified deployment).
create table if not exists evolution_outcomes (
  id uuid primary key default gen_random_uuid(),
  outcome_id text not null unique,
  patch_run_id text not null references evolution_patch_runs (patch_run_id),
  verification_id text not null references evolution_production_verifications (verification_id),
  record_hash text not null references evolution_change_artifacts (record_hash),
  artifact_id text not null,
  proposal_id text not null,
  candidate_id text not null,
  source text not null,
  symbol text not null,
  gap_category text not null,
  commit_sha text not null,
  deployment_id text not null,
  deployed_at timestamptz not null,
  evaluation_no integer not null check (evaluation_no >= 1),
  outcome_status text not null check (outcome_status in ('IMPROVED','NOT_IMPROVED','REGRESSED','INSUFFICIENT_EVIDENCE')),
  metric text not null,
  baseline jsonb not null,
  post jsonb not null,
  gates jsonb not null,
  regression_check jsonb not null,
  reasons jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  unique (patch_run_id, evaluation_no)
);

-- At most ONE terminal outcome per patch run. INSUFFICIENT_EVIDENCE rows are
-- the (bounded, app-deduplicated) "still waiting for post-deploy decisions"
-- history and may repeat; a terminal verdict is recorded exactly once.
create unique index if not exists evolution_outcomes_one_terminal
  on evolution_outcomes (patch_run_id) where outcome_status <> 'INSUFFICIENT_EVIDENCE';
create index if not exists evolution_outcomes_run_idx on evolution_outcomes (patch_run_id, evaluation_no desc);
create index if not exists evolution_outcomes_gap_idx on evolution_outcomes (source, symbol, gap_category, evaluated_at desc);

alter table evolution_outcomes enable row level security;

-- 4. Learnings (append-only; exactly one per patch run).
create table if not exists evolution_learnings (
  id uuid primary key default gen_random_uuid(),
  learning_id text not null unique,
  patch_run_id text not null unique references evolution_patch_runs (patch_run_id),
  record_hash text not null references evolution_change_artifacts (record_hash),
  artifact_id text not null,
  proposal_id text not null,
  candidate_id text not null,
  source text not null,
  symbol text not null,
  gap_category text not null,
  commit_sha text not null,
  deployment_id text not null,
  derived_from text not null check (derived_from in ('OUTCOME','PRODUCTION_VERIFICATION')),
  outcome_id text references evolution_outcomes (outcome_id),
  verification_id text references evolution_production_verifications (verification_id),
  learning_kind text not null check (learning_kind in ('CHANGE_EFFECTIVE','CHANGE_INEFFECTIVE','CHANGE_HARMFUL','CHANGE_UNVERIFIED')),
  next_evolution_state text not null check (next_evolution_state in ('GAP_ADDRESSED_MONITOR','GAP_PERSISTS_REVISION_NEEDED','REGRESSION_REVIEW_REQUIRED','PRODUCTION_REVIEW_REQUIRED')),
  summary text not null,
  lineage jsonb not null,
  recorded_at timestamptz not null default now(),
  check ((derived_from = 'OUTCOME' and outcome_id is not null) or (derived_from = 'PRODUCTION_VERIFICATION' and verification_id is not null))
);

create index if not exists evolution_learnings_gap_idx on evolution_learnings (source, symbol, gap_category, recorded_at desc);

alter table evolution_learnings enable row level security;

-- 5. Guards.
create or replace function evolution_verification_reject_mutation() returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  raise exception '% is append-only: % is not permitted', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$fn$;

create or replace function evolution_production_verifications_guard_insert() returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  run evolution_patch_runs%rowtype;
begin
  select * into run from evolution_patch_runs where patch_run_id = new.patch_run_id;
  if not found then
    raise exception 'evolution_production_verifications: patch run % does not exist', new.patch_run_id
      using errcode = 'check_violation';
  end if;
  if run.status <> 'DEPLOY_SUCCESS' or run.authorized_by is null or run.authorized_at is null then
    raise exception 'evolution_production_verifications: patch run % is not a human-authorized DEPLOY_SUCCESS run (status %)', new.patch_run_id, run.status
      using errcode = 'check_violation';
  end if;
  if run.record_hash <> new.record_hash or run.artifact_id <> new.artifact_id or run.proposal_id <> new.proposal_id then
    raise exception 'evolution_production_verifications: record_hash/artifact_id/proposal_id do not match the patch run'
      using errcode = 'check_violation';
  end if;
  if new.expected_commit_sha is distinct from run.merge_commit_sha then
    raise exception 'evolution_production_verifications: expected_commit_sha must equal the patch run merge_commit_sha'
      using errcode = 'check_violation';
  end if;
  if new.status = 'VERIFIED' then
    if new.deployment_state is distinct from 'READY'
       or new.deployment_target is distinct from 'production'
       or new.deployed_commit_sha is distinct from new.expected_commit_sha
       or new.deployment_id is distinct from run.deployment_id then
      raise exception 'evolution_production_verifications: VERIFIED requires a READY production deployment of the expected commit'
        using errcode = 'check_violation';
    end if;
    if jsonb_typeof(new.checks) <> 'array' or jsonb_array_length(new.checks) = 0
       or exists (select 1 from jsonb_array_elements(new.checks) c where coalesce(c->>'passed', 'false') <> 'true') then
      raise exception 'evolution_production_verifications: VERIFIED requires every recorded check to have passed'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$fn$;

create or replace function evolution_outcomes_guard_insert() returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v evolution_production_verifications%rowtype;
begin
  select * into v from evolution_production_verifications where verification_id = new.verification_id;
  if not found or v.status <> 'VERIFIED' then
    raise exception 'evolution_outcomes: an outcome requires a VERIFIED production verification'
      using errcode = 'check_violation';
  end if;
  if v.patch_run_id <> new.patch_run_id or v.record_hash <> new.record_hash
     or v.deployed_commit_sha is distinct from new.commit_sha or v.deployment_id is distinct from new.deployment_id then
    raise exception 'evolution_outcomes: patch run / record hash / commit / deployment do not match the verification'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

create or replace function evolution_learnings_guard_insert() returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  o evolution_outcomes%rowtype;
  v evolution_production_verifications%rowtype;
begin
  if new.derived_from = 'OUTCOME' then
    select * into o from evolution_outcomes where outcome_id = new.outcome_id;
    if not found or o.outcome_status = 'INSUFFICIENT_EVIDENCE' then
      raise exception 'evolution_learnings: a learning derived from an outcome requires a terminal outcome'
        using errcode = 'check_violation';
    end if;
    if o.patch_run_id <> new.patch_run_id or o.record_hash <> new.record_hash then
      raise exception 'evolution_learnings: outcome does not belong to this patch run'
        using errcode = 'check_violation';
    end if;
    if not ((o.outcome_status = 'IMPROVED' and new.learning_kind = 'CHANGE_EFFECTIVE' and new.next_evolution_state = 'GAP_ADDRESSED_MONITOR')
         or (o.outcome_status = 'NOT_IMPROVED' and new.learning_kind = 'CHANGE_INEFFECTIVE' and new.next_evolution_state = 'GAP_PERSISTS_REVISION_NEEDED')
         or (o.outcome_status = 'REGRESSED' and new.learning_kind = 'CHANGE_HARMFUL' and new.next_evolution_state = 'REGRESSION_REVIEW_REQUIRED')) then
      raise exception 'evolution_learnings: learning kind / next state do not match the outcome status %', o.outcome_status
        using errcode = 'check_violation';
    end if;
  else
    select * into v from evolution_production_verifications where verification_id = new.verification_id;
    if not found or v.status <> 'FAILED' or v.patch_run_id <> new.patch_run_id then
      raise exception 'evolution_learnings: a verification-derived learning requires a FAILED verification of this patch run'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from evolution_production_verifications x where x.patch_run_id = new.patch_run_id and x.status = 'VERIFIED') then
      raise exception 'evolution_learnings: this patch run is VERIFIED — an unverified learning is not permitted'
        using errcode = 'check_violation';
    end if;
    if new.learning_kind <> 'CHANGE_UNVERIFIED' or new.next_evolution_state <> 'PRODUCTION_REVIEW_REQUIRED' then
      raise exception 'evolution_learnings: a verification-derived learning must be CHANGE_UNVERIFIED / PRODUCTION_REVIEW_REQUIRED'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists evolution_production_verifications_guard_insert on evolution_production_verifications;
create trigger evolution_production_verifications_guard_insert
  before insert on evolution_production_verifications
  for each row execute function evolution_production_verifications_guard_insert();

drop trigger if exists evolution_outcomes_guard_insert on evolution_outcomes;
create trigger evolution_outcomes_guard_insert
  before insert on evolution_outcomes
  for each row execute function evolution_outcomes_guard_insert();

drop trigger if exists evolution_learnings_guard_insert on evolution_learnings;
create trigger evolution_learnings_guard_insert
  before insert on evolution_learnings
  for each row execute function evolution_learnings_guard_insert();

drop trigger if exists evolution_production_verifications_no_mutation on evolution_production_verifications;
create trigger evolution_production_verifications_no_mutation
  before update or delete on evolution_production_verifications
  for each row execute function evolution_verification_reject_mutation();
drop trigger if exists evolution_production_verifications_no_truncate on evolution_production_verifications;
create trigger evolution_production_verifications_no_truncate
  before truncate on evolution_production_verifications
  for each statement execute function evolution_verification_reject_mutation();

drop trigger if exists evolution_outcomes_no_mutation on evolution_outcomes;
create trigger evolution_outcomes_no_mutation
  before update or delete on evolution_outcomes
  for each row execute function evolution_verification_reject_mutation();
drop trigger if exists evolution_outcomes_no_truncate on evolution_outcomes;
create trigger evolution_outcomes_no_truncate
  before truncate on evolution_outcomes
  for each statement execute function evolution_verification_reject_mutation();

drop trigger if exists evolution_learnings_no_mutation on evolution_learnings;
create trigger evolution_learnings_no_mutation
  before update or delete on evolution_learnings
  for each row execute function evolution_verification_reject_mutation();
drop trigger if exists evolution_learnings_no_truncate on evolution_learnings;
create trigger evolution_learnings_no_truncate
  before truncate on evolution_learnings
  for each statement execute function evolution_verification_reject_mutation();
