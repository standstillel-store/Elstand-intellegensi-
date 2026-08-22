import { getSupabase } from "../supabase";
import type { BinanceMarket, BinanceMode, OrderSide, PositionSide } from "./types";

// ---------------------------------------------------------------------------
// Persistence for everything Binance itself doesn't remember for us: our own
// idempotency/audit trail, per-position strategy metadata, auto-trader
// config, its decision journal, and the emergency kill-switch. Same
// graceful-degrade rule as lib/elvoid/paperTrader.ts — every function
// checks getSupabase() for null first, so the Trading Engine still places
// real orders on Binance even without Supabase configured; it just can't
// remember *why* between requests, and the AI Auto Trader (which needs the
// settings/log tables) simply reports itself unconfigured until Supabase is set up.
// ---------------------------------------------------------------------------

export interface OrderLogEntry {
  client_order_id: string;
  binance_order_id?: number;
  symbol: string;
  market: BinanceMarket;
  mode: BinanceMode;
  side: OrderSide;
  position_side: PositionSide;
  order_type: string;
  quantity: number;
  price?: number;
  stop_price?: number;
  status?: string;
  reduce_only?: boolean;
  source: "manual" | "auto_trader" | "emergency";
  strategy?: string;
  confluences?: number;
  risk_percent?: number;
  risk_reward?: number;
  reason?: string;
}

export async function logOrder(entry: OrderLogEntry): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("bn_orders_log").insert(entry);
  if (error) console.error("[ElVoid AI][Binance] logOrder gagal:", error.message);
}

export async function updateOrderLogStatus(clientOrderId: string, status: string, binanceOrderId?: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (binanceOrderId !== undefined) patch.binance_order_id = binanceOrderId;
  const { error } = await sb.from("bn_orders_log").update(patch).eq("client_order_id", clientOrderId);
  if (error) console.error("[ElVoid AI][Binance] updateOrderLogStatus gagal:", error.message);
}

/**
 * Duplicate-order / accidental-double-entry guard: true if an order with
 * the same symbol+side+type was logged within `withinMs`. The order route
 * and the auto-trader both check this before placing a new *opening* order
 * (reduceOnly/closing orders are exempt — closing twice just no-ops on
 * Binance's side, opening twice doubles real exposure).
 */
export async function hasRecentDuplicate(symbol: string, side: OrderSide, orderType: string, withinMs: number): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const since = new Date(Date.now() - withinMs).toISOString();
  const { data, error } = await sb
    .from("bn_orders_log")
    .select("id")
    .eq("symbol", symbol)
    .eq("side", side)
    .eq("order_type", orderType)
    .eq("source", "manual")
    .gte("created_at", since)
    .limit(1);
  if (error) return false;
  return Boolean(data && data.length);
}

export interface PositionMeta {
  symbol: string;
  side: "LONG" | "SHORT";
  entry_client_order_id?: string;
  strategy?: string;
  confluences?: number;
  risk_reward?: number;
  initial_entry?: number;
  initial_stop?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  breakeven_moved: boolean;
  tp1_filled: boolean;
  tp2_filled: boolean;
  trailing_active: boolean;
  opened_by: "manual" | "auto_trader";
  opened_at: string;
}

export async function getPositionMeta(symbol: string): Promise<PositionMeta | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("bn_position_meta").select("*").eq("symbol", symbol).maybeSingle();
  return (data as PositionMeta) ?? null;
}

export async function getAllPositionMeta(): Promise<PositionMeta[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("bn_position_meta").select("*");
  return (data as PositionMeta[]) ?? [];
}

export async function upsertPositionMeta(meta: Partial<PositionMeta> & { symbol: string }): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("bn_position_meta").upsert({ ...meta, updated_at: new Date().toISOString() });
  if (error) console.error("[ElVoid AI][Binance] upsertPositionMeta gagal:", error.message);
}

export async function deletePositionMeta(symbol: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("bn_position_meta").delete().eq("symbol", symbol);
}

export interface AutoTraderSettings {
  enabled: boolean;
  symbols: string[];
  timeframe: string;
  risk_percent: number;
  leverage: number;
  min_confluences: number;
  min_risk_reward: number;
  max_risk_reward: number;
  max_concurrent_positions: number;
  cooldown_minutes: number;
  running: boolean;
  last_run_at: string | null;
  updated_at: string;
}

