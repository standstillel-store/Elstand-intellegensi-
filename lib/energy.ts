import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// "AI Energy" — Phase 3.2 brief. Every user starts with 10 (ai_token's own
// column default), gains +10 back via an explicit daily CLAIM, and spends it
// on the three gated features below. Runs on the exact same ai_token /
// ai_token_transactions tables Phase 3.1 already created (see the "ai_token"
// comment in supabase/schema.sql) — no new table.
//
// Phase 3.1's version of this file passively RESET the balance to a flat 10
// every 24h, the instant anyone read it. That's gone: Phase 3.2 wants an
// ADDITIVE, user-initiated claim instead (+10 on top of whatever's left,
// only when the user taps "Claim" in Settings, gated by 24h since their last
// claim) — a genuinely different mechanic, not just a rename. `last_reset_at`
// keeps its column name (renaming it would mean touching every caller for
// zero functional benefit) but now MEANS "last time this user claimed the
// daily reward" rather than "last passive reset".
// ============================================================================

const NEW_USER_ENERGY = 10;
const DAILY_CLAIM_AMOUNT = 10;
const CLAIM_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_CAS_ATTEMPTS = 3;

/** The three metered features from the brief's "COST" section, and exactly what each costs. Keys double as the `feature` param POST /api/ai-energy/consume takes, and the `reason` logged to ai_token_transactions. */
export const FEATURE_COSTS = {
  analyze_coin: 2,
  generate_signal: 4,
  ai_chat: 2,
} as const;
export type EnergyFeature = keyof typeof FEATURE_COSTS;

export interface EnergyState {
  balance: number;
  /** Legacy field name from the Phase 3.1 stub (was "last passive reset"); now "last daily claim". Kept as-is so app/api/account/{energy,me}/route.ts don't need to change. */
  lastResetAt: string;
  /** Legacy field name; now "next time a daily claim becomes available". */
  nextResetAt: string;
  /** True once 24h have passed since lastResetAt — i.e. POST /api/ai-energy/claim would succeed right now. */
  canClaim: boolean;
}

export interface SpendResult {
  ok: boolean;
  balance: number;
  error?: "insufficient_energy" | "concurrent_update" | string;
}

export interface ClaimResult {
  ok: boolean;
  balance: number;
  nextResetAt: string;
  error?: "too_soon" | "concurrent_update" | string;
}

interface TokenRow {
  balance: number;
  last_reset_at: string;
}

function toState(row: TokenRow): EnergyState {
  const lastClaimMs = new Date(row.last_reset_at).getTime();
  const nextClaimMs = lastClaimMs + CLAIM_INTERVAL_MS;
  return {
    balance: row.balance,
    lastResetAt: row.last_reset_at,
    nextResetAt: new Date(nextClaimMs).toISOString(),
    canClaim: Date.now() >= nextClaimMs,
  };
}

/**
 * Reads the caller's ai_token row, self-healing (creating it with the
 * default 10) if it's somehow missing — e.g. an account older than this
 * table, or upsertUserProfile()'s seed insert hasn't landed yet. Uses
 * ignoreDuplicates so a race between two "first ever" requests can never
 * clobber a balance the other request already created (the Phase 3.1
 * version of this function used a plain upsert here, which would have
 * overwritten on conflict). Never resets an existing balance.
 */
