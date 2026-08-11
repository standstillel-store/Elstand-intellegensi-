import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../supabase";
import type { AiJournalEntry, AiSignal, AiStatistics, PaperWallet, OrderType } from "./types";
import { GRADE_ORDER } from "./types";
import { computeCloseResult, computeUnrealized } from "./math";

export { computeUnrealized };

// ---------------------------------------------------------------------------
// Paper trading only — nothing here ever touches a real exchange or real
// funds. This module owns the lifecycle of a signal once it's executed as a
// position (new -> open -> tp1_hit -> closed), the paper wallet's
// balance/equity, and the ai_statistics summary row. All math is a standard
// risk-based position-sizing model: every trade risks `risk_per_trade`% of
// equity, so a full stop-loss is always exactly -risk_per_trade% and the
// realized R-multiple (`rr`) is what actually happened relative to that.
// ---------------------------------------------------------------------------

const DEFAULT_WALLET: PaperWallet = {
  balance: 10000,
  equity: 10000,
  total_profit: 0,
  risk_per_trade: 1,
  auto_execute: false,
  auto_execute_min_grade: "A",
  updated_at: new Date(0).toISOString(),
};

/**
 * Auto-execute is now a hardcoded, always-on behavior — not a user-facing
 * Settings toggle (removed from Settings UI; the `auto_execute` /
 * `auto_execute_min_grade` columns on `paper_wallet` are kept for schema
 * compat but no longer read for this decision). Every freshly-generated
 * signal (from Scan Market or single-coin Analyze) — any Trade Grade, C
 * through A++ — is auto-opened as a Market Order in the paper trader.
 */
export const AUTO_EXECUTE_ALL_GRADES = true;

export function getDefaultWallet(): PaperWallet {
  return { ...DEFAULT_WALLET, updated_at: new Date().toISOString() };
}

export async function getWallet(): Promise<PaperWallet | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("paper_wallet").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return data as PaperWallet;
}

const DEFAULT_STATS: AiStatistics = {
  total_trade: 0,
  wins: 0,
  losses: 0,
  win_rate: 0,
  average_rr: 0,
  profit_factor: 0,
  max_drawdown: 0,
  total_profit: 0,
  updated_at: new Date(0).toISOString(),
};

export function getDefaultStatistics(): AiStatistics {
  return { ...DEFAULT_STATS, updated_at: new Date().toISOString() };
}

export async function getStatistics(): Promise<AiStatistics | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("ai_statistics").select("*").eq("id", 1).maybeSingle();
  return (data as AiStatistics) ?? null;
}

export async function updateWalletSettings(
  riskPercent: number,
  autoExecute?: boolean,
  autoExecuteMinGrade?: PaperWallet["auto_execute_min_grade"]
): Promise<{ wallet: PaperWallet } | { error: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase belum dikonfigurasi — tambahkan env var terlebih dahulu di Settings." };
  const clamped = Math.max(0.1, Math.min(10, riskPercent));
  const patch: Record<string, unknown> = { risk_per_trade: clamped, updated_at: new Date().toISOString() };
  if (autoExecute !== undefined) patch.auto_execute = autoExecute;
  if (autoExecuteMinGrade !== undefined) patch.auto_execute_min_grade = autoExecuteMinGrade;
  const { data, error } = await sb.from("paper_wallet").update(patch).eq("id", 1).select().single();
  if (error || !data) return { error: error?.message ?? "Gagal menyimpan pengaturan wallet." };
  return { wallet: data as PaperWallet };
}

