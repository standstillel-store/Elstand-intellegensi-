// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Regime-Aware Interpretation (Phase 7.3B)
//
// Completes the "Regime-Aware Interpretation" item from the original 7.3
// roadmap label. Phase 7.3A (already shipped, see CHANGES.md) was the
// ELVOID PRO UI hierarchy correction — a different, unrelated piece of
// work that happened to share the "7.3" number. This file is the part that
// was actually missing: a real, deterministic market-regime classifier.
//
// Reuses existing primitives ONLY:
//   - lib/elvoid/indicators.ts detectTrend()  (EMA alignment + swing
//     structure — the exact same function mtf.ts's deriveTimeframeSlice()
//     already calls for every timeframe slice)
//   - lib/elvoid/indicators.ts calcAdx()      (Wilder's ADX/+DI/-DI)
//   - The ADX>=20 "real trend vs chop" threshold already established in
//     lib/elvoid/scanners.ts's adxFactor() (ADX < 20 -> "tren masih
//     lemah/choppy, tidak dihitung sebagai konfirmasi arah") and the
//     weak/developing/strong bands already defined in calcAdx() itself
//     (adx.trendStrength). No new threshold is invented here.
//
// This module does NOT:
//   - fetch any data (candles are passed in — the anchor candles already
//     sitting in OracleContext, and the MtfContext already built by
///    Phase 7.2's buildMtfContext())
//   - run a second trend/ADX calculation
//   - import lib/ai/insights/regime.ts (a separate, unrelated subsystem)
//   - feed into computeConfluence() / gradeConfluence() / risk / Execute
//     Signal. Regime is CONTEXT ONLY in this phase — see route wiring.
// ---------------------------------------------------------------------------

import { detectTrend, calcAdx } from "@/lib/elvoid/indicators";
import type { Candle } from "@/lib/elvoid/types";
import type { MtfContext } from "./mtf";
import type { OracleDataQuality } from "./types";

export type RegimeType = "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "VOLATILE_UNCLEAR";

export type MtfAlignment = "ALIGNED" | "MIXED" | "UNAVAILABLE";

export interface RegimeContext {
  type: RegimeType;
  /** 0-100. For TRENDING_* this is the raw ADX reading (already 0-100 scale). For RANGING/VOLATILE_UNCLEAR this is 0 — there is no "strength of chop" to report. */
  strength: number;
  quality: OracleDataQuality;
  evidence: string;
  timeframe: string;
  mtfAlignment: MtfAlignment;
}

/** Minimum candle count calcAdx(14) needs to produce a real reading (period*2+1). Below this, regime is honestly reported as unavailable rather than guessed. */
const MIN_CANDLES_FOR_ADX = 29;

/**
 * Classification rules (deterministic, bounded — no invented thresholds):
 *
 * 1. ADX cannot be computed (insufficient candles)
 *      -> VOLATILE_UNCLEAR, quality "unavailable"
 *
 * 2. ADX < 20 ("weak", per calcAdx()'s own trendStrength band and the same
 *    cutoff adxFactor() in scanners.ts already uses to refuse a directional
 *    vote)
 *      -> RANGING, regardless of what EMA/swing structure alone suggests.
 *      This is what stops a low-ADX chop with a mildly sloped EMA from
 *      being falsely reported as a strong trend (spec test case 4).
 *
 * 3. ADX >= 20 AND detectTrend()'s direction agrees with which of
 *    +DI/-DI is dominant
 *      -> TRENDING_UP (uptrend + +DI > -DI) or TRENDING_DOWN (downtrend +
 *      -DI > +DI), strength = the raw ADX value.
 *
 * 4. ADX >= 20 but detectTrend() and the dominant DI disagree (including
 *    detectTrend() itself reading "sideways" while ADX indicates a real
 *    trend is present) -> VOLATILE_UNCLEAR. Two real, independently-
 *    computed reads disagreeing is treated as genuine ambiguity, not
 *    resolved in either direction here.
 */
