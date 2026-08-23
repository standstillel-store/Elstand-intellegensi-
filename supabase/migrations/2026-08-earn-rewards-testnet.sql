-- ============================================================================
-- Testnet Web3 infra — "Buy ELS" (testnet) quest.
-- ============================================================================
-- New quest slug, additive only — does NOT touch `add_liquidity` or
-- `buy_els` (both mainnet-oriented, left exactly as-is per explicit
-- operator decision). Same reward amounts as `buy_els` (25 ELS, 35 AI
-- Energy) since this is the testnet equivalent of that same "buy ELS"
-- action, verified against contracts/ELSTestnetSwap.sol on BSC Testnet
-- (chain_id 97) instead of the mainnet Uniswap V4 pool.
--
-- "Provide ELS Liquidity" has NO testnet equivalent by explicit operator
-- decision (the simple fixed-rate vending-contract architecture has no
-- real user-facing liquidity-provision action) — not seeded here.
-- ============================================================================

insert into reward_quests (slug, name, description, reward_els, reward_ai_energy, active, one_time, chain_id)
values
  ('buy_els_testnet', 'Buy ELS (Testnet)', 'Buy ELS Testnet through the BSC Testnet swap contract.', 25, 35, true, true, 97)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  reward_els = excluded.reward_els,
  reward_ai_energy = excluded.reward_ai_energy,
  chain_id = excluded.chain_id;
