-- ============================================================================
-- Phase 6.6.0.1 — Admin Dashboard: admin_audit_log
-- ============================================================================
-- Foundation-only migration per spec section 8/11: audited exactly the
-- actions this phase produces (admin login/logout), nothing Bug-Hunter-
-- specific yet. Idempotent — safe to re-run.
--
-- Access pattern matches every other append-only log table already in this
-- schema (bn_auto_trader_log, activity_log): RLS is enabled with NO
-- policies defined below, which means Postgres denies every row to every
-- role EXCEPT the service-role key (which bypasses RLS entirely, by
-- Supabase design). This app never queries admin_audit_log with a
-- browser-side anon-key client — see lib/admin/auditLog.ts, which always
-- goes through lib/supabase.ts's server-only getSupabase() — so "no
-- policies" here is deliberate deny-by-default, not an oversight.
-- ============================================================================

create extension if not exists pgcrypto; -- for gen_random_uuid(), matches supabase/schema.sql

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (
    action in ('ADMIN_LOGIN_SUCCESS', 'ADMIN_LOGIN_FAILED', 'ADMIN_LOGIN_RATE_LIMITED', 'ADMIN_LOGOUT')
  ),
  admin_identifier text,      -- single shared admin identity for this phase (no per-admin accounts yet)
  ip_hash text,                -- HMAC-SHA256(ip) truncated — NEVER the raw IP; see lib/admin/crypto.ts hashIp()
  metadata jsonb,              -- small, non-sensitive context only — never a password, hash, or secret
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on admin_audit_log (created_at desc);
create index if not exists admin_audit_log_ip_hash_idx on admin_audit_log (ip_hash, created_at desc);

alter table admin_audit_log enable row level security;
-- No policies added — deny-all for anon/authenticated roles by design (see note above).
