# ELVOID Whale Tracker (BSC)

Real-time BSC whale-transfer intelligence, live inside **ELVOID PRO → Whale Tracker** (a tab in the existing Premium Dashboard terminal — not a new page). BEP-20 + native BNB, chain-agnostic schema so Ethereum/Solana/Base/etc. can be added later without a rewrite.

## Where it lives

```
features/whale-tracker/        ← everything whale-tracker-specific
  types.ts                     shared types (WhaleTransferRow, WalletDetail, ...)
  lib/
    config.ts                  env-overridable thresholds/RPC/pagination
    checkpoint.ts               last_processed_block read/write (restart-safe indexing)
    storageGuard.ts             150MB/120MB retention for whale_transfers
    tokenMetadataStore.ts       token_metadata cache (symbol/decimals/price)
    priceSource.ts              CoinGecko contract-address USD pricing, cached
    transfersStore.ts           whale_transfers insert (idempotent) + paginated read + summary
    walletStore.ts              whale_wallets + wallet_balances CRUD
    walletEquity.ts             live on-chain balance reads → holdings/equity/flow/counterparties
    chains/bsc/
      client.ts                 shared viem PublicClient for BSC
      transferParser.ts         BEP-20 Transfer log decode + native tx parse + ERC-20 metadata reads
      indexer.ts                orchestrates the full pipeline, one bounded batch per call
  hooks/                        client-side data hooks (poll our own API, never the chain)
  components/                   WhaleTrackerPanel (root) + SummaryCards/FilterBar/TransfersTable/WalletDetailDrawer

app/api/whale/
  transfers/route.ts            GET — paginated + filtered All Transfers
  summary/route.ts              GET — summary cards
  wallet/[address]/route.ts     GET — Wallet Intelligence (?refresh=1 for a live balance read)
  indexer/run/route.ts          GET/POST — one bounded incremental scan pass
  cleanup/route.ts              GET/POST — storage-guard cleanup pass

supabase/whale-tracker-schema.sql   migration — run in the Data Engine Supabase project
```

## Files modified (existing project)

- `components/elvoid-pro/TerminalShell.tsx` — added a `Terminal | Whale Tracker` tab switcher at the top of the existing ELVOID PRO shell. Default view is unchanged (`"terminal"`); when `"whale-tracker"` is selected it renders `<WhaleTrackerPanel />` instead. The entire pre-existing JSX (chart, Order Book, Footprint mode, AI signal panels, CVD, Funding/OI, News, etc.) is untouched, just wrapped under the `"terminal"` branch — nothing was restructured or removed.
- `vercel.json` — added one cron entry, `/api/whale/cleanup` at `19:30` daily (same once-a-day cadence as the existing `/api/market-history/cleanup` entry, Vercel Hobby-compatible). **No** frequent-schedule entry was added for the indexer — see "Running the indexer" below for why.

Nothing else was touched. No existing Supabase client was duplicated (reuses `getDataSupabase()` from `lib/supabaseData.ts`), no existing table was altered, no existing route/component/page was removed.

## Database

Run `supabase/whale-tracker-schema.sql` in the **Data Engine** Supabase project — the same one `DATA_SUPABASE_URL` / `DATA_SUPABASE_SERVICE_ROLE_KEY` already point at (where `market_history` and `bn_trade_ticks` live). It is idempotent (`create table if not exists`, `create or replace function`) — safe to re-run.

Adds: `whale_transfers`, `whale_wallets`, `token_metadata`, `wallet_balances`, `whale_indexer_checkpoint`, `whale_meta`, plus four SQL functions (`whale_transfers_table_size`, `whale_summary_24h`, `whale_wallet_flow`, `whale_wallet_counterparties`, `whale_wallet_seen_tokens`) that back the storage guard and dashboard aggregates in a single round trip instead of pulling rows into Node to reduce client-side.

No existing table (CORE or Data Engine) is modified or dropped.

## Environment variables

All optional — every one has a working default, per spec ("threshold harus dapat diubah dari configuration tanpa mengubah source code").

| Variable | Default | Purpose |
|---|---|---|
| `DATA_SUPABASE_URL` / `DATA_SUPABASE_SERVICE_ROLE_KEY` | *(already set)* | Reused as-is — this feature does not add a new Supabase project or client. |
| `BSC_RPC_URL` | `https://bsc-dataseed.binance.org` | BSC JSON-RPC endpoint. Public default works for a proof-of-concept; use a dedicated provider for production (your existing Alchemy key also serves BSC: `https://bnb-mainnet.g.alchemy.com/v2/<key>`). |
| `BSC_BLOCK_BATCH_SIZE` | `500` | Blocks scanned per indexer run — bounded so one run never becomes an unbounded catch-up scan. |
| `WHALE_USD_THRESHOLD_BSC` (falls back to `WHALE_USD_THRESHOLD`) | `10000` | Minimum USD value to be considered "whale". |
| `WHALE_PRICE_CACHE_MS` | `60000` | How long a token's USD price is cached before re-fetching. |
| `WHALE_METADATA_CACHE_MS` | `43200000` (12h) | Reserved for a future in-memory metadata cache layer. |
| `WHALE_PAGE_SIZE` | `25` | Default All Transfers page size. |
| `BSC_EXPLORER_URL` | `https://bscscan.com` | Base URL for "view on explorer" links. |
| `CRON_SECRET` | *(unset = open)* | Same secret already used to gate `/api/market-history/cleanup` and `/api/binance/auto-trade/tick` — reused here for `/api/whale/cleanup` and `/api/whale/indexer/run`. |

