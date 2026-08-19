-- ============================================================================
-- ElVoid AI Paper Trader — Supabase schema
-- ============================================================================
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New
-- query -> paste -> Run), or via `supabase db push` if you use the CLI.
-- Every statement is idempotent, so it's safe to re-run.
--
-- Design note: ai_signals doubles as the "open position" record once a
-- signal is executed as a paper trade. There is no separate "trades" table
-- — status moves new -> open -> tp1_hit -> closed (or invalidated/expired
-- if never executed), so the signal IS the trade. This keeps the schema
-- exactly what was asked for (ai_signals / ai_journal / ai_statistics /
-- paper_wallet) without inventing extra tables.
-- ============================================================================

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- ai_signals — every signal ElVoid AI generates (scan or on-demand analysis)
-- ----------------------------------------------------------------------------
create table if not exists ai_signals (
  id uuid primary key default gen_random_uuid(),
  coin text not null,                          -- e.g. "BTC"
  side text not null check (side in ('LONG','SHORT')),
  entry numeric not null,
  sl numeric not null,
  tp1 numeric not null,
  tp2 numeric not null,
  tp3 numeric,                                 -- optional 3rd target, ElVoid AI UI redesign (2026-07)
  timeframe text not null default '4h',        -- candle interval the signal was generated on
  scans jsonb,                                 -- structured ScanResult[] snapshot, powers the AI Reasoning checklist UI
  extra_reasoning jsonb,                       -- structured extended ScanResult[] (FVG/OB/Funding/OI/SMT/MACD/Stablecoin), same purpose
  order_type text not null default 'market' check (order_type in ('market', 'limit', 'stop')),
  trade_grade text check (trade_grade in ('A++', 'A+', 'A', 'B+', 'B', 'C+', 'C')),
  probability_tp numeric,                      -- estimated probability (%) of hitting a TP before SL — see lib/elvoid/engine.ts
  probability_sl numeric,
  confluence_count integer,                    -- Phase 2.8: how many of 12 named factors agreed with side at generation time
  confluence_total integer,
  ideal_entry_low numeric,                     -- Phase 2.8: Ideal Entry Zone as a price range, not a single tick
  ideal_entry_high numeric,
  expected_duration text,                      -- Phase 2.8: rough timeframe-based hold estimate, e.g. "est. 1-3 hari"
  confirmation_status text,                    -- Phase 2.8: Entry System status snapshot at generation time (confirmed/waiting/invalid)
  confirmation_zone_ok boolean,                 -- Phase 2.8: discount/premium zone gate, re-used by lib/elvoid/confirmation.ts on read
  confidence numeric not null check (confidence >= 0 and confidence <= 100),
  risk_percent numeric not null default 1,
  reason text not null,                        -- human-readable narrative (Bahasa Indonesia)
  strategy text not null,                      -- e.g. "Liquidity Sweep Reversal"
  status text not null default 'new' check (
    status in ('new', 'pending', 'open', 'tp1_hit', 'closed', 'invalidated', 'expired')
  ),
  created_at timestamptz not null default now()
);

-- Safe to re-run against a database created before the 2026-07 UI redesign.
alter table ai_signals add column if not exists tp3 numeric;
alter table ai_signals add column if not exists timeframe text not null default '4h';
alter table ai_signals add column if not exists scans jsonb;
alter table ai_signals add column if not exists extra_reasoning jsonb;