export async function resetPaperTrader(startingBalance = 10000): Promise<{ ok: true } | { error: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase belum dikonfigurasi." };
  await sb.from("ai_journal").delete().not("id", "is", null);
  await sb.from("ai_signals").delete().not("id", "is", null);
  await sb
    .from("ai_statistics")
    .update({
      total_trade: 0,
      wins: 0,
      losses: 0,
      win_rate: 0,
      average_rr: 0,
      profit_factor: 0,
      max_drawdown: 0,
      total_profit: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  await sb
    .from("paper_wallet")
    .update({ balance: startingBalance, equity: startingBalance, total_profit: 0, updated_at: new Date().toISOString() })
    .eq("id", 1);
  return { ok: true };
}

const GRADE_RANK: Record<PaperWallet["auto_execute_min_grade"], number> = Object.fromEntries(
  GRADE_ORDER.map((g, i) => [g, i + 1])
) as Record<PaperWallet["auto_execute_min_grade"], number>;

/** True when `grade` is at least as good as `minGrade` (A+ is best, C is worst). */
export function gradeMeetsThreshold(grade: PaperWallet["auto_execute_min_grade"], minGrade: PaperWallet["auto_execute_min_grade"]): boolean {
  return GRADE_RANK[grade] >= GRADE_RANK[minGrade];
}

/**
 * Market Order fills immediately at the live price used at scan time (the
 * signal's `entry` field, which was set to currentPrice at generation).
 * Limit and Stop go to a "pending" state instead — see
 * `evaluatePendingOrders` for the trigger rules — and only become an open
 * position once price actually reaches the relevant trigger.
 */
/** Cancels a working Limit/Stop order and reverts it to "new" so the user can re-execute with a different order type. */
export async function cancelPendingOrder(signalId: string): Promise<{ signal: AiSignal } | { error: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase belum dikonfigurasi." };
  const { data: signal } = await sb.from("ai_signals").select("*").eq("id", signalId).maybeSingle();
  if (!signal) return { error: "Sinyal tidak ditemukan." };
  if (signal.status !== "pending") return { error: "Sinyal ini bukan pending order." };
  const { data: updated, error } = await sb
    .from("ai_signals")
    .update({ status: "new", order_type: "market" })
    .eq("id", signalId)
    .select()
    .single();
  if (error || !updated) return { error: error?.message ?? "Gagal membatalkan order." };
  return { signal: updated as AiSignal };
}

export async function executeSignal(
  signalId: string,
  orderType: OrderType = "market"
): Promise<{ signal: AiSignal } | { error: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase belum dikonfigurasi — sinyal ini tidak bisa dieksekusi sebagai paper trade." };
  const { data: signal } = await sb.from("ai_signals").select("*").eq("id", signalId).maybeSingle();
  if (!signal) return { error: "Sinyal tidak ditemukan." };
  if (signal.status !== "new") return { error: "Sinyal ini sudah dieksekusi atau sudah ditutup sebelumnya." };

  const nextStatus = orderType === "market" ? "open" : "pending";
  const { data: updated, error } = await sb
    .from("ai_signals")
    .update({ status: nextStatus, order_type: orderType })
    .eq("id", signalId)
    .select()
    .single();
  if (error || !updated) return { error: error?.message ?? "Gagal membuka posisi." };
  return { signal: updated as AiSignal };
}

async function writeClose(
  sb: SupabaseClient,
  signal: AiSignal,
  exitPrice: number,
  wallet: PaperWallet,
  note: string
): Promise<AiJournalEntry | null> {
  const { rr, profitPercent, result } = computeCloseResult(signal, exitPrice, wallet.risk_per_trade);
  const durationMinutes = Math.max(0, Math.round((Date.now() - new Date(signal.created_at).getTime()) / 60000));
  const { data: journalRow, error } = await sb
    .from("ai_journal")
    .insert({
      signal_id: signal.id,
      result,
      profit_percent: Number(profitPercent.toFixed(4)),
      rr: Number(rr.toFixed(3)),
      duration_minutes: durationMinutes,
      notes: note,
    })
    .select()
    .single();
  if (error) {
    console.error("[ElVoid AI] writeClose journal error:", error.message);
    return null;
  }
  await sb.from("ai_signals").update({ status: "closed" }).eq("id", signal.id);

  const newBalance = wallet.balance * (1 + profitPercent / 100);
  await sb
    .from("paper_wallet")
    .update({
      balance: newBalance,
      equity: newBalance,
      total_profit: wallet.total_profit + profitPercent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  wallet.balance = newBalance;
  wallet.equity = newBalance;
  wallet.total_profit += profitPercent;

  return journalRow as AiJournalEntry;
}

export async function closeSignalManually(signalId: string, exitPrice: number): Promise<{ journal: AiJournalEntry } | { error: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase belum dikonfigurasi." };
  const { data: signal } = await sb.from("ai_signals").select("*").eq("id", signalId).maybeSingle();
  if (!signal || !["open", "tp1_hit"].includes(signal.status)) return { error: "Posisi terbuka tidak ditemukan." };
  const wallet = await getWallet();
  if (!wallet) return { error: "Wallet tidak ditemukan." };
  const journal = await writeClose(sb, signal as AiSignal, exitPrice, wallet, "Ditutup manual dari Paper Trader");
  if (!journal) return { error: "Gagal menutup posisi." };
  await recomputeStatistics();
  return { journal };
}

export interface EvaluateResult {
  closed: AiJournalEntry[];
  stillOpen: AiSignal[];
}

/**
 * Marks-to-market every open position against live prices and closes any
 * that crossed Stop Loss or Take Profit. TP1 moves the stop to breakeven
 * and lets the position keep running toward TP2 (a common, realistic rule),
 * rather than closing the whole position at the first target.
 */
export async function evaluateOpenTrades(priceBySymbol: Record<string, number>): Promise<EvaluateResult> {
  const sb = getSupabase();
  if (!sb) return { closed: [], stillOpen: [] };

  const { data: openRows } = await sb.from("ai_signals").select("*").in("status", ["open", "tp1_hit"]);
  const signals = (openRows ?? []) as AiSignal[];
  const wallet = await getWallet();
  if (!wallet || !signals.length) return { closed: [], stillOpen: signals };

  const closed: AiJournalEntry[] = [];

  for (const signal of signals) {
    const price = priceBySymbol[signal.coin.toLowerCase()];
    if (price === undefined) continue;
    const dir = signal.side === "LONG" ? 1 : -1;
    // Once TP1 has hit, the *protective* stop moves to breakeven (entry),
    // but `signal.sl` itself is deliberately left untouched in the DB — it
    // stays the original risk basis so R-multiple math (computeCloseResult /
    // computeUnrealized) always reads against the risk actually taken, not
    // a distance of ~0 after the stop moves.
    const effectiveStop = signal.status === "tp1_hit" ? signal.entry : signal.sl;
    const hitSl = dir === 1 ? price <= effectiveStop : price >= effectiveStop;
    const hitTp1 = dir === 1 ? price >= signal.tp1 : price <= signal.tp1;
    const hitTp2 = dir === 1 ? price >= signal.tp2 : price <= signal.tp2;

    if (signal.status === "open" && hitSl) {
      const entry = await writeClose(sb, signal, signal.sl, wallet, "Stop Loss tersentuh");
      if (entry) closed.push(entry);
      continue;
    }
    if (signal.status === "open" && hitTp1) {
      await sb.from("ai_signals").update({ status: "tp1_hit" }).eq("id", signal.id);
      signal.status = "tp1_hit"; // sl intentionally left as-is — see note above
    }
    if (signal.status === "tp1_hit" && hitTp2) {
      const entry = await writeClose(sb, signal, signal.tp2, wallet, "Take Profit 2 tersentuh");
      if (entry) closed.push(entry);
      continue;
    }
    if (signal.status === "tp1_hit" && hitSl) {
      const entry = await writeClose(sb, signal, signal.entry, wallet, "Breakeven stop tersentuh setelah TP1");
      if (entry) closed.push(entry);
      continue;
    }
  }

  if (closed.length) await recomputeStatistics();

  const { data: stillOpenRows } = await sb.from("ai_signals").select("*").in("status", ["open", "tp1_hit"]);
  return { closed, stillOpen: (stillOpenRows ?? []) as AiSignal[] };
}

export interface PendingEvaluateResult {
  triggered: AiSignal[];
  expired: AiSignal[];
  stillPending: AiSignal[];
}

const PENDING_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48h — a Limit/Stop that never filled stops being relevant

/**
 * Checks every "pending" Limit/Stop order against live price:
 * - Limit fills once price reaches the signal's `entry` (pulls back to it —
 *   the classic resting-limit-order read).
 * - Stop fills once price breaks *through* entry, further in the trade's
 *   direction, by 0.3x the original risk distance — a "confirm the
 *   breakout before entering" trigger, derived entirely from the signal's
 *   own entry/sl so no extra price column is needed.
 * Either way, the position opens at the *original* `entry` field for P&L
 * accounting (computeUnrealized/computeCloseResult both read against it) —
 * a deliberate simplification, documented here and in the UI, rather than
 * silently rewriting a field other calculations depend on.
 */
export async function evaluatePendingOrders(priceBySymbol: Record<string, number>): Promise<PendingEvaluateResult> {
  const sb = getSupabase();
  if (!sb) return { triggered: [], expired: [], stillPending: [] };

  const { data: rows } = await sb.from("ai_signals").select("*").eq("status", "pending");
  const pending = (rows ?? []) as AiSignal[];
  if (!pending.length) return { triggered: [], expired: [], stillPending: [] };

  const triggered: AiSignal[] = [];
  const expired: AiSignal[] = [];
  const stillPending: AiSignal[] = [];

  for (const signal of pending) {
    const price = priceBySymbol[signal.coin.toLowerCase()];
    const ageMs = Date.now() - new Date(signal.created_at).getTime();

    if (ageMs > PENDING_EXPIRY_MS) {
      await sb.from("ai_signals").update({ status: "expired" }).eq("id", signal.id);
      expired.push({ ...signal, status: "expired" });
      continue;
    }
    if (price === undefined) {
      stillPending.push(signal);
      continue;
    }

    const dir = signal.side === "LONG" ? 1 : -1;
    const riskDistance = Math.abs(signal.entry - signal.sl) || signal.entry * 0.02;
    let fired = false;

    if (signal.order_type === "limit") {
      fired = dir === 1 ? price <= signal.entry : price >= signal.entry;
    } else if (signal.order_type === "stop") {
      const trigger = signal.entry + dir * riskDistance * 0.3;
      fired = dir === 1 ? price >= trigger : price <= trigger;
    }

    if (fired) {
      const { data: updated } = await sb.from("ai_signals").update({ status: "open" }).eq("id", signal.id).select().single();
      triggered.push((updated as AiSignal) ?? { ...signal, status: "open" });
    } else {
      stillPending.push(signal);
    }
  }

  return { triggered, expired, stillPending };
}

export async function recomputeStatistics(): Promise<AiStatistics | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("ai_journal").select("*").order("closed_at", { ascending: true });
  const entries = (data ?? []) as AiJournalEntry[];

  const total = entries.length;
  const wins = entries.filter((e) => e.result === "win").length;
  const losses = entries.filter((e) => e.result === "loss").length;
  const winRate = total ? (wins / total) * 100 : 0;
  const averageRr = total ? entries.reduce((s, e) => s + e.rr, 0) / total : 0;

  const grossWin = entries.filter((e) => e.profit_percent > 0).reduce((s, e) => s + e.profit_percent, 0);
  const grossLoss = Math.abs(entries.filter((e) => e.profit_percent < 0).reduce((s, e) => s + e.profit_percent, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin;

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const e of entries) {
    cumulative += e.profit_percent;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  const stats = {
    total_trade: total,
    wins,
    losses,
    win_rate: Number(winRate.toFixed(2)),
    average_rr: Number(averageRr.toFixed(3)),
    profit_factor: Number(profitFactor.toFixed(3)),
    max_drawdown: Number(maxDrawdown.toFixed(2)),
    total_profit: Number(cumulative.toFixed(2)),
    updated_at: new Date().toISOString(),
  };

  await sb.from("ai_statistics").update(stats).eq("id", 1);
  return stats as AiStatistics;
}