## Running the indexer

There is **no standalone worker process** — this is a Next.js/Vercel app, so "background service" here means an API route that runs one bounded batch per invocation, driven the same way `app/api/binance/auto-trade/tick` already is:

1. **Client-side heartbeat (default, works everywhere):** `features/whale-tracker/hooks/useWhaleIndexerTick.ts` POSTs to `/api/whale/indexer/run` every 30s while the Whale Tracker tab is open. This is enough to keep the tracker current for anyone actively using it, on any hosting plan, with zero extra setup.
2. **Server-side cron (optional, for always-on indexing with nobody watching):** Vercel Cron needs a **Pro plan** for a sub-daily schedule — Hobby only allows once-a-day and will refuse to deploy e.g. `*/10 * * * *` (same limitation already documented on `/api/binance/auto-trade/tick`). If you're on Pro, add:
   ```json
   { "path": "/api/whale/indexer/run", "schedule": "*/10 * * * *" }
   ```
   to `vercel.json`'s `crons` array. On Hobby/self-hosted, point an external scheduler (cron-job.org, GitHub Actions, a VPS crontab, etc.) at the same URL with `Authorization: Bearer $CRON_SECRET`.

Manual one-off run: `curl -X POST https://<your-app>/api/whale/indexer/run -H "Authorization: Bearer $CRON_SECRET"`.

The indexer is **restart-safe**: it always resumes from `whale_indexer_checkpoint.last_processed_block` and never re-scans or re-inserts already-processed blocks (idempotent upsert on `(chain, tx_hash, log_index)`).

## Running storage cleanup

Runs automatically once daily via the `vercel.json` cron entry. Manual run: `curl -X POST https://<your-app>/api/whale/cleanup -H "Authorization: Bearer $CRON_SECRET"`. Only ever deletes from `whale_transfers` — never `whale_wallets`, `token_metadata`, `wallet_balances`, or anything outside this feature.

## Activating Whale Tracker in the UI

Already wired — open **ELVOID PRO**, click the **Whale Tracker** tab at the top of the terminal (next to **Terminal**). No further steps.

## Testing

No live network/database access was available in the environment this was built in (see caveat below), so nothing here has been executed end-to-end. Suggested manual verification once deployed with real credentials:

1. Run the SQL migration, confirm all 6 tables + 5 functions exist.
2. `POST /api/whale/indexer/run` once — check the JSON response's `erc20LogsScanned` / `nativeTxScanned` / `whaleTransfersInserted` are non-zero (or `skippedNoWork: true` if the checkpoint is already caught up to latest block).
3. Run it a second time immediately — `whaleTransfersInserted` for any block range that overlaps should not double-count (idempotency check).
4. Open Whale Tracker in the UI — All Transfers should populate; click a `FROM`/`TO` address and confirm Wallet Intelligence opens; click **Refresh live balance** and confirm holdings populate from a real `eth_getBalance`/`balanceOf` read.
5. Manually lower `WHALE_USD_THRESHOLD_BSC` to something tiny (e.g. `1`) temporarily and re-run the indexer to confirm the threshold is honored end-to-end.
6. `POST /api/whale/cleanup` — confirm `storage.pressure` reports correctly relative to actual table size.

## Known limitations (V1, documented tradeoffs)

- **Wallet equity token set is bounded to "tokens this wallet has whale-transferred"**, not a full on-chain token-discovery scan (that needs a paid indexing API like Moralis/Covalent, not currently integrated). Balances themselves are always live `eth_getBalance`/`balanceOf` reads, never derived from "last transaction seen" — see `walletEquity.ts` for the full reasoning.
- **Whale-filter rule for unpriced tokens:** a transfer with no resolvable USD price is only kept if one side is an already-tracked whale wallet; otherwise it's discarded rather than flooding the table with every zero-liquidity/spam token transfer on the chain. See the comment block at the top of `chains/bsc/indexer.ts`.
- **Counterparty graph is a ranked list** (Top Counterparties, in Wallet Intelligence), not a rendered node/edge graph — matches the spec's "V1 graph sederhana sudah cukup... jangan membuat graph engine kompleks jika belum diperlukan."
- **Realtime updates are polling-based** (client hook every 20-30s against our own indexed API), not Supabase Realtime — spec explicitly marks Realtime as optional ("boleh digunakan"), and polling is simpler to reason about without live testing available.
- **Native-transfer scanning fetches full block bodies** (`includeTransactions: true`) for every block in a batch — this is the correct way to catch native BNB transfers (there's no log/event for them), but is the most RPC-heavy part of the pipeline. A dedicated RPC provider (not the public default) is recommended once indexing volume grows.
