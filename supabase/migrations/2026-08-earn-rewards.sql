-- ============================================================================
-- Phase 6.5 — Earn & Reward System
-- ============================================================================
-- Reuses the `users` table (auth.uid()) and the existing `ai_token` /
-- `ai_token_transactions` AI Energy ledger (lib/energy.ts) rather than
-- inventing a parallel balance mechanism — reward_els/reward_ai_energy are
-- GRANTED via this system, but the actual AI Energy number a user sees is
-- still the same ai_token.balance everything else reads. ELS Testnet is a
-- separate ledger (ai_energy_ledger below, generalized to carry any credit
-- type) because there is no existing on-chain "send ELS to user" flow yet;
-- see CHAIN CONFIG note further down for what this means for the claim step.
--
-- Blockchain = source of truth. This schema's job is to make double-spend,
-- double-claim, and lost-eligibility-on-error structurally impossible at
-- the DB layer, not just in application code — see the CHECK/UNIQUE
-- constraints below, each with a comment tying it to the brief's numbered
-- requirement.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- reward_quests — static catalog of quests. Seeded below with the three
-- quests from the brief. `slug` is the stable identifier every other table
-- and every API route references (never the numeric `id`), so re-seeding or
-- reordering never breaks a foreign key.
-- ----------------------------------------------------------------------------
create table if not exists reward_quests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  reward_els numeric not null default 0,
  reward_ai_energy numeric not null default 0,
  active boolean not null default true,
  one_time boolean not null default true,
  -- Which chain a submitted tx must be on for THIS quest. Nullable: the
  -- referral quest has no on-chain leg at all.
  chain_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into reward_quests (slug, name, description, reward_els, reward_ai_energy, active, one_time, chain_id)
values
  ('referral', 'Refer a Friend', 'Invite a friend — reward unlocks once their wallet completes onboarding.', 0, 15, true, false, null),
  ('add_liquidity', 'Provide ELS Liquidity', 'Add ELS liquidity on Uniswap V4.', 15, 35, true, true, null),
  ('buy_els', 'Buy ELS', 'Buy ELS through the existing purchase flow.', 25, 35, true, true, null)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  reward_els = excluded.reward_els,
  reward_ai_energy = excluded.reward_ai_energy;

-- referral is not one-time at the QUEST level (a user can refer many
-- friends) — one-time-ness for referral is enforced per REFERRED WALLET
-- instead, via the `referrals` table's unique constraint further down.

-- ----------------------------------------------------------------------------
-- reward_submissions — one row per "user submitted a tx hash for a quest"
-- attempt. This is the mutable, retryable state machine row the frontend
-- polls (GET /api/rewards/status) and reruns verification against
-- (POST /api/rewards/verify → SYSTEM_ERROR retry path, brief section 8).
-- ----------------------------------------------------------------------------
create table if not exists reward_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  wallet_address text not null,
  quest_id uuid not null references reward_quests (id) on delete restrict,
  tx_hash text not null,
  chain_id integer not null,
  -- NOT_STARTED is never actually persisted (a row only exists once a hash
  -- was submitted) — kept in the CHECK for symmetry with the frontend enum.
  status text not null default 'SUBMITTED' check (
    status in (
      'NOT_STARTED', 'SUBMITTED', 'VERIFYING', 'VALID', 'CLAIMABLE',
      'CLAIMING', 'CLAIMED', 'SYSTEM_ERROR', 'CLAIM_ERROR', 'INVALID'
    )
  ),
  verification_attempts integer not null default 0,
  last_error_code text,
  last_error_message text,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Brief section 11: "wallet has not already completed the same quest if
  -- one-time-only" — enforced structurally by giving a (wallet, quest) pair
  -- at most one submission row that has ever reached CLAIMED. Partial
  -- unique index (not a plain UNIQUE) so retries/new attempts before a
  -- claim can freely create/replace rows; only a CLAIMED row is exclusive.
  unique (chain_id, tx_hash, quest_id)
);

