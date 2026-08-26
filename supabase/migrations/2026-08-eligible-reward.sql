-- ---------------------------------------------------------------------------
-- Phase 6.6.3.2 — Eligible Reward Center.
--
-- This is a SEPARATE reward system from reward_submissions/reward_quests
-- (Buy ELS, Add Liquidity, etc. — untouched by this migration). Eligible
-- Reward is not a per-tx/per-quest claim: it is a computed status over
-- THREE other sources (leaderboard rank, verified Buy ELS history, bug
-- bounty rewarded status) with no tx_hash or quest_id of its own, so it
-- does not fit reward_submissions' shape and is not stored there.
--
-- One row per wallet is the eventual steady state; a wallet may have
-- multiple PENDING/CLAIM_ERROR rows over retries, but only ever one
-- CLAIMED row (enforced by the partial unique index below), mirroring the
-- exact anti-double-claim pattern reward_submissions_one_claim_per_wallet_
-- quest already uses in 2026-08-earn-rewards.sql.
--
-- claim_id is a bytes32 hex string derived server-side (NOT reused from
-- reward_submissions.id) so this payout can never collide on-chain with a
-- Buy ELS quest payout through ELSTestnetRewardDistributor.sol's own
-- claimed[claimId] guard — see lib/rewards/eligibility.ts.
-- ---------------------------------------------------------------------------

create table if not exists eligible_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  wallet_address text not null, -- lowercased, same normalizeWallet() convention as reward_submissions

  status text not null default 'PENDING'
    check (status in ('PENDING', 'CLAIMING', 'CLAIMED', 'CLAIM_ERROR')),

  rank int, -- leaderboard rank at time of the claim that produced this row (nullable — not always known)
  base_reward numeric(38, 18) not null,
  bug_bounty_bonus numeric(38, 18) not null default 0,
  total_reward numeric(38, 18) not null,

  claim_id text not null unique, -- bytes32 hex passed to distribute()'s claimId
  tx_hash text,
  last_error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eligible_reward_claims_wallet_idx on eligible_reward_claims(wallet_address);
create index if not exists eligible_reward_claims_user_id_idx on eligible_reward_claims(user_id);

-- The actual anti-double-claim guard: only one CLAIMED row per wallet, ever.
create unique index if not exists eligible_reward_claims_one_per_wallet
  on eligible_reward_claims(wallet_address) where status = 'CLAIMED';

create or replace function eligible_reward_claims_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_eligible_reward_claims_updated_at on eligible_reward_claims;
create trigger trg_eligible_reward_claims_updated_at
  before update on eligible_reward_claims
  for each row execute function eligible_reward_claims_set_updated_at();

-- Same trust boundary as reward_submissions/reward_claims/bug_reports: this
-- table is only ever written through service-role backend code
-- (lib/rewards/eligibility.ts), never directly by the RLS-scoped client. No
-- INSERT/UPDATE policy is granted to authenticated users; SELECT of own
-- rows only, so a signed-in user can see their own claim history via a
-- normal session client if ever needed, but cannot forge or mutate one.
alter table eligible_reward_claims enable row level security;

drop policy if exists eligible_reward_claims_select_own on eligible_reward_claims;
create policy eligible_reward_claims_select_own on eligible_reward_claims
  for select using (auth.uid() = user_id);
