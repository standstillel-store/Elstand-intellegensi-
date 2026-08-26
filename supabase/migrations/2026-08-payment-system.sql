-- ---------------------------------------------------------------------------
-- ELSTestnetPayment.sol backend ledger — Phase 6.6.4.
--
-- payment_purchases: idempotency + audit trail for every verified
-- purchase() transaction. UNIQUE(chain_id, tx_hash) means the same tx hash
-- can never be processed twice even under a race (two tabs, retried
-- request, etc.) — this is the actual replay-protection enforcement point
-- on the backend side, complementing (not replacing) the contract's own
-- on-chain processedPayments[paymentId] mapping.
--
-- premium_memberships: one row per user, holds the current Elvoid Pro
-- expiry. A purchase extends expires_at from max(now, current expires_at)
-- so back-to-back renewals stack instead of overwriting.
-- ---------------------------------------------------------------------------

create table if not exists payment_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  wallet_address text not null,
  chain_id integer not null,
  tx_hash text not null,
  payment_id text not null, -- on-chain bytes32 paymentId from PaymentExecuted, hex string
  product_id text not null check (product_id in ('ELVOID_PRO_WEEK', 'ELVOID_PRO_MONTH', 'AI_ENERGY_10')),
  amount_els_raw numeric not null,
  block_number bigint,
  created_at timestamptz not null default now()
);

create unique index if not exists payment_purchases_chain_tx_key on payment_purchases (chain_id, tx_hash);
create index if not exists payment_purchases_user_id_idx on payment_purchases (user_id);

alter table payment_purchases enable row level security;

drop policy if exists payment_purchases_select_own on payment_purchases;
create policy payment_purchases_select_own on payment_purchases
  for select using (auth.uid() = user_id);

-- No insert/update/delete policy for authenticated/anon roles — all writes
-- go through the service-role client in app/api/payments/verify/route.ts,
-- same pattern as lib/rewards/store.ts's submissions table.

create table if not exists premium_memberships (
  user_id uuid primary key references users(id) on delete cascade,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table premium_memberships enable row level security;

drop policy if exists premium_memberships_select_own on premium_memberships;
create policy premium_memberships_select_own on premium_memberships
  for select using (auth.uid() = user_id);