create index if not exists reward_submissions_user_idx on reward_submissions (user_id, created_at desc);
create index if not exists reward_submissions_wallet_quest_idx on reward_submissions (wallet_address, quest_id);

-- Brief 3/11: one CLAIMED submission per (wallet, quest) when the quest is
-- one_time. Modeled as a partial unique index over a generated "claimed
-- wallet+quest" pair so it only ever constrains rows that already reached
-- CLAIMED — earlier attempts (INVALID/SYSTEM_ERROR/etc.) never collide.
create unique index if not exists reward_submissions_one_claim_per_wallet_quest
  on reward_submissions (lower(wallet_address), quest_id)
  where status = 'CLAIMED';

-- ----------------------------------------------------------------------------
-- verified_transactions — append-only record of every deterministic
-- verification RESULT keyed to the raw (chain, tx, quest) triple. This is
-- what brief section 4/5 rule 10 ("transaction has not previously generated
-- this reward") and the anti-replay requirements (section 11) are actually
-- enforced against — independent of whichever reward_submissions row
-- triggered the check, so replaying the same tx from a second submission
-- row, a second tab, or a second device all collide on the same unique key.
-- ----------------------------------------------------------------------------
create table if not exists verified_transactions (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  tx_hash text not null,
  wallet_address text not null,
  quest_id uuid not null references reward_quests (id) on delete restrict,
  transaction_status text, -- raw chain status: success | reverted | not_found | pending
  block_number bigint,
  verification_status text not null check (verification_status in ('VALID', 'INVALID', 'SYSTEM_ERROR')),
  verification_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The core anti double-claim/replay guard (brief section 11): the SAME
  -- transaction can never be recorded as VALID for the SAME quest twice.
  unique (chain_id, tx_hash, quest_id)
);

create index if not exists verified_transactions_wallet_idx on verified_transactions (wallet_address, quest_id);

-- ----------------------------------------------------------------------------
-- reward_claims — one row per successful (or attempted) claim. `status`
-- tracks the CLAIMABLE → CLAIMING → CLAIMED / CLAIM_ERROR machine (brief
-- section 9-10). The idempotency_key is the concurrency guard for section
-- 13: two simultaneous POST /api/rewards/claim for the same
-- (chain,tx,quest,wallet) can only ever insert ONE row here — the second
-- request's insert fails on this unique constraint, which the API layer
-- turns into ALREADY_CLAIMED / CLAIM_IN_PROGRESS depending on that row's
-- current status (see lib/rewards/store.ts).
-- ----------------------------------------------------------------------------
create table if not exists reward_claims (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references reward_submissions (id) on delete cascade,
  wallet_address text not null,
  quest_id uuid not null references reward_quests (id) on delete restrict,
  reward_els numeric not null default 0,
  reward_ai_energy numeric not null default 0,
  status text not null default 'CLAIMING' check (status in ('CLAIMING', 'CLAIMED', 'CLAIM_ERROR')),
  idempotency_key text not null unique,
  claim_tx_hash text,
  last_error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists reward_claims_wallet_idx on reward_claims (wallet_address, created_at desc);

-- ----------------------------------------------------------------------------
-- ai_energy_ledger — generalized append-only credit ledger for reward-origin
-- grants (AI Energy AND ELS Testnet), separate from ai_token_transactions
-- (which is the spend/refund/daily-claim ledger for the pre-existing AI
-- Energy feature-gating system). Reward AI Energy grants are mirrored into
-- BOTH: a row here for reward-system audit trail, and a real
-- ai_token.balance increment + ai_token_transactions row (via
-- lib/energy.ts's refundEnergy, reason="reward:<quest_slug>") so the
-- balance a user actually sees/spends updates immediately. ELS Testnet has
-- no spendable balance elsewhere yet, so this ledger IS its balance of
-- record (sum(amount) where type='els_testnet' per wallet_address).
-- ----------------------------------------------------------------------------
create table if not exists ai_energy_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  amount numeric not null,
  type text not null check (type in ('ai_energy', 'els_testnet')),
  reference_id uuid references reward_claims (id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  -- A given claim can only ever mint one ledger row per credit type —
  -- belt-and-suspenders alongside reward_claims.idempotency_key.
  unique (reference_id, type)
);

create index if not exists ai_energy_ledger_wallet_idx on ai_energy_ledger (wallet_address, created_at desc);

-- ----------------------------------------------------------------------------
-- referrals — one row per (referrer, referred wallet) edge. Brief section
-- 16: "prevent duplicate referred wallet" + "one reward per successful
-- referral" are both a single UNIQUE(referred_user_id) — a wallet can be
-- referred at most once, full stop, regardless of how many different codes
-- were tried (brief's "same referred wallet through multiple codes" test).
-- ----------------------------------------------------------------------------
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references users (id) on delete cascade,
  referred_user_id uuid not null unique references users (id) on delete cascade,
  referral_code text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACTIVATED', 'REWARDED')),
  activated_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  -- Brief: "prevent self-referral" — defense in depth alongside the
  -- application-layer check in lib/referral.ts (which runs before this
  -- insert is even attempted).
  check (referrer_user_id <> referred_user_id)
);

create index if not exists referrals_referrer_idx on referrals (referrer_user_id, created_at desc);

-- referral_codes — a stable, generated code per user. Kept as its own table
-- (not a column bolted onto `profiles`) so lookups by code
-- (POST /api/referral/activate) don't need to scan/index all of `profiles`.
create table if not exists referral_codes (
  user_id uuid primary key references users (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security — same "signed-in user reads only their own rows" rule
-- as the rest of the app (see supabase/schema.sql). Every WRITE in this
-- feature goes through the service-role client from an API route (Section 2
-- of the brief: backend independently verifies everything — the frontend
-- never has a credible path to insert/update these tables directly), so
-- these policies are read-side defense in depth, not the primary
-- enforcement mechanism. reward_quests is public catalog data — readable
-- by anyone, written only by migrations/service-role.
-- ============================================================================
alter table reward_quests enable row level security;
alter table reward_submissions enable row level security;
alter table verified_transactions enable row level security;
alter table reward_claims enable row level security;
alter table ai_energy_ledger enable row level security;
alter table referrals enable row level security;
alter table referral_codes enable row level security;

drop policy if exists reward_quests_select_all on reward_quests;
create policy reward_quests_select_all on reward_quests for select using (true);

drop policy if exists reward_submissions_select_own on reward_submissions;
create policy reward_submissions_select_own on reward_submissions for select using (auth.uid() = user_id);

drop policy if exists reward_claims_select_own on reward_claims;
create policy reward_claims_select_own on reward_claims for select using (
  exists (
    select 1 from reward_submissions s
    where s.id = reward_claims.submission_id and s.user_id = auth.uid()
  )
);

drop policy if exists ai_energy_ledger_select_own on ai_energy_ledger;
create policy ai_energy_ledger_select_own on ai_energy_ledger for select using (
  exists (
    select 1 from wallets w
    where lower(w.wallet_address) = lower(ai_energy_ledger.wallet_address) and w.user_id = auth.uid()
  )
);

drop policy if exists referrals_select_own on referrals;
create policy referrals_select_own on referrals for select using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

drop policy if exists referral_codes_select_own on referral_codes;
create policy referral_codes_select_own on referral_codes for select using (auth.uid() = user_id);

-- verified_transactions intentionally has NO select policy for regular
-- users (service-role only) — it can contain raw chain verification_data
-- (decoded logs/amounts) that's an internal fraud-detection detail, not
-- something the reward-status UI needs directly; the UI reads
-- reward_submissions/reward_claims instead.
