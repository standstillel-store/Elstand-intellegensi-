-- ============================================================================
-- PHASE: MARKET HISTORY STORAGE GUARD — FULL RESET (250MB -> ~0MB)
-- Jalankan ini di Supabase SQL Editor (Project > SQL Editor > New query),
-- di project Data Engine yang sama (DATA_SUPABASE_URL/KEY).
-- Idempotent — aman dijalankan berkali-kali (create or replace).
--
-- Ganti behavior lama (drain bertahap ke ~190MB) jadi FULL RESET begitu
-- market_history tembus 250MB — tabel dikosongkan total lalu ingestion
-- lanjut nulis data baru dari nol.
--
-- TRUNCATE dipakai (bukan DELETE) karena:
--   1. Instan — tidak perlu VACUUM buat ukuran fisik tabel beneran turun
--      ke ~0 byte. DELETE menyisakan dead tuples sampai autovacuum jalan,
--      jadi pg_total_relation_size() SETELAH DELETE bisa masih kelihatan
--      besar walau baris sudah kosong — bikin logging "size after reset"
--      salah.
--   2. Tidak butuh WHERE clause / batching — cocok buat "reset semua".
--
-- TRUNCATE TIDAK menyentuh tabel lain manapun (whale_transfers,
-- whale_wallets, token_metadata, wallet_balances, users, profiles,
-- bn_credentials, ai_signals, dst) — hanya market_history.
-- ============================================================================

create or replace function reset_market_history_full()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  row_count bigint;
begin
  select count(*) into row_count from market_history;
  truncate table market_history;
  return row_count;
end;
$$;
