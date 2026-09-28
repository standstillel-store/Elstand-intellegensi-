-- ---------------------------------------------------------------------------
-- Phase 9 — mandatory TEST -> REGRESSION -> HUMAN AUTHORIZATION gate
-- Learning Database ONLY. NEVER Main DB. Apply AFTER 2026-09d.
--
-- WHY (Final Master Audit, confirmed live 2026-09-27): the approval message
-- promised "nothing is deployed" while the wired pipeline merged to the
-- production branch right after code generation, with no test gate. The app
-- now stops after pushing an isolated branch, waits for CI (tsc --noEmit +
-- next build), and merges ONLY after a second explicit human authorization.
-- This file is the database half of that.
--
-- ADDITIVE, IDEMPOTENT, ONE DIRECTION: it only WIDENS two closed vocabularies
-- (evolution_patch_runs.status, evolution_patch_events.stage) — every value
-- that was valid before is still valid, so no existing row or code path
-- breaks — and adds three nullable columns. No data is touched, dropped or
-- rewritten. Nothing about evolution_change_artifacts or any upstream table
-- changes.
--
-- The DB-level authorization trigger is deliberately in the NEXT file
-- (2026-09f), applied only AFTER the new app code is deployed: with the old
-- code still live, that trigger would reject the old pipeline's merge record.
-- This file is a strict superset and is safe to apply BEFORE the deploy.
--
-- (2026-09f then makes the database itself refuse to record a merge that no
-- human authorized.)
-- ---------------------------------------------------------------------------

alter table evolution_patch_runs add column if not exists checks_run_url text;
alter table evolution_patch_runs add column if not exists authorized_by bigint;
alter table evolution_patch_runs add column if not exists authorized_at timestamptz;

alter table evolution_patch_runs drop constraint if exists evolution_patch_runs_status_check;
alter table evolution_patch_runs add constraint evolution_patch_runs_status_check check (status in (
  'CODE_GENERATION_FAILED','NO_AFFECTED_FILES_SCOPE','SCOPE_VIOLATION',
  'BRANCH_FAILED','COMMIT_FAILED',
  'BRANCH_PUSHED_AWAITING_CHECKS','CHECKS_FAILED','CHECKS_TIMEOUT',
  'AWAITING_HUMAN_AUTHORIZATION','AUTHORIZATION_REJECTED','AUTHORIZATION_TIMEOUT',
  'MERGE_CONFLICT','MERGE_FAILED',
  'PUSH_SUCCESS_DEPLOY_PENDING','DEPLOY_SUCCESS','DEPLOY_FAILED',
  'DEPLOY_TIMEOUT','DEPLOY_UNKNOWN','NOT_CONFIGURED'
));

alter table evolution_patch_events drop constraint if exists evolution_patch_events_stage_check;
alter table evolution_patch_events add constraint evolution_patch_events_stage_check check (stage in (
  'CODE_GENERATION','GIT_PUSH','DEPLOY_VERIFY','CONFIG','PIPELINE','CHECKS','AUTHORIZATION'
));
