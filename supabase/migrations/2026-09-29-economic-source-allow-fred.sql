-- 2026-09-29 — allow the FRED supporting provider to persist.
--
-- ROOT CAUSE (production evidence, 2026-09-28 23:10 UTC ingest run):
--   [economicData:repository] upsertObservations: new row for relation
--   "economic_observations" violates check constraint
--   "economic_observations_source_check"
-- The Phase-9 FRED provider writes source = 'fred', but the Phase-G migration
-- only allowed ('forexfactory', 'alphavantage'). Every FRED write was rejected.
--
-- ADDITIVE ONLY: existing values stay valid; no row is modified or deleted.
-- Already applied to the production Learning DB via apply_migration
-- (economic_source_allow_fred_supporting). Safe to re-run (drop-if-exists).

alter table public.economic_observations drop constraint if exists economic_observations_source_check;
alter table public.economic_observations add constraint economic_observations_source_check check (source in ('forexfactory', 'alphavantage', 'fred'));

alter table public.economic_releases drop constraint if exists economic_releases_source_check;
alter table public.economic_releases add constraint economic_releases_source_check check (source in ('forexfactory', 'alphavantage', 'fred'));
