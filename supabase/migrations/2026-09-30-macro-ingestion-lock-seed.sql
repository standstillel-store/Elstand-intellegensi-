-- ---------------------------------------------------------------------------
-- ELVOID Macro Intelligence — seed the ingestion lock row (Phase G.5,
-- Correction 3, 2026-09-30).
--
-- 2026-09b-macro-ingestion-lock.sql created the macro_ingestion_lock table
-- but never seeded a row, so the runtime (lib/economicData/ingestionLock.ts)
-- used to lazily INSERT the row on first use — which meant every claim after
-- the very first one hit a 23505 unique-violation on that INSERT (caught and
-- handled in application code, but still logged by Postgres as an
-- ERROR-severity line on every single ingestion run, forever). The runtime
-- has been rewritten to only ever UPDATE the row (matching the
-- autonomous_runtime_lock convention in supabase/learning/schema.sql), so the
-- row must exist ahead of time.
--
-- Idempotent (ON CONFLICT DO NOTHING) and additive-only: on production this
-- is a no-op, since the lazy INSERT already created the row
-- (id = 'economic-data-ingest', confirmed present, running = false as of
-- 2026-09-30). This migration exists so any OTHER environment (a fresh Main
-- Supabase project, a reconstructed DB per the P3 Main-DB-reconstruction
-- effort) gets the row without ever going through the old insert-first path.
-- ---------------------------------------------------------------------------

insert into macro_ingestion_lock (id, running)
values ('economic-data-ingest', false)
on conflict (id) do nothing;
