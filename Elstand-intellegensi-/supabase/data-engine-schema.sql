-- ============================================================================
-- SUPABASE #2 — DATA ENGINE
-- Jalankan file ini di project Supabase yang BARU (bukan yang lama), di
-- SQL Editor > New query. Idempotent — aman dijalankan berkali-kali.
--
-- Isi: market_history (Footprint / Volume Profile / Liquidity Heatmap / TPO)
-- + bn_trade_ticks (raw tick data, whale tracker) + storage guard helper.
-- Ini adalah SATU-SATUNYA dua tabel yang pindah dari database lama — users,
-- profiles, ai_signals, bn_credentials, dll TETAP di Supabase #1 (CORE),
-- tidak disentuh sama sekali oleh file ini.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- market_history — shared historical layer for Footprint / Volume Profile /
-- Liquidity Heatmap / TPO. Rolling retention dikelola dari kode
-- (lib/marketHistory/storageGuard.ts), bukan dari SQL.
-- ----------------------------------------------------------------------------
create table if not exists market_history (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  interval text not null,
  kind text not null default 'footprint' check (kind in ('footprint', 'volume_profile', 'liquidity', 'tpo')),
  candle_time timestamptz not null,             -- real candle open time (Binance kline)
  price_buckets jsonb not null,                 -- compact per-price-level array, stored verbatim
  delta numeric,
  total_volume numeric not null default 0,
  source text not null default 'binance_futures',
  week_start timestamptz not null,              -- Monday 00:00 WIB cycle tag — organizational only
  created_at timestamptz not null default now(),
  unique (symbol, interval, kind, candle_time)
);

create index if not exists market_history_lookup_idx on market_history (symbol, interval, kind, candle_time desc);
create index if not exists market_history_created_at_idx on market_history (created_at);

alter table market_history enable row level security;
-- Zero public policies — cuma service-role client (lib/supabaseData.ts) yang
-- boleh menyentuh tabel ini. Jangan tambah policy anon/public.

-- ----------------------------------------------------------------------------
-- bn_trade_ticks — raw per-trade tick data (Binance Futures aggTrades),
-- rolling 7-day retention.
--
-- STORAGE WARNING: BTC futures tick volume bisa bikin tabel ini beberapa
-- ratus MB s/d 1-2GB+ selama 7 hari rolling window — pantau usage di
-- Supabase dashboard, siap upgrade plan atau pendekkan
-- TICK_RETENTION_DAYS di lib/marketHistory/tickStore.ts kalau penuh.
-- ----------------------------------------------------------------------------
create table if not exists bn_trade_ticks (
  id bigserial primary key,
  symbol text not null,
  agg_id bigint not null,
  price numeric not null,
  qty numeric not null,
  is_sell boolean not null,
  trade_time timestamptz not null,
  created_at timestamptz not null default now(),
  unique (symbol, agg_id)
);

create index if not exists bn_trade_ticks_cursor_idx on bn_trade_ticks (symbol, agg_id desc);
create index if not exists bn_trade_ticks_time_idx on bn_trade_ticks (symbol, trade_time);

alter table bn_trade_ticks enable row level security;
-- Zero public policies, sama seperti market_history.

-- ----------------------------------------------------------------------------
-- market_history_meta + market_history_table_size() — dipakai storageGuard.ts
-- biar gak perlu full table scan tiap kali ada indikator nulis data.
-- ----------------------------------------------------------------------------
create table if not exists market_history_meta (
  id smallint primary key default 1,
  last_size_bytes bigint not null default 0,
  last_checked_at timestamptz not null default now(),
  constraint market_history_meta_singleton check (id = 1)
);

insert into market_history_meta (id, last_size_bytes, last_checked_at)
values (1, 0, now())
on conflict (id) do nothing;

alter table market_history_meta enable row level security;

create or replace function market_history_table_size()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_total_relation_size('market_history');
$$;
