-- ---------------------------------------------------------------------------
-- ELVOID PRO ORACLE — premium signal tracking (Phase 5)
--
-- Reuses the existing ai_signals table end-to-end (no new table, per spec
-- §8/§18). Every column here is nullable/defaulted so it's fully backward
-- compatible with every row and every query written before this migration.
--
-- - source            : which engine produced this signal. Defaults to the
--                        pre-existing normal AI Signal system so old rows
--                        (and any insert path that doesn't set it) are
--                        unaffected.
-- - premium           : true only for ELVOID_PRO_ORACLE-sourced rows —
--                        drives 👑 PRO badge + field hiding in the UI.
-- - oracle_grade      : NO_TRADE never gets inserted as a row (only
--                        executable B+/A/A+ assessments become signals), so
--                        the check constraint intentionally excludes it.
-- - oracle_signal_id  : deterministic id derived from the OracleAssessment
--                        at generation time (see lib/ai/oracle/execute.ts),
--                        UNIQUE so a duplicate execute click can never
--                        create a second PaperTrade row for the same Oracle
--                        signal (spec §8 idempotency).
-- ---------------------------------------------------------------------------

alter table ai_signals add column if not exists source text not null default 'AI_SIGNAL' check (source in ('AI_SIGNAL', 'ELVOID_PRO_ORACLE'));
alter table ai_signals add column if not exists premium boolean not null default false;
alter table ai_signals add column if not exists oracle_grade text check (oracle_grade in ('B+', 'A', 'A+'));
alter table ai_signals add column if not exists oracle_signal_id text;

create unique index if not exists ai_signals_oracle_signal_id_key on ai_signals (oracle_signal_id) where oracle_signal_id is not null;
