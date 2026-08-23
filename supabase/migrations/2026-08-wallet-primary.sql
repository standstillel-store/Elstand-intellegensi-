-- ============================================================================
-- Phase 6.6 — Wallet Identity: primary wallet
-- ============================================================================
-- `wallets` (supabase/schema.sql) already supports multiple linked wallets
-- per user, but has no stable concept of WHICH one is the user's canonical
-- identity for reward verification / profile display. Today that's
-- improvised per-caller (app/api/rewards/status/route.ts picks
-- "most recently connected", app/api/rewards/verify/route.ts didn't check
-- at all) — this migration makes it a real, queryable column instead.
--
-- Backfill: a user's most-recently-connected VERIFIED wallet becomes their
-- primary, preserving today's de-facto behavior instead of silently
-- changing which wallet existing users see as "theirs".
-- ============================================================================

alter table wallets add column if not exists is_primary boolean not null default false;

-- Exactly one primary wallet per user. Partial index (only rows where
-- is_primary is true) so users can freely have any number of non-primary
-- rows — this only constrains the "true" rows.
create unique index if not exists wallets_one_primary_per_user
  on wallets (user_id)
  where is_primary;

-- Backfill: for every user with at least one verified wallet and no
-- primary set yet, promote their most-recently-connected verified wallet.
-- DISTINCT ON picks exactly one row per user_id (ties broken by
-- last_connected_at desc, then id for determinism).
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by last_connected_at desc, id
    ) as rn
  from wallets
  where verified = true
)
update wallets w
set is_primary = true
from ranked r
where w.id = r.id
  and r.rn = 1
  and not exists (
    select 1 from wallets w2 where w2.user_id = w.user_id and w2.is_primary
  );
