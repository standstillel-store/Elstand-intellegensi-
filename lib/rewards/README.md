# `lib/rewards/` — Earn & Reward System (Phase 6.5)

Deterministic verification engine for the on-chain quests on `/earn`
(Add Liquidity, Buy ELS). Referral has no on-chain leg — see `lib/referral.ts`
instead.

| File | Responsibility |
|---|---|
| `config.ts` | Single source of truth for quest reward amounts, chain/contract addresses, and the $10 USD / distributor config. Every address follows "null until confirmed/deployed, never fabricate." |
| `chainClient.ts` | Per-chain `viem` public client with primary → fallback RPC transport (Section 7). |
| `pricing.ts` | Historical native-currency (BNB) USD price at a specific past block, via the same Binance klines pattern `lib/binance.ts` already uses elsewhere. |
| `verifier.ts` | Pure, stateless, side-effect-free chain reads: "is this transaction itself valid" for each quest, including the $10 USD check. No writes, no LLM, safe to re-run freely. |
| `store.ts` | The stateful half: submission/claim rows, the `SUBMITTED → ... → CLAIMED` state machine, concurrency-safe claiming, idempotent AI Energy/ELS-ledger crediting. |
| `distributor.ts` | The (currently inert) integration point for a real on-chain ELS Testnet transfer once a Reward Distributor contract + funded signer exist. |

## Where an AI/LLM layer would belong (and where it must not)

`verifier.ts` intentionally has **no LLM call anywhere** — blockchain
validity is a deterministic yes/no, and this codebase's established rule
(`lib/ai/core/llm.ts`'s doc comment) is that an AI layer never recomputes or
overrides a number that already has one authoritative source. If a future
phase wants AI involvement here, the safe seam is **read-only, after**
verification — e.g. turning a `SYSTEM_ERROR`/`INVALID` reason into a
friendlier explanation for the quest card, or summarizing a wallet's reward
history — never anything that decides `VALID`/`INVALID` itself.

## Known limitations (see the Phase 6.5 audit report for full detail)

- USD valuation prices the **native-currency (BNB) leg** (`tx.value`), not
  ELS itself — ELS has no independent price feed anywhere in this codebase.
  A routing shape that moves BNB some other way (e.g. as wrapped BNB/an
  ERC20 instead of `msg.value`) would under-count.
- `distributor.ts` never attempts a real transfer yet, even once
  `EARN_REWARD_DISTRIBUTOR_ADDRESS` is set — that also needs a funded signer
  and a decision on how its private key is stored, plus the distributor
  contract's real ABI once deployed.
- Add Liquidity's configured chain/token (BSC mainnet, ELS Mainnet) does not
  match the pre-existing `/wallet` dashboard's BSC-testnet-only config —
  intentional (Section 4 requires mainnet), but worth knowing if you're
  cross-referencing the two features.
- **Buy ELS has no dedicated purchase contract** (by explicit operator
  decision — no new deployment). It reuses the same Uniswap V4 ELS/native
  pool as Add Liquidity: "buying" = swapping native BNB for ELS in that
  pool. The verifier checks the `Swap` event's pool id against
  `config.ts`'s `ELS_BNB_POOL_KEY` (computed the same way v4-core computes
  it on-chain) and requires the BNB→ELS direction specifically, not just
  "any Swap happened." If a second ELS pool with different parameters is
  ever created, `ELS_BNB_POOL_KEY`'s env overrides must be repointed or
  Buy ELS will reject genuine swaps in the new pool.
