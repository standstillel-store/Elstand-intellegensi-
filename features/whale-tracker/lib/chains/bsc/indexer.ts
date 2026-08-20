import { getBscClient } from "./client";
import { fetchErc20TransferLogs, fetchNativeTransfers, readErc20Metadata, decodeAmount } from "./transferParser";
import { getLastProcessedBlock, setLastProcessedBlock } from "../../checkpoint";
import { getTokenMetadataBatch, upsertTokenMetadata, upsertTokenPrice } from "../../tokenMetadataStore";
import { getPricesForTokens } from "../../priceSource";
import { insertWhaleTransfers, type NewWhaleTransfer } from "../../transfersStore";
import { touchWallet } from "../../walletStore";
import { ensureWhaleStorageBudget } from "../../storageGuard";
import { WHALE_CHAIN, WHALE_USD_THRESHOLD, NATIVE_TOKEN_ADDRESS, BSC_BLOCK_BATCH_SIZE } from "../../config";

// ---------------------------------------------------------------------------
// Pipeline (spec):
//   BSC RPC → Block Listener → Transfer Event Parser → Token Metadata →
//   USD Valuation → Whale Filter → Supabase → Whale API → Dashboard
//
// Whale-filter rule (revised 2026-08 — see AUDIT.md "Phase 4"):
//   - is_native = true (BNB)                              → ALWAYS keep,
//     regardless of price/value (native transfers are the rarest/most
//     load-bearing signal; never worth discarding over a CoinGecko miss).
//   - price known  + value_usd >= WHALE_USD_THRESHOLD      → keep
//   - price known  + value_usd <  WHALE_USD_THRESHOLD      → discard (genuinely not whale-sized)
//   - price unknown (any BEP-20 token CoinGecko doesn't list — meme/microcap/new)
//                                                            → ALWAYS keep,
//     stored with price_usd/value_usd = null ("Price unavailable" in the UI).
// Per explicit spec correction: "Do NOT discard the transfer simply because
// USD pricing is unavailable." A transfer with no resolvable price is no
// longer conditioned on either side being an already-tracked wallet — every
// decoded BEP-20 Transfer log and every native BNB tx that clears the RPC
// layer is a real on-chain transfer and gets persisted. The USD threshold
// only prunes transfers that DO have a price and are provably below
// WHALE_USD_THRESHOLD — it was never meant to prune transfers we simply
// can't price yet. Storage-budget protection is handled entirely by
// storageGuard.ts's 150MB/120MB retention sweep (which already prioritizes
// dropping oldest+lowest/null-value rows first), not by refusing to ingest.
// ---------------------------------------------------------------------------

export interface IndexerRunResult {
  latestBlock: number;
  fromBlock: number;
  toBlock: number;
  scannedBlocks: number;
  erc20LogsScanned: number;
  nativeTransactionsScanned: number;
  transfersDecoded: number;
  transfersQualified: number;
  transfersInserted: number;
  checkpointBefore: number | null;
  checkpointAfter: number;
  durationMs: number;
  skippedNoWork: boolean;
  // Deprecated aliases — kept so any existing caller reading the old field
  // names doesn't break; new callers should read the names above.
  nativeTxScanned: number;
  whaleTransfersInserted: number;
}

