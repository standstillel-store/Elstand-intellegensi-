-- ---------------------------------------------------------------------------
-- ELVOID Macro Intelligence — economic_releases + economic_observations
--
-- Two separate tables, per architecture correction §3/§7: a RELEASE is a
-- scheduled market event (actual/forecast/previous as of a specific
-- release); an OBSERVATION is a raw historical time-series value used for
-- trend/momentum. Never merged.
--
-- Idempotency: `id` on both tables is the deterministic composite key
-- built in lib/economicData/normalize.ts
-- (`${source}:${indicatorId}:${country}:${period}`) — NOT a loose title
-- string and NOT scheduledAt alone, so CPI_HEADLINE_YOY can never collide
-- with CPI_HEADLINE_MOM or CORE_CPI_YOY, and a rescheduled release keeps
-- its identity. Re-running ingestion upserts on this primary key — a
-- release moving from "upcoming" to "released", or gaining a
-- revised_previous next month, updates the existing row in place rather
-- than inserting a duplicate.
--
-- Purely additive — no existing table touched.
-- ---------------------------------------------------------------------------

create table if not exists economic_releases (
  id text primary key,
  source text not null check (source in ('forexfactory', 'alphavantage')),

  indicator_id text not null,
  raw_title text not null,

  country text not null,
  currency text,
  impact text not null check (impact in ('low', 'medium', 'high')),

  scheduled_at timestamptz not null,
  release_period text,

  actual text,
  forecast text,
  previous text,
  revised_previous text,

  status text not null check (status in ('upcoming', 'released', 'pending')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists economic_releases_indicator_idx on economic_releases (indicator_id, country, scheduled_at desc);

create table if not exists economic_observations (
  id text primary key,
  source text not null check (source in ('forexfactory', 'alphavantage')),

  indicator_id text not null,
  country text not null,

  observation_period text not null,
  value text not null,
  unit text,
  published_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists economic_observations_indicator_idx on economic_observations (indicator_id, country, observation_period desc);