-- Safe to re-run against a database created before the AI Trading Terminal
-- upgrade (2026-07, part 2): Market/Limit/Stop orders, Trade Grade, and
-- Probability TP/SL.
alter table ai_signals add column if not exists order_type text not null default 'market';
alter table ai_signals add column if not exists trade_grade text;
alter table ai_signals add column if not exists probability_tp numeric;
alter table ai_signals add column if not exists probability_sl numeric;
alter table ai_signals drop constraint if exists ai_signals_order_type_check;
alter table ai_signals add constraint ai_signals_order_type_check check (order_type in ('market', 'limit', 'stop'));
-- Safe to re-run against a database created before the Phase 2.8 AI Signal
-- Engine upgrade (2026-07): widens trade_grade / auto_execute_min_grade from
-- 4 tiers (A+/A/B/C) to 7 (A++/A+/A/B+/B/C+/C). Old values already stored
-- still satisfy the new (wider) constraint, so this is non-destructive —
-- but it must be re-run once against any existing project, or inserts using
-- a new grade like "A++" will fail the old CHECK.
alter table ai_signals drop constraint if exists ai_signals_trade_grade_check;
alter table ai_signals add constraint ai_signals_trade_grade_check check (trade_grade in ('A++', 'A+', 'A', 'B+', 'B', 'C+', 'C'));
alter table ai_signals add column if not exists confluence_count integer;
alter table ai_signals add column if not exists confluence_total integer;
alter table ai_signals add column if not exists ideal_entry_low numeric;
alter table ai_signals add column if not exists ideal_entry_high numeric;
alter table ai_signals add column if not exists expected_duration text;
alter table ai_signals add column if not exists confirmation_status text;
alter table ai_signals add column if not exists confirmation_zone_ok boolean;
alter table ai_signals drop constraint if exists ai_signals_status_check;
alter table ai_signals add constraint ai_signals_status_check
  check (status in ('new', 'pending', 'open', 'tp1_hit', 'closed', 'invalidated', 'expired'));

create index if not exists ai_signals_status_idx on ai_signals (status);
create index if not exists ai_signals_coin_idx on ai_signals (coin);
create index if not exists ai_signals_created_at_idx on ai_signals (created_at desc);

-- ----------------------------------------------------------------------------
-- ai_journal — one row per CLOSED paper trade
-- ----------------------------------------------------------------------------
create table if not exists ai_journal (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references ai_signals (id) on delete set null,
  result text not null check (result in ('win', 'loss', 'breakeven')),
  profit_percent numeric not null,             -- % of equity at time of close
  rr numeric not null,                         -- realized reward:risk multiple
  duration_minutes integer,
  notes text,
  screenshot_url text,                         -- optional trade screenshot, Supabase Storage public URL
  closed_at timestamptz not null default now()
);

-- Safe to re-run against a database created before the 2026-07 UI redesign.
alter table ai_journal add column if not exists screenshot_url text;

create index if not exists ai_journal_signal_idx on ai_journal (signal_id);
create index if not exists ai_journal_closed_at_idx on ai_journal (closed_at desc);

-- ----------------------------------------------------------------------------
-- ai_statistics — single summary row (id = 1), recomputed after every close
-- ----------------------------------------------------------------------------
create table if not exists ai_statistics (
  id smallint primary key default 1,
  total_trade integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  win_rate numeric not null default 0,          -- 0-100
  average_rr numeric not null default 0,
  profit_factor numeric not null default 0,     -- gross win / gross loss
  max_drawdown numeric not null default 0,      -- % of equity, positive number
  total_profit numeric not null default 0,      -- % of starting equity, cumulative
  updated_at timestamptz not null default now(),
  constraint ai_statistics_singleton check (id = 1)
);

-- ----------------------------------------------------------------------------
-- paper_wallet — single wallet row (id = 1)
-- ----------------------------------------------------------------------------
create table if not exists paper_wallet (
  id smallint primary key default 1,
  balance numeric not null default 10000,
  equity numeric not null default 10000,
  total_profit numeric not null default 0,
  risk_per_trade numeric not null default 1,    -- % of equity risked per trade
  auto_execute boolean not null default false,  -- when true, scan route auto-opens qualifying signals as Market orders
  auto_execute_min_grade text not null default 'A' check (auto_execute_min_grade in ('A++', 'A+', 'A', 'B+', 'B', 'C+', 'C')),
  updated_at timestamptz not null default now(),
  constraint paper_wallet_singleton check (id = 1)
);

-- Safe to re-run against a database created before the AI Trading Terminal upgrade (2026-07, part 2).
alter table paper_wallet add column if not exists auto_execute boolean not null default false;
alter table paper_wallet add column if not exists auto_execute_min_grade text not null default 'A';
alter table paper_wallet drop constraint if exists paper_wallet_auto_execute_min_grade_check;
alter table paper_wallet add constraint paper_wallet_auto_execute_min_grade_check check (auto_execute_min_grade in ('A++', 'A+', 'A', 'B+', 'B', 'C+', 'C'));

