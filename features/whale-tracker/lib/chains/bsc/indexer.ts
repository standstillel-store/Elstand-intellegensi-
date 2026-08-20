import { getBscClient } from "./client";
import { fetchErc20TransferLogs, fetchNativeTransfers, readErc20Metadata, decodeAmount } from "./transferParser";
import { getLastProcessedBlock, setLastProcessedBlock } from "../../checkpoint";
import { getTokenMetadataBatch, upsertTokenMetadata, upsertTokenPrice } from "../../tokenMetadataStore";
import { getPricesForTokens } from "../../priceSource";
import { insertWhaleTransfers, type NewWhaleTransfer } from "../../transfersStore";
import { touchWallet, getWallet } from "../../walletStore";
import { ensureWhaleStorageBudget } from "../../storageGuard";
import { WHALE_CHAIN, WHALE_USD_THRESHOLD, NATIVE_TOKEN_ADDRESS, BSC_BLOCK_BATCH_SIZE } from "../../config";

// ---------------------------------------------------------------------------
// Pipeline (spec):
//   BSC RPC → Block Listener → Transfer Event Parser → Token Metadata →
//   USD Valuation → Whale Filter → Supabase → Whale API → Dashboard
//
// Whale-filter rule (documented tradeoff — see README "Known limitations"):
//   - price known  + value_usd >= WHALE_USD_THRESHOLD  → keep
//   - price known  + value_usd <  WHALE_USD_THRESHOLD  → discard (not whale)
//   - price unknown + counterparty is an already-tracked whale wallet → keep,
//     stored with price_usd/value_usd = null ("Price unavailable" in the UI)
//   - price unknown + neither side is a tracked wallet → discard
// This keeps the "jangan membuat USD value palsu" + "tetap simpan token
// transfer" requirement satisfiable WITHOUT ingesting every zero-price
// spam/microcap token transfer on the chain, which would defeat both the
// whale filter's purpose and the 150MB storage budget.
// ---------------------------------------------------------------------------

export interface IndexerRunResult {
  fromBlock: number;
  toBlock: number;
  scannedBlocks: number;
  erc20LogsScanned: number;
  nativeTxScanned: number;
  whaleTransfersInserted: number;
  skippedNoWork: boolean;
}

export async function runIncrementalScan(chain: string = WHALE_CHAIN): Promise<IndexerRunResult> {
  // Non-blocking pressure check — never delays or skips indexing itself.
  void ensureWhaleStorageBudget();

  const client = getBscClient();
  const latestBlock = await client.getBlockNumber();

  const checkpoint = await getLastProcessedBlock(chain);
  const fromBlock = checkpoint != null ? BigInt(checkpoint + 1) : latestBlock > BigInt(BSC_BLOCK_BATCH_SIZE) ? latestBlock - BigInt(BSC_BLOCK_BATCH_SIZE) : BigInt(0);
  const toBlock = fromBlock + BigInt(BSC_BLOCK_BATCH_SIZE) - BigInt(1) > latestBlock ? latestBlock : fromBlock + BigInt(BSC_BLOCK_BATCH_SIZE) - BigInt(1);

  if (fromBlock > toBlock) {
    return { fromBlock: Number(fromBlock), toBlock: Number(toBlock), scannedBlocks: 0, erc20LogsScanned: 0, nativeTxScanned: 0, whaleTransfersInserted: 0, skippedNoWork: true };
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

  // --- Whale filter --------------------------------------------------------
  const whaleRows: NewWhaleTransfer[] = [];
  for (const row of candidates) {
    if (row.valueUsd != null) {
      if (row.valueUsd >= WHALE_USD_THRESHOLD) whaleRows.push(row);
      continue;
    }
    // Price unavailable — only keep if either side is an already-tracked
    // whale wallet (see rule doc above).
    const [fromWallet, toWallet] = await Promise.all([getWallet(row.fromAddress, chain), getWallet(row.toAddress, chain)]);
    if (fromWallet || toWallet) whaleRows.push(row);
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
    fromBlock: Number(fromBlock),
    toBlock: Number(toBlock),
    scannedBlocks: Number(toBlock - fromBlock + BigInt(1)),
    erc20LogsScanned: erc20Logs.length,
    nativeTxScanned: nativeTransfers.length,
    whaleTransfersInserted: inserted,
    skippedNoWork: false,
  };
}
