// ---------------------------------------------------------------------------
// Types for ElVoid AI's signal engine and its Supabase-backed tables. Field
// names on the DB-facing interfaces intentionally match the Postgres column
// names 1:1 (see supabase/schema.sql) so rows read straight off the
// Supabase client with no mapping layer to keep in sync.
// ---------------------------------------------------------------------------

export type SignalSide = "LONG" | "SHORT";
export type SignalStatus = "new" | "pending" | "open" | "tp1_hit" | "closed" | "invalidated" | "expired";
export type TradeResult = "win" | "loss" | "breakeven";
export type OrderType = "market" | "limit" | "stop";
export type TradeGrade = "A++" | "A+" | "A" | "B+" | "B" | "C+" | "C";

/** Worst-to-best ordering — index doubles as a rank for "minimum grade" filters/comparisons. Kept here (not paperTrader.ts) so client components can import it without pulling in server-only Supabase code. */
export const GRADE_ORDER: TradeGrade[] = ["C", "C+", "B", "B+", "A", "A+", "A++"];

export interface AiSignal {
  id: string;
  coin: string;
  side: SignalSide;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number | null;
  timeframe: string;
  confidence: number;
  risk_percent: number;
  reason: string;
  strategy: string;
  status: SignalStatus;
  order_type: OrderType;
  trade_grade: TradeGrade | null;
  probability_tp: number | null;
  probability_sl: number | null;
  /** Structured scan snapshot from generation time — powers the AI Reasoning checklist. Null for signals saved before the 2026-07 redesign. */
  scans: ScanResult[] | null;
  extra_reasoning: ScanResult[] | null;
  /** How many of the 12 named confluence factors agreed with `side` at generation time — see lib/elvoid/engine.ts countConfluence(). Null for signals saved before the Phase 2.8 upgrade. */
  confluence_count: number | null;
  confluence_total: number | null;
  ideal_entry_low: number | null;
  ideal_entry_high: number | null;
  expected_duration: string | null;
  /** Entry System (Phase 2.8) — status snapshot at generation time; re-evaluate with lib/elvoid/confirmation.ts + confirmation_zone_ok for a live read. */
  confirmation_status: "confirmed" | "waiting" | "invalid" | null;
  confirmation_zone_ok: boolean | null;
  /** ELVOID PRO ORACLE integration (Phase 5) — optional/nullable so every pre-existing signal row and every place that reads AiSignal keeps compiling unchanged. Absent/undefined means "normal AI Signal", exactly like before this field existed. */
  source?: "AI_SIGNAL" | "ELVOID_PRO_ORACLE";
  premium?: boolean;
  oracle_grade?: "B+" | "A" | "A+" | null;
  created_at: string;
}

export interface AiJournalEntry {
  id: string;
  signal_id: string | null;
  result: TradeResult;
  profit_percent: number;
  rr: number;
  duration_minutes: number | null;
  notes: string | null;
  screenshot_url: string | null;
  closed_at: string;
}

export interface AiStatistics {
  total_trade: number;
  wins: number;
  losses: number;
  win_rate: number;
  average_rr: number;
  profit_factor: number;
  max_drawdown: number;
  total_profit: number;
  updated_at: string;
}

export interface PaperWallet {
  balance: number;
  equity: number;
  total_profit: number;
  risk_per_trade: number;
  /** When true, /api/ai-signals/scan auto-opens a Market Order for every freshly-generated signal meeting auto_execute_min_grade. Off by default — this is an opt-in feature. */
  auto_execute: boolean;
  auto_execute_min_grade: TradeGrade;
  updated_at: string;
}

/** A closed trade with its originating signal joined in, for journal/table display. */
export interface JournalWithSignal extends AiJournalEntry {
  // `side`/`entry` widened to nullable (vs. AiSignal's non-null originals) so
  // Phase 5 presentation-layer masking can null them out for premium/Oracle
  // trades without a type lie — see lib/ai/oracle/presentation.ts. Real,
  // non-premium reads always populate them exactly as before.
  signal:
    | (Pick<AiSignal, "coin" | "strategy" | "confidence" | "reason" | "timeframe" | "scans" | "extra_reasoning" | "premium"> & {
        side: SignalSide | null;
        entry: number | null;
      })
    | null;
}

/** One scanner's read — the building block every ElVoid AI signal is assembled from. */
export interface ScanResult {
  key: string; // e.g. "support_resistance"
  label: string; // e.g. "Support & Resistance"
  bias: "bullish" | "bearish" | "neutral";
  weight: number; // points contributed toward the winning side; 0 when neutral
  detail: string; // human-readable, Bahasa Indonesia
}

export interface Candle {
  time: number; // ms epoch, candle open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
