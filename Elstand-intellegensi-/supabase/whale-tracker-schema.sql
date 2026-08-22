-- ============================================================================
-- SUPABASE #2 — DATA ENGINE — WHALE TRACKER (BSC, Phase 1)
-- Run this in the SAME Data Engine project as supabase/data-engine-schema.sql
-- (the one lib/supabaseData.ts / getDataSupabase() points at — env vars
-- DATA_SUPABASE_URL + DATA_SUPABASE_SERVICE_ROLE_KEY). This is NOT the CORE
-- project (lib/supabase.ts) — users, profiles, subscriptions, ai_signals,
-- bn_credentials etc. are untouched by this file, exactly like
-- data-engine-schema.sql already keeps CORE untouched.
--
-- Idempotent — safe to run more than once.
--
-- Chain-agnostic by design (chain text column everywhere, no BSC-only
-- constraint) so Ethereum/Solana/Base/Arbitrum/etc. can reuse these same
-- five tables later — only the indexer service is BSC-specific for V1, per
-- spec ("Arsitektur harus dibuat modular... tanpa harus menulis ulang
-- seluruh sistem").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- whale_transfers — one row per on-chain transfer that cleared the whale
-- threshold (BEP-20 Transfer events + native BNB value transfers).
--
-- Idempotency: (chain, tx_hash, log_index) is unique. Native BNB transfers
-- have no log index, so the indexer writes log_index = -1 for those instead
-- of NULL — Postgres treats NULL as "always distinct" in unique constraints,
-- which would silently allow duplicate native-transfer rows for the same tx
-- hash. -1 closes that gap.
-- ----------------------------------------------------------------------------
create table if not exists whale_transfers (
  id bigserial primary key,
  chain text not null default 'bsc',
  tx_hash text not null,
  log_index integer not null default -1,        -- -1 = native transfer (no event log)
  block_number bigint not null,
  block_timestamp timestamptz not null,
  from_address text not null,
  to_address text not null,
  is_native boolean not null default false,
  token_address text,                            -- null for native BNB
  token_symbol text,
  token_name text,
  token_decimals smallint,
  amount numeric not null,                        -- decoded human-readable amount (already divided by 10^decimals)
  price_usd numeric,                              -- null = "Price unavailable" (never fabricate a value here)
  value_usd numeric,                              -- null when price_usd is null
  created_at timestamptz not null default now(),
  unique (chain, tx_hash, log_index)
);

create index if not exists whale_transfers_time_idx on whale_transfers (chain, block_timestamp desc);
create index if not exists whale_transfers_block_idx on whale_transfers (chain, block_number);
create index if not exists whale_transfers_from_idx on whale_transfers (chain, from_address);
create index if not exists whale_transfers_to_idx on whale_transfers (chain, to_address);
create index if not exists whale_transfers_token_idx on whale_transfers (chain, token_address);
create index if not exists whale_transfers_value_idx on whale_transfers (chain, value_usd desc nulls last);
create index if not exists whale_transfers_created_at_idx on whale_transfers (created_at);

alter table whale_transfers enable row level security;
-- Zero public policies — same "service-role client only" rule as
-- market_history / bn_trade_ticks. Reads go through app/api/whale/* route
-- handlers using getDataSupabase(), never directly from the browser.

-- ----------------------------------------------------------------------------
-- whale_wallets — labeled/tracked addresses + cached total equity, so the
-- dashboard doesn't have to recompute a wallet's full balance sheet on
-- every page load. equity_usd is refreshed by the wallet-balance job
-- (Phase 8), not by the indexer.
-- ----------------------------------------------------------------------------
create table if not exists whale_wallets (
  id uuid primary key default gen_random_uuid(),
  chain text not null default 'bsc',
  address text not null,
  label text,
  category text,                                  -- e.g. 'exchange', 'market_maker', 'unlabeled'
  equity_usd numeric,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain, address)
);

create index if not exists whale_wallets_equity_idx on whale_wallets (chain, equity_usd desc nulls last);
create index if not exists whale_wallets_last_seen_idx on whale_wallets (chain, last_seen desc);

alter table whale_wallets enable row level security;
-- Wallet metadata is explicitly NOT touched by the whale_transfers retention
-- cleanup (Phase 13) — see spec: "Jangan menghapus: wallet metadata...".

-- ----------------------------------------------------------------------------
-- token_metadata — resolved once per (chain, token_address), then reused by
-- both the indexer (decimals, symbol) and the price-cache layer (Phase 6),
-- so we never re-fetch metadata for the same token on every transfer.
--
-- Native BNB is stored with token_address = 'native' (sentinel, not a real
-- contract address) so it can share this table instead of needing a
-- special-cased lookup path everywhere else in the code.
-- ----------------------------------------------------------------------------
create table if not exists token_metadata (
  id uuid primary key default gen_random_uuid(),
  chain text not null default 'bsc',
  token_address text not null,                    -- 'native' for the chain's native coin
  symbol text,
  name text,
  decimals smallint,
  price_usd numeric,                              -- null = no price source found yet
  price_updated_at timestamptz,
  logo_url text,
  updated_at timestamptz not null default now(),
  unique (chain, token_address)
);

create index if not exists token_metadata_symbol_idx on token_metadata (chain, symbol);

alter table token_metadata enable row level security;
-- Token metadata is explicitly NOT touched by the whale_transfers retention
-- cleanup — same "never delete" list as whale_wallets.

-- ----------------------------------------------------------------------------
-- wallet_balances — current per-token balance snapshot for tracked wallets
-- (Phase 8 wallet-equity layer). One row per (chain, wallet, token);
-- overwritten in place on refresh, not append-only like whale_transfers.
-- ----------------------------------------------------------------------------
create table if not exists wallet_balances (
  id uuid primary key default gen_random_uuid(),
  chain text not null default 'bsc',
  wallet_address text not null,
  token_address text not null,                    -- 'native' for BNB, same sentinel as token_metadata
  token_symbol text,
  balance numeric not null default 0,
  price_usd numeric,
  value_usd numeric,
  updated_at timestamptz not null default now(),
  unique (chain, wallet_address, token_address)
);

create index if not exists wallet_balances_wallet_idx on wallet_balances (chain, wallet_address);
create index if not exists wallet_balances_value_idx on wallet_balances (chain, value_usd desc nulls last);

alter table wallet_balances enable row level security;

-- ----------------------------------------------------------------------------
-- whale_indexer_checkpoint — "last block processed" per chain, so a
-- restarted indexer resumes instead of re-scanning from genesis. One row
-- per chain (composite PK on chain, not a singleton like market_history_meta,
-- since this table is already multi-chain-ready).
-- ----------------------------------------------------------------------------
create table if not exists whale_indexer_checkpoint (
  chain text primary key,
  last_processed_block bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table whale_indexer_checkpoint enable row level security;

-- ----------------------------------------------------------------------------
-- whale_meta + whale_transfers_table_size() — storage-guard cache for the
-- 150 MB / 120 MB retention system (Phase 13), same pattern as
-- market_history_meta / market_history_table_size() in
-- supabase/data-engine-schema.sql. Kept as its own singleton meta table
-- (not reused market_history_meta) because it tracks a different table's
-- size on its own cadence.
-- ----------------------------------------------------------------------------
create table if not exists whale_meta (
  id smallint primary key default 1,
  last_size_bytes bigint not null default 0,
  last_checked_at timestamptz not null default now(),
  constraint whale_meta_singleton check (id = 1)
);

insert into whale_meta (id, last_size_bytes, last_checked_at)
values (1, 0, now())
on conflict (id) do nothing;

alter table whale_meta enable row level security;

create or replace function whale_transfers_table_size()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_total_relation_size('whale_transfers');
$$;

-- ----------------------------------------------------------------------------
-- whale_summary_24h() — single-round-trip aggregate for the dashboard's
-- summary cards (TOTAL TRANSFERS / 24H VOLUME / LARGEST TRANSFER / ACTIVE
-- WALLETS). Computed in Postgres, not by pulling rows into Node and
-- reducing client-side — spec: "Jangan: fetch 10,000+ transfers ke
-- frontend... scan entire table untuk setiap request". total_transfers is
-- all-time (matches the reference screenshot's "10,000 Transfers" style
-- total); the other three are windowed to the last 24h.
-- ----------------------------------------------------------------------------
create or replace function whale_summary_24h(p_chain text default 'bsc')
returns table (
  total_transfers bigint,
  volume_24h_usd numeric,
  largest_transfer_24h_usd numeric,
  active_wallets_24h bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from whale_transfers where chain = p_chain) as total_transfers,
    coalesce((select sum(value_usd) from whale_transfers where chain = p_chain and block_timestamp >= now() - interval '24 hours'), 0) as volume_24h_usd,
    coalesce((select max(value_usd) from whale_transfers where chain = p_chain and block_timestamp >= now() - interval '24 hours'), 0) as largest_transfer_24h_usd,
    (
      select count(distinct addr) from (
        select from_address as addr from whale_transfers where chain = p_chain and block_timestamp >= now() - interval '24 hours'
        union
        select to_address as addr from whale_transfers where chain = p_chain and block_timestamp >= now() - interval '24 hours'
      ) w
    ) as active_wallets_24h;
$$;

-- ----------------------------------------------------------------------------
-- whale_wallet_flow() — inflow/outflow/net USD for one address, all-time.
-- Single indexed aggregate query per direction (from_address / to_address
-- both have indexes — see whale_transfers_from_idx / _to_idx above), not a
-- client-side reduce over fetched rows.
-- ----------------------------------------------------------------------------
create or replace function whale_wallet_flow(p_chain text, p_address text)
returns table (inflow_usd numeric, outflow_usd numeric)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((select sum(value_usd) from whale_transfers where chain = p_chain and to_address = p_address), 0) as inflow_usd,
    coalesce((select sum(value_usd) from whale_transfers where chain = p_chain and from_address = p_address), 0) as outflow_usd;
$$;

-- ----------------------------------------------------------------------------
-- whale_wallet_counterparties() — top N addresses this wallet has
-- transacted with, ranked by combined USD volume. Backs the "Top
-- Counterparties" panel in Wallet Intelligence.
-- ----------------------------------------------------------------------------
create or replace function whale_wallet_counterparties(p_chain text, p_address text, p_limit int default 10)
returns table (address text, volume_usd numeric, tx_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select counterparty, sum(value_usd) as volume_usd, count(*) as tx_count
  from (
    select to_address as counterparty, value_usd from whale_transfers where chain = p_chain and from_address = p_address
    union all
    select from_address as counterparty, value_usd from whale_transfers where chain = p_chain and to_address = p_address
  ) flows
  group by counterparty
  order by volume_usd desc nulls last
  limit p_limit;
$$;

-- ----------------------------------------------------------------------------
-- whale_wallet_seen_tokens() — distinct token addresses (including the
-- 'native' sentinel when relevant) a wallet has moved in whale-sized
-- transfers. Used as the balance-refresh enumeration set (see
-- features/whale-tracker/lib/walletEquity.ts) — V1's equity computation is
-- bounded by "tokens this wallet has whale-transferred", not a full
-- token-discovery service, and this function is what makes that bound
-- explicit and cheap to query.
-- ----------------------------------------------------------------------------
create or replace function whale_wallet_seen_tokens(p_chain text, p_address text)
returns table (token_address text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct token_address from (
    select coalesce(token_address, 'native') as token_address from whale_transfers where chain = p_chain and from_address = p_address
    union
    select coalesce(token_address, 'native') as token_address from whale_transfers where chain = p_chain and to_address = p_address
  ) t;
$$;
