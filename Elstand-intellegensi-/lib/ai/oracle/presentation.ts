// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — presentation-layer field hiding (Phase 5, spec §3/§17)
//
// IMPORTANT: this module only STRIPS FIELDS FROM THE OBJECT RETURNED TO THE
// CALLER. It never deletes or mutates anything in the database — the
// original AiSignal row (with entry/sl/tp/side intact) stays exactly as-is
// in Supabase and keeps flowing through evaluateOpenTrades /
// evaluatePendingOrders / recomputeStatistics unmodified, because this
// module is applied ONLY at the two read paths that build a JSON/props
// payload for the browser (see maskedSurfaces below), never inside
// paperTrader.ts's own internal logic.
//
// Known coverage gap (documented per spec §17's explicit instruction to
// document rather than silently claim full coverage): this phase sanitizes
// app/api/ai-signals/route.ts and app/ai-performance/page.tsx only — the
// two primary places entry/sl/tp/side are read for display today. It does
// NOT yet audit app/portfolio/page.tsx, app/api/alerts/route.ts,
// app/api/watchlist/route.ts, lib/dashboardSnapshot.ts, or
// components/ai-journal/JournalView.tsx. If a premium trade's row reaches
// any of those paths, its execution parameters are not yet hidden there.
// ---------------------------------------------------------------------------

import type { AiSignal, JournalWithSignal } from "../../elvoid/types";
import { computeUnrealized } from "../../elvoid/math";
import { get24hTicker } from "../../binance";

/** Crown badge shown wherever a premium/Oracle-origin trade is rendered. */
export const PREMIUM_BADGE = "👑 PRO";

export type PublicAiSignal = Omit<AiSignal, "side" | "entry" | "sl" | "tp1" | "tp2" | "tp3"> & {
  side: AiSignal["side"] | null;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  /**
   * Derived P&L, computed server-side (see attachUnrealizedPnl below) while
   * the real entry/sl were still available, BEFORE masking. These two
   * numbers alone don't reveal entry/SL/TP/direction — they're the "Result"
   * spec §5 explicitly allows to stay visible for premium trades — so they
   * survive masking untouched. Present only for open/tp1_hit signals where
   * a live price was successfully fetched.
   */
  unrealizedPercent?: number;
  unrealizedRr?: number;
};

/**
 * Computes and attaches unrealizedPercent/unrealizedRr to every open/
 * tp1_hit PREMIUM signal in `signals`, using each signal's real (still
 * unmasked at this point) entry/sl and one live price fetch per distinct
 * coin. Non-premium signals pass through untouched — the client already
 * computes their unrealized P&L itself from the (unmasked, non-premium)
 * entry/sl it receives, same as before this function existed.
 *
 * Call this BEFORE maskPremiumSignal/maskPremiumSignals, on the real
 * AiSignal[] straight from the DB — it reads `signal.entry`/`signal.sl`
 * which won't exist anymore once masked.
 */
export async function attachUnrealizedPnl(signals: AiSignal[], riskPerTrade = 1): Promise<(AiSignal & { unrealizedPercent?: number; unrealizedRr?: number })[]> {
  const premiumOpen = signals.filter((s) => s.premium && (s.status === "open" || s.status === "tp1_hit"));
  if (premiumOpen.length === 0) return signals;

  const coins = Array.from(new Set(premiumOpen.map((s) => s.coin)));
  const priceByCoin = new Map<string, number>();
  await Promise.all(
    coins.map(async (coin) => {
      try {
        const ticker = await get24hTicker(coin);
        priceByCoin.set(coin, ticker.lastPrice);
      } catch {
        // Live price unavailable for this coin — that signal just won't get
        // an unrealizedPercent/unrealizedRr attached; the UI already falls
        // back to a neutral placeholder rather than showing a wrong number.
      }
    })
  );

  return signals.map((s) => {
    if (!s.premium || (s.status !== "open" && s.status !== "tp1_hit")) return s;
    const livePrice = priceByCoin.get(s.coin);
    if (livePrice === undefined) return s;
    const effectiveSl = s.status === "tp1_hit" ? s.entry : s.sl;
    const { unrealizedPercent, unrealizedRr } = computeUnrealized({ side: s.side, entry: s.entry, sl: effectiveSl }, livePrice, riskPerTrade);
    return { ...s, unrealizedPercent, unrealizedRr };
  });
}

/**
 * Masks entry/SL/TP/side on a premium signal for normal-UI presentation.
 * Non-premium signals pass through completely unchanged (same object
 * shape, all fields populated) — this function is a no-op for the entire
 * pre-existing normal AI Signal flow.
 */
export function maskPremiumSignal(signal: AiSignal): PublicAiSignal {
  if (!signal.premium) return signal as PublicAiSignal;
  return { ...signal, side: null, entry: null, sl: null, tp1: null, tp2: null, tp3: null };
}

export function maskPremiumSignals(signals: AiSignal[]): PublicAiSignal[] {
  return signals.map(maskPremiumSignal);
}

/**
 * Masks entry/side on a journal entry's joined signal when that signal is
 * premium. The join (lib/elvoid/performance.ts's getJournalEntries /
 * getJournalEntryById) now selects `premium` directly, so this needs no
 * side-channel lookup — it works for closed premium trades too, not just
 * ones currently in the open/pending list.
 */
export function maskPremiumJournalEntry(entry: JournalWithSignal): JournalWithSignal {
  if (!entry.signal || !entry.signal.premium) return entry;
  return { ...entry, signal: { ...entry.signal, side: null, entry: null } };
}

export function maskPremiumJournalEntries(entries: JournalWithSignal[]): JournalWithSignal[] {
  return entries.map(maskPremiumJournalEntry);
}