async function readOrCreate(supabase: SupabaseClient, userId: string): Promise<TokenRow> {
  const { data, error } = await supabase.from("ai_token").select("balance, last_reset_at").eq("user_id", userId).maybeSingle();
  if (!error && data) return data as TokenRow;

  const now = new Date().toISOString();
  const { data: created } = await supabase
    .from("ai_token")
    .upsert({ user_id: userId, balance: NEW_USER_ENERGY, last_reset_at: now }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("balance, last_reset_at")
    .maybeSingle();
  if (created) return created as TokenRow;

  // ignoreDuplicates means our own upsert silently no-ops if another
  // concurrent request created the row first — just re-read it.
  const { data: refetched, error: refetchError } = await supabase
    .from("ai_token")
    .select("balance, last_reset_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (refetched) return refetched as TokenRow;

  if (refetchError) console.error("[energy] readOrCreate could not read or create a row:", refetchError.message);
  return { balance: NEW_USER_ENERGY, last_reset_at: now };
}

export async function getEnergyBalance(supabase: SupabaseClient, userId: string): Promise<EnergyState> {
  return toState(await readOrCreate(supabase, userId));
}

type CasOutcome = TokenRow | { reject: string; balance: number };

/**
 * Shared compare-and-swap core for every balance mutation below (spend,
 * refund, claim): re-reads the row, lets `compute` decide the next values
 * from that fresh read (or reject — e.g. "not enough balance" / "too soon to
 * claim" — without writing anything), then writes guarded by
 * .eq("balance", ...).eq("last_reset_at", ...). If a concurrent request
 * changed the row in between, the guard matches zero rows and this retries
 * against a fresh read instead of silently clobbering it or double-spending.
 * Not a real DB-level transaction/row lock, but Postgres only ever commits
 * one UPDATE per row at a time, so this is safe under real concurrency —
 * see the brief's "tidak terjadi negative balance" / "tidak bisa spam
 * claim" requirements. A Postgres RPC with `SELECT ... FOR UPDATE` would be
 * the fully-lock-based version if this app's traffic ever needs it.
 */
async function applyDelta(
  supabase: SupabaseClient,
  userId: string,
  compute: (current: TokenRow) => CasOutcome
): Promise<{ ok: true; balance: number; last_reset_at: string } | { ok: false; error: string; balance: number }> {
  let lastKnownBalance = 0;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const current = await readOrCreate(supabase, userId);
    lastKnownBalance = current.balance;
    const next = compute(current);
    if ("reject" in next) return { ok: false, error: next.reject, balance: next.balance };

    const { data: updated, error } = await supabase
      .from("ai_token")
      .update({ balance: next.balance, last_reset_at: next.last_reset_at, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("balance", current.balance)
      .eq("last_reset_at", current.last_reset_at)
      .select("balance, last_reset_at")
      .maybeSingle();

    if (error) return { ok: false, error: error.message, balance: current.balance };
    if (updated) return { ok: true, balance: updated.balance, last_reset_at: updated.last_reset_at };
    // Someone else's write landed first — loop and retry against a fresh read.
  }
  return { ok: false, error: "concurrent_update", balance: lastKnownBalance };
}

/**
 * Deducts `amount` if there's enough balance, logging the spend to
 * ai_token_transactions. Returns ok:false (balance UNCHANGED) with
 * error:"insufficient_energy" rather than ever letting balance go negative.
 */
export async function spendEnergy(supabase: SupabaseClient, userId: string, amount: number, reason: string): Promise<SpendResult> {
  const result = await applyDelta(supabase, userId, (current) =>
    current.balance < amount
      ? { reject: "insufficient_energy", balance: current.balance }
      : { balance: current.balance - amount, last_reset_at: current.last_reset_at }
  );
  if (!result.ok) return { ok: false, balance: result.balance, error: result.error };
  await supabase.from("ai_token_transactions").insert({ user_id: userId, delta: -amount, reason, balance_after: result.balance });
  return { ok: true, balance: result.balance };
}

/**
 * Adds `amount` back. Used to undo a spendEnergy() when the feature it paid
 * for turned out to fail — net effect across the two calls is "never
 * charged", per the brief's "jika gagal jangan mengurangi Energy" for
 * Generate AI Signal and AI Agent Chat. See lib/energyGate.ts for the
 * reserve-then-refund-on-failure wrapper that calls this.
 */
export async function refundEnergy(supabase: SupabaseClient, userId: string, amount: number, reason: string): Promise<SpendResult> {
  const result = await applyDelta(supabase, userId, (current) => ({
    balance: current.balance + amount,
    last_reset_at: current.last_reset_at,
  }));
  if (!result.ok) return { ok: false, balance: result.balance, error: result.error };
  await supabase.from("ai_token_transactions").insert({ user_id: userId, delta: amount, reason, balance_after: result.balance });
  return { ok: true, balance: result.balance };
}

/**
 * Claims the +10 daily reward if 24h have passed since the last claim —
 * "Bukan reset jam 00.00, tapi 24 jam sejak claim terakhir" (brief). Reuses
 * last_reset_at as the "last claim" timestamp and guards it in the same
 * compare-and-swap as the balance write, so two taps of the Claim button
 * within the same instant can't both succeed (no spam claim).
 */
export async function claimDailyEnergy(supabase: SupabaseClient, userId: string): Promise<ClaimResult> {
  const nowIso = new Date().toISOString();
  const result = await applyDelta(supabase, userId, (current) => {
    const lastClaimMs = new Date(current.last_reset_at).getTime();
    if (Date.now() - lastClaimMs < CLAIM_INTERVAL_MS) {
      return { reject: "too_soon", balance: current.balance };
    }
    return { balance: current.balance + DAILY_CLAIM_AMOUNT, last_reset_at: nowIso };
  });

  if (!result.ok) {
    const state = await getEnergyBalance(supabase, userId);
    return { ok: false, balance: result.balance, nextResetAt: state.nextResetAt, error: result.error };
  }

  await supabase
    .from("ai_token_transactions")
    .insert({ user_id: userId, delta: DAILY_CLAIM_AMOUNT, reason: "daily_claim", balance_after: result.balance });

  return {
    ok: true,
    balance: result.balance,
    nextResetAt: new Date(new Date(result.last_reset_at).getTime() + CLAIM_INTERVAL_MS).toISOString(),
  };
}
