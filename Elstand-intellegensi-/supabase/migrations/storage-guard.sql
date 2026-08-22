-- ============================================================================
-- PHASE: MARKET HISTORY STORAGE GUARD — migration
-- Jalankan ini di Supabase SQL Editor (Project > SQL Editor > New query).
-- Aman dijalankan berkali-kali (idempotent — pakai IF NOT EXISTS / OR REPLACE
-- / DROP...IF EXISTS di semua tempat).
-- Tidak menyentuh data yang sudah ada di market_history, cuma nambah:
--   1. constraint kind yang benar (fix bug lama, lihat penjelasan di bawah)
--   2. tabel meta kecil buat cache ukuran storage
--   3. function buat baca ukuran storage asli dari Postgres
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FIX: kind='tpo' selama ini DITOLAK oleh constraint lama.
--
-- lib/marketHistory/store.ts (persistTpoSessions) sudah dari dulu nulis
-- kind: "tpo" ke market_history, tapi constraint aslinya cuma izinin
-- ('footprint','volume_profile','liquidity') — jadi SETIAP kali TPO coba
-- persist ke Supabase, itu DITOLAK di level database. Errornya di-catch
-- dan cuma di-log (console.error), gak pernah bikin crash, jadi selama ini
-- ketutup diam-diam. Data TPO historical lo yang lewat Supabase (bukan
-- dari live Binance klines) sebenarnya belum pernah kesimpan sama sekali.
--
-- Ini ketemu pas gue audit market_history flow buat storage guard.
-- ----------------------------------------------------------------------------
alter table market_history drop constraint if exists market_history_kind_check;
alter table market_history add constraint market_history_kind_check
  check (kind in ('footprint', 'volume_profile', 'liquidity', 'tpo'));

-- ----------------------------------------------------------------------------
-- 2. market_history_meta — cache 1 baris buat ukuran storage terakhir.
-- Dipakai storageGuard.ts biar gak query pg_total_relation_size tiap kali
-- ada indikator nulis data (itu yang bikin "full database scan tiap poll").
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

-- ----------------------------------------------------------------------------
-- 3. market_history_table_size() — ukuran ASLI tabel market_history
-- (termasuk index + TOAST, bukan estimasi dari jumlah baris) — ini angka
-- yang beneran dihitung ke kuota storage Supabase.
-- ----------------------------------------------------------------------------
create or replace function market_history_table_size()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_total_relation_size('market_history');
$$;
