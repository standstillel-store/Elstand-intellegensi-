import type { SupabaseClient } from "@supabase/supabase-js";

// "AI Energy" (brief section 6). 10 free, reset every 24h — checked lazily
// against last_reset_at every time the balance is read or spent, instead of
// a cron job: correct regardless of how often a user opens the app, and
// needs no extra scheduled infrastructure (see supabase/schema.sql's ai_token
// comment). Every grant/spend is appended to ai_token_transactions.
const DAILY_FREE_ENERGY = 10;
const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface EnergyState {
  balance: number;
  lastResetAt: string;
  nextResetAt: string;
}

export interface SpendResult {
  ok: boolean;
  balance: number;
  error?: "insufficient_energy" | "concurrent_update" | string;
}

async function ensureFreshBalance(supabase: SupabaseClient, userId: string): Promise<EnergyState> {
  const { data, error } = await supabase.from("ai_token").select("*").eq("user_id", userId).maybeSingle();
  const now = new Date();

  if (error || !data) {
    // Row missing — e.g. an account that predates this table, or the seed
    // upsert in upsertUserProfile() hasn't landed yet. Self-heals here.
    const { data: created } = await supabase
      .from("ai_token")
      .upsert({ user_id: userId, balance: DAILY_FREE_ENERGY, last_reset_at: now.toISOString() }, { onConflict: "user_id" })
      .select()
      .single();
    return {
      balance: created?.balance ?? DAILY_FREE_ENERGY,
      lastResetAt: created?.last_reset_at ?? now.toISOString(),
      nextResetAt: new Date(now.getTime() + RESET_INTERVAL_MS).toISOString(),
    };
  }

  const lastReset = new Date(data.last_reset_at).getTime();
  if (now.getTime() - lastReset >= RESET_INTERVAL_MS) {
    const { data: updated } = await supabase
      .from("ai_token")
      .update({ balance: DAILY_FREE_ENERGY, last_reset_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("user_id", userId)
      .select()
      .single();
    await supabase
      .from("ai_token_transactions")
      .insert({ user_id: userId, delta: DAILY_FREE_ENERGY - data.balance, reason: "daily_reset", balance_after: DAILY_FREE_ENERGY });
    return {
      balance: updated?.balance ?? DAILY_FREE_ENERGY,
      lastResetAt: updated?.last_reset_at ?? now.toISOString(),
      nextResetAt: new Date(now.getTime() + RESET_INTERVAL_MS).toISOString(),
    };
  }

  return { balance: data.balance, lastResetAt: data.last_reset_at, nextResetAt: new Date(lastReset + RESET_INTERVAL_MS).toISOString() };
}

export async function getEnergyBalance(supabase: SupabaseClient, userId: string): Promise<EnergyState> {
  return ensureFreshBalance(supabase, userId);
}

/**
 * Deducts `amount` if there's enough balance, logging the spend to
 * ai_token_transactions. The .eq("balance", state.balance) guard below is a
 * cheap optimistic-concurrency check (not a real DB transaction/row lock) —
 * if two requests race, the second's write matches zero rows and comes back
 * as "concurrent_update" instead of silently double-spending. Callers
 * should treat that as "read the balance again and retry", not a hard
 * failure. Good enough for this app's traffic; a Postgres RPC with
 * `SELECT ... FOR UPDATE` would be the fully-atomic version if this ever
 * needs it.
 */
export async function spendEnergy(supabase: SupabaseClient, userId: string, amount: number, reason: string): Promise<SpendResult> {
  const state = await ensureFreshBalance(supabase, userId);
  if (state.balance < amount) {
    return { ok: false, balance: state.balance, error: "insufficient_energy" };
  }

  const newBalance = state.balance - amount;
  const { data: updated, error } = await supabase
    .from("ai_token")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("balance", state.balance)
    .select()
    .maybeSingle();

  if (error) return { ok: false, balance: state.balance, error: error.message };
  if (!updated) return { ok: false, balance: state.balance, error: "concurrent_update" };

  await supabase.from("ai_token_transactions").insert({ user_id: userId, delta: -amount, reason, balance_after: newBalance });

  return { ok: true, balance: newBalance };
}
