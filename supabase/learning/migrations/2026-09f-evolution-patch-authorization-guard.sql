-- ---------------------------------------------------------------------------
-- Phase 9 — DB-level authorization guard. Learning Database ONLY.
-- Apply AFTER 2026-09e AND AFTER the app code that stops auto-merging is
-- deployed (see 2026-09e header for why the order matters).
--
-- ENFORCED BY THE DATABASE, not only by the application:
--   * A row can only be written with a status that means "merged" or later
--     (PUSH_SUCCESS_DEPLOY_PENDING, DEPLOY_*) if authorized_by AND
--     authorized_at are both set — even a bug in the app cannot record a
--     merge that no human authorized.
--   * Once authorized_by/authorized_at are set they cannot be changed/cleared.
-- Caveat stated plainly: a schema owner can drop the trigger, and the service
-- role can still call GitHub's merge API outside this app — this is a
-- consistency guard on this table, not a GitHub permission boundary.
-- ---------------------------------------------------------------------------

create or replace function evolution_patch_runs_require_authorization_for_merge() returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.status in ('PUSH_SUCCESS_DEPLOY_PENDING','DEPLOY_SUCCESS','DEPLOY_FAILED','DEPLOY_TIMEOUT','DEPLOY_UNKNOWN')
     and (new.authorized_by is null or new.authorized_at is null) then
    raise exception 'evolution_patch_runs: status % requires a human authorization (authorized_by and authorized_at)', new.status
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.authorized_at is not null
     and (new.authorized_at is distinct from old.authorized_at or new.authorized_by is distinct from old.authorized_by) then
    raise exception 'evolution_patch_runs: authorized_by/authorized_at are immutable once set'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists evolution_patch_runs_require_authorization on evolution_patch_runs;
create trigger evolution_patch_runs_require_authorization
  before insert or update on evolution_patch_runs
  for each row execute function evolution_patch_runs_require_authorization_for_merge();