const DEFAULT_AUTO_TRADER_SETTINGS: AutoTraderSettings = {
  enabled: false,
  symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
  timeframe: "15m",
  risk_percent: 1,
  leverage: 5,
  min_confluences: 5,
  min_risk_reward: 3,
  max_risk_reward: 10,
  max_concurrent_positions: 3,
  cooldown_minutes: 15,
  running: false,
  last_run_at: null,
  updated_at: new Date(0).toISOString(),
};

export function getDefaultAutoTraderSettings(): AutoTraderSettings {
  return { ...DEFAULT_AUTO_TRADER_SETTINGS, updated_at: new Date().toISOString() };
}

export async function getAutoTraderSettings(): Promise<AutoTraderSettings | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("bn_auto_trader_settings").select("*").eq("id", 1).maybeSingle();
  return (data as AutoTraderSettings) ?? null;
}

export async function updateAutoTraderSettings(patch: Partial<AutoTraderSettings>): Promise<{ settings: AutoTraderSettings } | { error: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase belum dikonfigurasi — AI Auto Trading butuh Supabase untuk menyimpan konfigurasi & jurnal keputusan." };
  if (patch.risk_percent !== undefined && (patch.risk_percent <= 0 || patch.risk_percent > 1)) {
    return { error: "Risk per trade untuk Auto Trading harus di antara 0% (eksklusif) dan 1% (maksimum absolut)." };
  }
  if (patch.min_risk_reward !== undefined && patch.min_risk_reward < 3) {
    return { error: "Minimum Risk:Reward tidak boleh di bawah 1:3." };
  }
  const { data, error } = await sb
    .from("bn_auto_trader_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "Gagal menyimpan pengaturan Auto Trading." };
  return { settings: data as AutoTraderSettings };
}

/**
 * Advisory lock so overlapping cron invocations (a slow tick still running
 * when the next minute's tick fires) never run concurrently and double up
 * on decisions/orders. A `running` flag stuck true for more than 3 minutes
 * is treated as stale (a crashed previous tick) and force-released — this
 * is the "prevent infinite loops / stuck state" safeguard for the
 * scheduler itself, distinct from the per-symbol cooldown in autoTrader.ts.
 */
export async function acquireTickLock(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return true; // no persistence layer to lock against — caller proceeds best-effort
  const { data } = await sb.from("bn_auto_trader_settings").select("running, last_run_at").eq("id", 1).maybeSingle();
  if (data?.running) {
    const staleMs = data.last_run_at ? Date.now() - new Date(data.last_run_at).getTime() : Infinity;
    if (staleMs < 3 * 60_000) return false; // a tick is genuinely still running
  }
  const { error } = await sb.from("bn_auto_trader_settings").update({ running: true, last_run_at: new Date().toISOString() }).eq("id", 1);
  return !error;
}

export async function releaseTickLock(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("bn_auto_trader_settings").update({ running: false }).eq("id", 1);
}

export interface DecisionLogEntry {
  action: string;
  symbol?: string;
  side?: "LONG" | "SHORT";
  detail: string;
  meta?: Record<string, unknown>;
}

export async function logDecision(entry: DecisionLogEntry): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("bn_auto_trader_log").insert(entry);
  if (error) console.error("[ElVoid AI][Binance] logDecision gagal:", error.message);
}

export async function getRecentDecisions(limit = 100): Promise<(DecisionLogEntry & { id: string; ran_at: string })[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("bn_auto_trader_log").select("*").order("ran_at", { ascending: false }).limit(limit);
  return (data as (DecisionLogEntry & { id: string; ran_at: string })[]) ?? [];
}

export interface EmergencyStopState {
  stopped: boolean;
  reason: string | null;
  updated_at: string;
}

export async function getEmergencyStop(): Promise<EmergencyStopState> {
  const sb = getSupabase();
  if (!sb) return { stopped: false, reason: null, updated_at: new Date().toISOString() };
  const { data } = await sb.from("bn_emergency_stop").select("*").eq("id", 1).maybeSingle();
  return (data as EmergencyStopState) ?? { stopped: false, reason: null, updated_at: new Date().toISOString() };
}

export async function setEmergencyStop(stopped: boolean, reason?: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("bn_emergency_stop").update({ stopped, reason: reason ?? null, updated_at: new Date().toISOString() }).eq("id", 1);
}
