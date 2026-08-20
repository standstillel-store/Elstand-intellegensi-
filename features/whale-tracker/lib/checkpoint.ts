import { getDataSupabase } from "@/lib/supabaseData";
import { WHALE_CHAIN } from "./config";

const TABLE = "whale_indexer_checkpoint";

/**
 * Last block the BSC indexer fully processed for `chain`. Returns null if
 * no checkpoint exists yet (first-ever run) — the scanner (Phase 3) treats
 * that as "start from latest block minus one batch", never "scan from
 * genesis". Never throws — degrades to null on any failure, same
 * "everything degrades gracefully" contract as every other lib/*Store.ts in
 * this codebase (see lib/marketHistory/tickStore.ts).
 */
export async function getLastProcessedBlock(chain: string = WHALE_CHAIN): Promise<number | null> {
  const supabase = getDataSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from(TABLE).select("last_processed_block").eq("chain", chain).maybeSingle();
    if (error || !data) return null;
    return Number(data.last_processed_block);
  } catch (err) {
    console.error("[Whale] getLastProcessedBlock:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Upserts the checkpoint after a batch is fully written to whale_transfers.
 * Callers must persist the batch's rows BEFORE advancing the checkpoint —
 * advancing first and failing the insert would silently skip that block
 * range forever, since the scanner never looks backward on its own.
 */
export async function setLastProcessedBlock(blockNumber: number, chain: string = WHALE_CHAIN): Promise<void> {
  const supabase = getDataSupabase();
  if (!supabase) return;
  try {
    await supabase.from(TABLE).upsert({ chain, last_processed_block: blockNumber, updated_at: new Date().toISOString() }, { onConflict: "chain" });
  } catch (err) {
    console.error("[Whale] setLastProcessedBlock:", err instanceof Error ? err.message : err);
  }
}
