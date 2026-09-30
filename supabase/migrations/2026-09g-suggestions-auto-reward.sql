-- ---------------------------------------------------------------------------
-- Phase 6.6.4b — Suggestions: switch to Model B (automatic distribution on
-- admin approval), matching the product requirement that an approved
-- Suggestion reward eventually produces a real on-chain distribution
-- without requiring a separate user "Claim" action.
--
-- Additive only: widens the status check constraint to allow REWARDED as
-- the new terminal "reward paid" state. CLAIMED is kept in the allowed set
-- for backward compatibility with any historical row (none currently exist
-- with that status, but this avoids ever needing a data migration/backfill
-- here). CLAIMING is reused unchanged as the in-flight guard state — it is
-- now entered by the approve route itself (server-side), not by a user
-- clicking a claim button.
--
-- Does not touch any other table. Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

alter table suggestions drop constraint if exists suggestions_status_check;

alter table suggestions add constraint suggestions_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CLAIMING', 'CLAIMED', 'REWARDED'));