insert into ai_statistics (id) values (1) on conflict (id) do nothing;
insert into paper_wallet (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- watchlist_items — coins "Scan Market" covers (AI Signal -> Watchlist tab).
-- User-editable (add/remove) instead of the old hardcoded ELVOID_WATCHLIST
-- array in lib/elvoid/watchlist.ts. Seeded with the same 15 symbols below so
-- behavior is unchanged for existing deployments until someone edits it.
-- ----------------------------------------------------------------------------
create table if not exists watchlist_items (
  id uuid primary key default gen_random_uuid(),
  coin text not null unique,                    -- e.g. "BTC"
  added_at timestamptz not null default now()
);

insert into watchlist_items (coin) values
  ('BTC'), ('ETH'), ('SOL'), ('BNB'), ('XRP'), ('DOGE'), ('ADA'), ('AVAX'),
  ('LINK'), ('SUI'), ('PEPE'), ('WIF'), ('ARB'), ('OP'), ('TON')
on conflict (coin) do nothing;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- This is a single-user paper-trading tool with no login. The app's API
-- routes talk to Supabase from the server only, using SUPABASE_SERVICE_ROLE_KEY
-- (which bypasses RLS by design) — never the anon/public key from the
-- browser. RLS is enabled with zero public policies below, which blocks the
-- anon key from touching these tables at all if it ever leaked client-side.
alter table ai_signals enable row level security;
alter table ai_journal enable row level security;
alter table ai_statistics enable row level security;
alter table paper_wallet enable row level security;
alter table watchlist_items enable row level security;

-- ----------------------------------------------------------------------------
-- Storage bucket for trade screenshots (AI Journal / Paper Trader)
-- ----------------------------------------------------------------------------
-- Run once, separately, from the Supabase dashboard (Storage -> New bucket)
-- or via the CLI — bucket creation isn't a plain SQL statement:
--   1. Create a bucket named "trade-screenshots", set to Public.
--   2. No public INSERT policy needed: uploads go through
--      /api/paper-trader/journal/screenshot, a server route using the
--      service-role key, same pattern as every other write in this file.

-- ============================================================================
-- Binance Testnet/Live Trading Engine (lib/binance/*, app/api/binance/*)
-- ============================================================================
-- Everything below this line supports REAL order execution against Binance
-- Spot/Futures Testnet (or Live, if BINANCE_MODE=live) — a different thing
-- from ai_signals/ai_journal/paper_wallet above, which stay a pure
-- simulation. Binance itself remains the source of truth for balances,
-- positions, and order status (fetched live via signed REST calls); these
-- tables only hold what Binance doesn't: our own idempotency/audit trail,
-- auto-trader configuration, per-position strategy metadata, and the
-- decision journal. Same singleton-row-by-id pattern and same RLS posture
-- (service-role key only, zero public policies) as every table above.

-- ----------------------------------------------------------------------------
-- bn_credentials — optional encrypted API key storage (Settings UI path).
-- The recommended path is still plain env vars (BINANCE_API_KEY /
-- BINANCE_SECRET_KEY), which never touch this table at all. See
-- lib/binance/credentials.ts. AES-256-GCM ciphertext only — no plaintext
-- key ever reaches Postgres, and ENCRYPTION_KEY (env-only) is required to
-- decrypt, so a DB leak alone is not enough to recover a usable key.
-- ----------------------------------------------------------------------------
create table if not exists bn_credentials (
  id smallint primary key default 1,
  api_key_encrypted jsonb not null,
  secret_key_encrypted jsonb not null,
  updated_at timestamptz not null default now(),
  constraint bn_credentials_singleton check (id = 1)
);

-- ----------------------------------------------------------------------------
-- bn_orders_log — every order ElVoid AI's Trading Engine has placed, keyed
-- by the client_order_id we generated (unique -> the idempotency guard
-- lib/binance/orderGuard.ts relies on to reject accidental double-submits).
-- Binance's own order/orderId is authoritative for live status; this row is
-- the durable record of *why* the order was placed (manual vs AI, which
-- strategy, how many confluences, the RR at entry) once Binance's own
-- history eventually ages out or gets queried per-symbol only.
-- ----------------------------------------------------------------------------
create table if not exists bn_orders_log (
  id uuid primary key default gen_random_uuid(),
  client_order_id text not null unique,
  binance_order_id bigint,
  symbol text not null,
  market text not null check (market in ('spot', 'futures')),
  mode text not null check (mode in ('testnet', 'live')),
  side text not null check (side in ('BUY', 'SELL')),
  position_side text not null default 'BOTH' check (position_side in ('LONG', 'SHORT', 'BOTH')),
  order_type text not null,
  quantity numeric not null,
  price numeric,
  stop_price numeric,
  status text not null default 'NEW',
  reduce_only boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'auto_trader', 'emergency')),
  strategy text,
  confluences integer,
  risk_percent numeric,
  risk_reward numeric,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bn_orders_log_symbol_idx on bn_orders_log (symbol);
create index if not exists bn_orders_log_created_at_idx on bn_orders_log (created_at desc);
create index if not exists bn_orders_log_source_idx on bn_orders_log (source);

-- ----------------------------------------------------------------------------
-- bn_position_meta — strategy metadata for the position currently open on a
-- symbol (one-way mode assumed, so one row per symbol at a time). Binance's
-- positionRisk endpoint has no room for "which strategy opened this" or
-- "has the stop already been moved to breakeven" — this table is exactly
-- that missing state, read/written every auto-trader tick.
-- ----------------------------------------------------------------------------
create table if not exists bn_position_meta (
  symbol text primary key,
  side text not null check (side in ('LONG', 'SHORT')),
  entry_client_order_id text,
  strategy text,
  confluences integer,
  risk_reward numeric,
  initial_entry numeric,
  initial_stop numeric,
  tp1 numeric,
  tp2 numeric,
  tp3 numeric,
  breakeven_moved boolean not null default false,
  tp1_filled boolean not null default false,
  tp2_filled boolean not null default false,
  trailing_active boolean not null default false,
  opened_by text not null default 'manual' check (opened_by in ('manual', 'auto_trader')),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- bn_auto_trader_settings — single config row (id = 1) for the AI Auto
-- Trading loop (lib/binance/autoTrader.ts), ticked once a minute by
-- /api/binance/auto-trade/tick (Vercel Cron — see vercel.json).
-- ----------------------------------------------------------------------------
create table if not exists bn_auto_trader_settings (
  id smallint primary key default 1,
  enabled boolean not null default false,
  symbols text[] not null default array['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT'],
  timeframe text not null default '15m',
  risk_percent numeric not null default 1,
  leverage integer not null default 5,
  min_confluences integer not null default 5,
  min_risk_reward numeric not null default 3,
  max_risk_reward numeric not null default 10,
  max_concurrent_positions integer not null default 3,
  cooldown_minutes integer not null default 15,
  running boolean not null default false,
  last_run_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint bn_auto_trader_settings_singleton check (id = 1),
  constraint bn_auto_trader_settings_risk_check check (risk_percent > 0 and risk_percent <= 1),
  constraint bn_auto_trader_settings_confluence_check check (min_confluences >= 1),
  constraint bn_auto_trader_settings_rr_check check (min_risk_reward >= 3)
);

insert into bn_auto_trader_settings (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- bn_auto_trader_log — append-only decision journal. Every tick writes at
-- least one row per symbol it looked at ("skip_low_confluence",
-- "entry_opened", "exit_structure_break", ...), which is what the Auto
-- Trade Log panel and the Trade Monitor's "why did it (not) act" trail
-- render. Never overwritten — this is the audit trail an autonomous
-- trading loop needs to be trustworthy.
-- ----------------------------------------------------------------------------
create table if not exists bn_auto_trader_log (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  action text not null,
  symbol text,
  side text,
  detail text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bn_auto_trader_log_ran_at_idx on bn_auto_trader_log (ran_at desc);
create index if not exists bn_auto_trader_log_symbol_idx on bn_auto_trader_log (symbol);

-- ----------------------------------------------------------------------------
-- bn_emergency_stop — global kill-switch (id = 1). When stopped = true, the
-- auto-trader tick refuses to open new positions (existing positions can
-- still be closed/managed manually) until cleared from the dashboard.
-- ----------------------------------------------------------------------------
create table if not exists bn_emergency_stop (
  id smallint primary key default 1,
  stopped boolean not null default false,
  reason text,
  updated_at timestamptz not null default now(),
  constraint bn_emergency_stop_singleton check (id = 1)
);

insert into bn_emergency_stop (id) values (1) on conflict (id) do nothing;

alter table bn_credentials enable row level security;
alter table bn_orders_log enable row level security;
alter table bn_position_meta enable row level security;
alter table bn_auto_trader_settings enable row level security;
alter table bn_auto_trader_log enable row level security;
alter table bn_emergency_stop enable row level security;

-- ============================================================================
-- Phase 3 — Google Auth & User Profile
-- ============================================================================
-- lib/auth/profile.ts, lib/energy.ts, lib/activityLog.ts, and the
-- app/api/account/* + app/api/wallet/* routes already read/write the eight
-- tables below (several of their comments literally say "see the Phase 3
-- section of supabase/schema.sql") — this section is that migration, added
-- because it was missing from this file even though the application code
-- depended on it already. Same idempotent, safe-to-re-run style as the rest
-- of this file.

-- users — one row per signed-in account, 1:1 with auth.users. id is never
-- generated here; it's always the same UUID Supabase Auth already assigned.
create table if not exists users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  last_login_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);

-- profiles — Google-sourced display info (name/photo), kept separate from
-- `users` so lib/auth/profile.ts's upsertUserProfile() can refresh this on
-- every login without ever touching users.created_at.
create table if not exists profiles (
  user_id uuid primary key references users (id) on delete cascade,
  username text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ai_token — one AI Energy balance row per user (lib/energy.ts). Phase 3.1
-- created this table as scaffolding (lib/energy.ts/lib/energyGate.ts already
-- read and wrote it) but the UI only ever showed a static "0" and nothing
-- called chargeEnergy() yet. Phase 3.2 is what actually turns it on: a
-- claim-based daily +10 (not a passive reset) and real spend/refund wiring
-- on Analyze Coin, Generate AI Signal, and AI Agent Chat. Same table, same
-- columns — last_reset_at now means "last daily claim" rather than "last
-- passive reset". See lib/energy.ts for the full writeup.
create table if not exists ai_token (
  user_id uuid primary key references users (id) on delete cascade,
  balance numeric not null default 10,
  last_reset_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Defense in depth alongside the compare-and-swap guard in lib/energy.ts's
-- applyDelta() — belt and suspenders against a negative balance ever landing
-- in the DB, even from a future bug or a direct SQL edit.
alter table ai_token drop constraint if exists ai_token_balance_non_negative;
alter table ai_token add constraint ai_token_balance_non_negative check (balance >= 0);

-- ai_token_transactions — append-only ledger, one row per ai_token change.
create table if not exists ai_token_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  delta numeric not null,
  reason text not null,
  balance_after numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_token_transactions_user_idx on ai_token_transactions (user_id, created_at desc);

-- user_settings — seeded empty on first login (upsertUserProfile). No
-- columns are read anywhere yet; reserved for a future Settings phase.
create table if not exists user_settings (
  user_id uuid primary key references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- devices — "last seen" per device label, upserted on login + activity
-- heartbeat (lib/activityLog.ts touchDevice). The composite unique below is
-- what onConflict: "user_id,device_label" resolves against.
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  device_label text not null,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_label)
);

-- activity_log — append-only audit trail (lib/activityLog.ts logActivity).
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  event_type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_user_idx on activity_log (user_id, created_at desc);

-- wallets — linked on-chain addresses (app/api/wallet/*, a pre-existing
-- feature from before this phase). Not being built here — this table is
-- only added so those already-written routes stop erroring against a
-- missing table; Wallet Connect itself is explicitly out of scope for
-- Phase 3.1.
create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  wallet_address text not null unique,
  wallet_type text,
  chain_id integer,
  verified boolean not null default false,
  last_connected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists wallets_user_idx on wallets (user_id);

-- ----------------------------------------------------------------------------
-- Row Level Security — every policy below: a signed-in user may only
-- read/write their own row(s). Unlike the tables above this section (which
-- are only ever touched server-side with the service-role key), all Phase 3
-- access goes through the anon-key, user-scoped client (lib/auth/server.ts)
-- — see the comment at the top of lib/auth/profile.ts — so real policies
-- (not just "RLS enabled, zero policies") are required for any of it to work.
-- ----------------------------------------------------------------------------
alter table users enable row level security;
alter table profiles enable row level security;
alter table ai_token enable row level security;
alter table ai_token_transactions enable row level security;
alter table user_settings enable row level security;
alter table devices enable row level security;
alter table activity_log enable row level security;
alter table wallets enable row level security;

drop policy if exists users_select_own on users;
create policy users_select_own on users for select using (auth.uid() = id);
drop policy if exists users_insert_own on users;
create policy users_insert_own on users for insert with check (auth.uid() = id);
drop policy if exists users_update_own on users;
create policy users_update_own on users for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select using (auth.uid() = user_id);
drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles for insert with check (auth.uid() = user_id);
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists ai_token_select_own on ai_token;
create policy ai_token_select_own on ai_token for select using (auth.uid() = user_id);
drop policy if exists ai_token_insert_own on ai_token;
create policy ai_token_insert_own on ai_token for insert with check (auth.uid() = user_id);
drop policy if exists ai_token_update_own on ai_token;
create policy ai_token_update_own on ai_token for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists ai_token_transactions_select_own on ai_token_transactions;
create policy ai_token_transactions_select_own on ai_token_transactions for select using (auth.uid() = user_id);
drop policy if exists ai_token_transactions_insert_own on ai_token_transactions;
create policy ai_token_transactions_insert_own on ai_token_transactions for insert with check (auth.uid() = user_id);

drop policy if exists user_settings_select_own on user_settings;
create policy user_settings_select_own on user_settings for select using (auth.uid() = user_id);
drop policy if exists user_settings_insert_own on user_settings;
create policy user_settings_insert_own on user_settings for insert with check (auth.uid() = user_id);
drop policy if exists user_settings_update_own on user_settings;
create policy user_settings_update_own on user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists devices_select_own on devices;
create policy devices_select_own on devices for select using (auth.uid() = user_id);
drop policy if exists devices_insert_own on devices;
create policy devices_insert_own on devices for insert with check (auth.uid() = user_id);
drop policy if exists devices_update_own on devices;
create policy devices_update_own on devices for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists activity_log_select_own on activity_log;
create policy activity_log_select_own on activity_log for select using (auth.uid() = user_id);
drop policy if exists activity_log_insert_own on activity_log;
create policy activity_log_insert_own on activity_log for insert with check (auth.uid() = user_id);

drop policy if exists wallets_select_own on wallets;
create policy wallets_select_own on wallets for select using (auth.uid() = user_id);
drop policy if exists wallets_insert_own on wallets;
create policy wallets_insert_own on wallets for insert with check (auth.uid() = user_id);
drop policy if exists wallets_update_own on wallets;
create policy wallets_update_own on wallets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists wallets_delete_own on wallets;
create policy wallets_delete_own on wallets for delete using (auth.uid() = user_id);

-- ============================================================================
-- [MIGRATED] market_history + bn_trade_ticks di bawah ini SUDAH PINDAH ke
-- Supabase #2 (DATA ENGINE) — lihat supabase/data-engine-schema.sql dan
-- lib/supabaseData.ts. Blok di bawah dibiarkan apa adanya sebagai histori
-- schema lama / referensi, TIDAK dijalankan lagi terhadap database ini
-- setelah migrasi selesai. Kalau sudah yakin data sudah pindah & stabil,
-- boleh DROP TABLE market_history, bn_trade_ticks, market_history_meta di
-- Supabase #1 (CORE) secara manual.
-- ============================================================================
-- Shared historical market-data layer (Footprint / TPO / Liquidity Heatmap)
-- ============================================================================
-- Backs real historical coverage beyond what a single live Binance request
-- can return. aggTrades in particular caps at the most recent 1000 trades —
-- for an active pair that can be under an hour of real history — and there's
-- no practical way to paginate deep trade history live the way klines
-- pagination (getKlinesRange) already does. Rolling 7-day retention via the
-- daily cron below, NOT a weekly truncation: `week_start` tags which
-- Mon-00:00-WIB cycle a row was collected in for organizational querying
-- only — it is never used as a deletion boundary. See lib/marketHistory/ for
-- the read/write/cleanup functions and app/api/market-history/cleanup for
-- the daily job (vercel.json).
--
-- ONE shared table for all three indicators (not one table each) per the
-- "favor one shared market-data layer" architecture note — `kind`
-- discriminates which indicator a row belongs to. Only 'footprint' is
-- actually written yet (2026-08): TPO and Liquidity Heatmap already get
-- genuine multi-day history straight from Binance klines (getKlinesRange,
-- exposed via /api/klines?days=N) without this table, so wiring them in is
-- an explicit next phase, not done here — the schema is ready for it so
-- that phase doesn't need a migration.
-- ----------------------------------------------------------------------------
create table if not exists market_history (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  interval text not null,
  kind text not null default 'footprint' check (kind in ('footprint', 'volume_profile', 'liquidity')),
  candle_time timestamptz not null,             -- real candle open time (Binance kline)
  price_buckets jsonb not null,                 -- compact per-price-level array — same shape the relevant indicator already computes (e.g. FootprintCell[]), stored verbatim, no re-derivation on read
  delta numeric,
  total_volume numeric not null default 0,
  source text not null default 'binance_futures',
  week_start timestamptz not null,              -- Monday 00:00 WIB cycle tag — organizational only, NOT a retention boundary
  created_at timestamptz not null default now(),
  unique (symbol, interval, kind, candle_time)
);

create index if not exists market_history_lookup_idx on market_history (symbol, interval, kind, candle_time desc);
create index if not exists market_history_created_at_idx on market_history (created_at);

alter table market_history enable row level security;
-- Zero public policies (same posture as ai_signals/bn_* above): only the
-- server-side service-role client (lib/supabase.ts) ever touches this table.

-- ----------------------------------------------------------------------------
-- bn_trade_ticks — raw per-trade tick data (Binance Futures aggTrades),
-- rolling 7-day retention. This is intentionally a SEPARATE table from
-- market_history: tick volume is orders of magnitude higher (hundreds of
-- thousands to millions of rows/day for BTC alone) and needs a lean bigint
-- PK + a narrow column set, not the shared jsonb-bucket shape the other
-- indicators use. Populated by /api/tick-capture (see that route for the
-- external-scheduler requirement — Vercel Hobby cron can't run this often
-- enough on its own).
--
-- STORAGE WARNING (told to the user directly, repeating it here for whoever
-- reads this file next): BTC futures tick volume can put this table at
-- several hundred MB to 1-2GB+ over a full 7-day rolling window, which can
-- exceed Supabase's Free-tier 500MB database cap. Monitor actual usage in
-- the Supabase dashboard and be ready to either upgrade the plan or shorten
-- TICK_RETENTION_DAYS in lib/marketHistory/tickStore.ts if it fills up.
-- ----------------------------------------------------------------------------
create table if not exists bn_trade_ticks (
  id bigserial primary key,
  symbol text not null,
  agg_id bigint not null,        -- Binance aggTrade ID — real exchange-assigned sequence number, used both to dedupe and as the pagination cursor (fromId)
  price numeric not null,
  qty numeric not null,
  is_sell boolean not null,      -- true = taker sold into the bid (aggressive sell), same convention as RecentTrade.isSell elsewhere in the codebase
  trade_time timestamptz not null, -- real trade timestamp from Binance (not insertion time)
  created_at timestamptz not null default now(),
  unique (symbol, agg_id)
);

-- Supports both "what's the highest agg_id we have" (pagination cursor,
-- order by agg_id desc limit 1) and "give me ticks in this time range".
create index if not exists bn_trade_ticks_cursor_idx on bn_trade_ticks (symbol, agg_id desc);
create index if not exists bn_trade_ticks_time_idx on bn_trade_ticks (symbol, trade_time);

alter table bn_trade_ticks enable row level security;
-- Zero public policies, same posture as every other table in this file:
-- only the server-side service-role client ever touches this table.

-- ELVOID PRO ORACLE — premium signal tracking (Phase 5, 2026-08).
-- See supabase/migrations/2026-08-oracle-premium.sql for the standalone
-- migration; mirrored here so schema.sql stays the single source of truth
-- for a fresh database, same convention as the `tp3` column above.
alter table ai_signals add column if not exists source text not null default 'AI_SIGNAL' check (source in ('AI_SIGNAL', 'ELVOID_PRO_ORACLE'));
alter table ai_signals add column if not exists premium boolean not null default false;
alter table ai_signals add column if not exists oracle_grade text check (oracle_grade in ('B+', 'A', 'A+'));
alter table ai_signals add column if not exists oracle_signal_id text;
create unique index if not exists ai_signals_oracle_signal_id_key on ai_signals (oracle_signal_id) where oracle_signal_id is not null;