export function classifyMarketRegime(candles: Candle[], timeframe: string, mtf?: MtfContext | null): RegimeContext {
  const adx = calcAdx(candles, 14);

  if (!adx || candles.length < MIN_CANDLES_FOR_ADX) {
    return {
      type: "VOLATILE_UNCLEAR",
      strength: 0,
      quality: "unavailable",
      evidence: `ADX(14) belum bisa dihitung — candle historis ${timeframe} tidak cukup (${candles.length}/${MIN_CANDLES_FOR_ADX}).`,
      timeframe,
      mtfAlignment: "UNAVAILABLE",
    };
  }

  const trend = detectTrend(candles);

  let regime: Omit<RegimeContext, "mtfAlignment">;

  if (adx.adx < 20) {
    regime = {
      type: "RANGING",
      strength: 0,
      quality: "real",
      evidence: `ADX ${adx.adx.toFixed(1)} — tren lemah/choppy (ambang <20, sama seperti ADX scanner), diklasifikasikan sebagai ranging terlepas dari kemiringan EMA/struktur (${trend.detail})`,
      timeframe,
    };
  } else {
    const diBullish = adx.plusDI > adx.minusDI;
    const diBearish = adx.minusDI > adx.plusDI;

    if (trend.direction === "uptrend" && diBullish) {
      regime = {
        type: "TRENDING_UP",
        strength: adx.adx,
        quality: "real",
        evidence: `ADX ${adx.adx.toFixed(1)} (${adx.trendStrength}), +DI ${adx.plusDI.toFixed(1)} > -DI ${adx.minusDI.toFixed(1)}, struktur/EMA searah: ${trend.detail}`,
        timeframe,
      };
    } else if (trend.direction === "downtrend" && diBearish) {
      regime = {
        type: "TRENDING_DOWN",
        strength: adx.adx,
        quality: "real",
        evidence: `ADX ${adx.adx.toFixed(1)} (${adx.trendStrength}), -DI ${adx.minusDI.toFixed(1)} > +DI ${adx.plusDI.toFixed(1)}, struktur/EMA searah: ${trend.detail}`,
        timeframe,
      };
    } else {
      regime = {
        type: "VOLATILE_UNCLEAR",
        strength: adx.adx,
        quality: "real",
        evidence: `ADX ${adx.adx.toFixed(1)} menunjukkan tren nyata tapi arah tidak konsisten dengan struktur/EMA (trend: ${trend.direction}, +DI ${adx.plusDI.toFixed(1)} vs -DI ${adx.minusDI.toFixed(1)}) — dua pembacaan independen tidak sepakat, tidak dipaksakan ke salah satu arah.`,
        timeframe,
      };
    }
  }

  return { ...regime, mtfAlignment: computeMtfAlignment(regime.type, mtf) };
}

/**
 * Exposed so other Oracle context modules (e.g. scenario.ts, Phase 7.5) can
 * check MTF alignment for a specific LONG/SHORT side — such as the
 * ALTERNATIVE scenario's direction, which isn't necessarily the regime's
 * own TRENDING_* direction — without re-deriving this comparison.
 */
export function mtfAlignmentForSide(desired: "LONG" | "SHORT", mtf?: MtfContext | null): MtfAlignment {
  if (!mtf) return "UNAVAILABLE";
  const sides = [mtf.htf, mtf.ltf].filter((s): s is NonNullable<typeof s> => !!s && s.available && s.bias !== "NEUTRAL");
  if (sides.length === 0) return "UNAVAILABLE";
  const anyDisagrees = sides.some((s) => s.bias !== desired);
  return anyDisagrees ? "MIXED" : "ALIGNED";
}

/**
 * Descriptive-only alignment between the anchor regime and Phase 7.2's
 * already-built MtfContext. Never a decision, never a second fetch — reuses
 * mtf.htf/mtf.ltf exactly as buildMtfContext() produced them.
 *
 * RANGING/VOLATILE_UNCLEAR have no directional thesis to check alignment
 * against, so they always report UNAVAILABLE here (there's nothing honest
 * to compare).
 */
function computeMtfAlignment(type: RegimeType, mtf?: MtfContext | null): MtfAlignment {
  if (type !== "TRENDING_UP" && type !== "TRENDING_DOWN") return "UNAVAILABLE";
  const desired: "LONG" | "SHORT" = type === "TRENDING_UP" ? "LONG" : "SHORT";
  return mtfAlignmentForSide(desired, mtf);
}