export async function runIncrementalScan(chain: string = WHALE_CHAIN): Promise<IndexerRunResult> {
  const startedAt = Date.now();
  // Non-blocking pressure check — never delays or skips indexing itself.
  void ensureWhaleStorageBudget();

  const client = getBscClient();
  const latestBlock = await client.getBlockNumber();

  const checkpoint = await getLastProcessedBlock(chain);
  const fromBlock = checkpoint != null ? BigInt(checkpoint + 1) : latestBlock > BigInt(BSC_BLOCK_BATCH_SIZE) ? latestBlock - BigInt(BSC_BLOCK_BATCH_SIZE) : BigInt(0);
  const toBlock = fromBlock + BigInt(BSC_BLOCK_BATCH_SIZE) - BigInt(1) > latestBlock ? latestBlock : fromBlock + BigInt(BSC_BLOCK_BATCH_SIZE) - BigInt(1);

  if (fromBlock > toBlock) {
    return {
      latestBlock: Number(latestBlock),
      fromBlock: Number(fromBlock),
      toBlock: Number(toBlock),
      scannedBlocks: 0,
      erc20LogsScanned: 0,
      nativeTransactionsScanned: 0,
      transfersDecoded: 0,
      transfersQualified: 0,
      transfersInserted: 0,
      checkpointBefore: checkpoint,
      checkpointAfter: checkpoint ?? Number(toBlock),
      durationMs: Date.now() - startedAt,
      skippedNoWork: true,
      nativeTxScanned: 0,
      whaleTransfersInserted: 0,
    };
  }

  // Native transfers also gives us block timestamps for the whole range —
  // reused below for ERC-20 log timestamps so we never fetch the same
  // block twice.
  const { transfers: nativeTransfers, blockTimestamps } = await fetchNativeTransfers(fromBlock, toBlock);
  const erc20Logs = await fetchErc20TransferLogs(fromBlock, toBlock);

  // --- Token metadata resolution (once per unseen token) ---------------
  const uniqueTokenAddresses = Array.from(new Set(erc20Logs.map((l) => l.tokenAddress)));
  const cachedMeta = await getTokenMetadataBatch(uniqueTokenAddresses, chain);
  const missing = uniqueTokenAddresses.filter((a) => !cachedMeta.has(a));
  for (const tokenAddress of missing) {
    const meta = await readErc20Metadata(client, tokenAddress);
    await upsertTokenMetadata(tokenAddress, meta, chain);
    cachedMeta.set(tokenAddress, { chain: chain as "bsc", tokenAddress, symbol: meta.symbol, name: meta.name, decimals: meta.decimals, priceUsd: null, priceUpdatedAt: null, logoUrl: null });
  }

  // --- USD valuation (batched, cached — never one request per transfer) --
  const tokensForPricing = Array.from(new Set([...uniqueTokenAddresses, ...(nativeTransfers.length ? [NATIVE_TOKEN_ADDRESS] : [])]));
  const prices = await getPricesForTokens(tokensForPricing);
  for (const tokenAddress of uniqueTokenAddresses) {
    const price = prices.get(tokenAddress);
    if (price != null) await upsertTokenPrice(tokenAddress, price, chain);
  }

  // --- Build candidate rows ----------------------------------------------
  const candidates: NewWhaleTransfer[] = [];

  for (const log of erc20Logs) {
    const meta = cachedMeta.get(log.tokenAddress);
    const amount = decodeAmount(log.rawValue, meta?.decimals ?? null);
    const priceUsd = prices.get(log.tokenAddress) ?? null;
    const valueUsd = priceUsd != null ? amount * priceUsd : null;
    const ts = blockTimestamps.get(log.blockNumber.toString());
    candidates.push({
      chain,
      txHash: log.txHash,
      logIndex: log.logIndex,
      blockNumber: Number(log.blockNumber),
      blockTimestamp: new Date(Number(ts ?? BigInt(0)) * 1000).toISOString(),
      fromAddress: log.from,
      toAddress: log.to,
      isNative: false,
      tokenAddress: log.tokenAddress,
      tokenSymbol: meta?.symbol ?? null,
      tokenName: meta?.name ?? null,
      tokenDecimals: meta?.decimals ?? null,
      amount,
      priceUsd,
      valueUsd,
    });
  }

  for (const tx of nativeTransfers) {
    const amount = decodeAmount(tx.rawValue, 18);
    const priceUsd = prices.get(NATIVE_TOKEN_ADDRESS) ?? null;
    const valueUsd = priceUsd != null ? amount * priceUsd : null;
    const ts = blockTimestamps.get(tx.blockNumber.toString());
    candidates.push({
      chain,
      txHash: tx.txHash,
      logIndex: -1,
      blockNumber: Number(tx.blockNumber),
      blockTimestamp: new Date(Number(ts ?? BigInt(0)) * 1000).toISOString(),
      fromAddress: tx.from,
      toAddress: tx.to,
      isNative: true,
      tokenAddress: null,
      tokenSymbol: "BNB",
      tokenName: "BNB",
      tokenDecimals: 18,
      amount,
      priceUsd,
      valueUsd,
    });
  }

  // --- Whale filter (see rule doc above — revised 2026-08) ----------------
  const whaleRows: NewWhaleTransfer[] = [];
  for (const row of candidates) {
    if (row.isNative) {
      whaleRows.push(row); // native BNB: always keep, priced or not
      continue;
    }
    if (row.valueUsd != null) {
      if (row.valueUsd >= WHALE_USD_THRESHOLD) whaleRows.push(row);
      continue; // priced but below threshold — genuinely not whale-sized, discard
    }
    // Price unavailable (meme/microcap/new token CoinGecko hasn't indexed
    // yet) — no longer gated on wallet-tracked status. Every real decoded
    // transfer is persisted; USD stays null ("Price unavailable" in UI).
    whaleRows.push(row);
  }

  const inserted = await insertWhaleTransfers(whaleRows);

  // Track wallet activity for whatever actually got persisted.
  const seenAddresses = new Set<string>();
  for (const row of whaleRows) {
    seenAddresses.add(row.fromAddress);
    seenAddresses.add(row.toAddress);
  }
  await Promise.all(Array.from(seenAddresses).map((a) => touchWallet(a, chain)));

  await setLastProcessedBlock(Number(toBlock), chain);

  return {
    latestBlock: Number(latestBlock),
    fromBlock: Number(fromBlock),
    toBlock: Number(toBlock),
    scannedBlocks: Number(toBlock - fromBlock + BigInt(1)),
    erc20LogsScanned: erc20Logs.length,
    nativeTransactionsScanned: nativeTransfers.length,
    transfersDecoded: candidates.length,
    transfersQualified: whaleRows.length,
    transfersInserted: inserted,
    checkpointBefore: checkpoint,
    checkpointAfter: Number(toBlock),
    durationMs: Date.now() - startedAt,
    skippedNoWork: false,
    // deprecated aliases, same values
    nativeTxScanned: nativeTransfers.length,
    whaleTransfersInserted: inserted,
  };
}
