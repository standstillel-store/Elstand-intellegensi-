-- ============================================================================
-- PHASE: BN_TRADE_TICKS STORAGE GUARD — FULL RESET (250MB -> ~0MB)
-- Jalankan ini di Supabase SQL Editor (Project > SQL Editor > New query),
-- di project Data Engine yang sama (DATA_SUPABASE_URL/KEY) tempat
-- market-history-full-reset.sql sebelumnya dijalankan.
-- Idempotent — aman dijalankan berkali-kali (create or replace).
--
-- bn_trade_ticks sebelumnya cuma dibersihin lewat cleanupExpiredTicks()
-- (DELETE ticks lebih tua dari 7 hari), dan itu pun cuma jalan kalau route
-- /api/tick-capture ke-hit — yang ternyata gak ada di cron manapun. Hasilnya
-- ticks numpuk gak pernah kebersihin sampai 291MB.
--
-- Migration ini nambahin size function + full-reset function, pola sama
-- persis kayak market_history:
--   1. bn_trade_ticks_table_size() — ukuran ASLI tabel (dipakai tickStorageGuard.ts)
--   2. reset_bn_trade_ticks_full()  — TRUNCATE tabel, return jumlah row yang kehapus
--
-- TRUNCATE dipakai (bukan DELETE) karena instan dan ukuran fisiknya
-- langsung ~0 byte, gak nunggu autovacuum.
--
-- TIDAK menyentuh tabel lain manapun — hanya bn_trade_ticks.
-- ============================================================================

create or replace function bn_trade_ticks_table_size()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_total_relation_size('bn_trade_ticks');
$$;

create or replace function reset_bn_trade_ticks_full()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  row_count bigint;
begin
  select count(*) into row_count from bn_trade_ticks;
  truncate table bn_trade_ticks;
  return row_count;
end;
$$;

-- Meta cache table, sama pola kayak market_history_meta — biar insertTicks()
-- gak perlu full pg_total_relation_size query di setiap panggilan.
create table if not exists bn_trade_ticks_meta (
  id smallint primary key default 1,
  last_size_bytes bigint not null default 0,
  last_checked_at timestamptz not null default now(),
  constraint bn_trade_ticks_meta_singleton check (id = 1)
);

insert into bn_trade_ticks_meta (id, last_size_bytes, last_checked_at)
values (1, 0, now())
on conflict (id) do nothing;

alter table bn_trade_ticks_meta enable row level security;
