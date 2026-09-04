-- ---------------------------------------------------------------------------
-- ELVOID Macro Intelligence — ingestion lock table (Phase G.5).
--
-- Deliberately its own small table in Main Supabase, NOT a reuse of
-- autonomous_runtime_lock (which lives in the isolated Learning DB for an
-- unrelated concern). Same claim/stale-reclaim algorithm, different
-- storage — see lib/economicData/ingestionLock.ts's header.
--
-- Purely additive.
-- ---------------------------------------------------------------------------

create table if not exists macro_ingestion_lock (
  id text primary key,
  running boolean not null default false,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);
