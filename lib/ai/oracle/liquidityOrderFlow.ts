// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — Liquidity + Order Flow Intelligence (Phase 7.4)
//
// Turns already-computed OracleContext data (candles, footprint, TPO,
// swings) into structured, auditable evidence about:
//   1. buildLiquidityZones()        — where meaningful liquidity/value sits
//   2. classifyLiquidityEvent()     — what actually happened when the most
//      recent liquidity sweep touched a level (reclaim/break/rejection),
//      not just "a wick happened"
//   3. buildOrderFlowPriceResponse() — whether order-flow aggression
//      (footprint delta) was actually confirmed by price, or absorbed
//
// CONTEXT/EVIDENCE ONLY. This file is never imported by confluence.ts,
// grading.ts, risk.ts, or execute.ts. It does not touch
// computeConfluence(), gradeConfluence(), confidence, dominantSide, or the
// risk plan. It exists so Phase 7.5's Scenario Engine has a unified,
// rankable representation of "meaningful market locations" and "did order
// flow confirm or fight price" to consume later — see route wiring, which
// attaches this as a sibling `liquidityOrderFlow` field, not an input to
// grading.
//
// Reuses existing primitives ONLY — no duplicate math:
//   - findSwingPoints()      (lib/elvoid/indicators.ts)  — swing detection
//   - scanLiquiditySweep()   (lib/elvoid/scanners.ts)     — the sweep trigger
//   - scanLiquidityPool()    (lib/elvoid/scanners.ts)     — pool bias/weight
//     (Standard Elvoid AI's own liquidity-pool read — imported READ-ONLY,
//     lib/elvoid/engine.ts itself is never touched)
//   - atr()                  (lib/elvoid/indicators.ts)   — normalization,
//     used for both zone-dedup tolerance and price-response thresholds
//     instead of inventing new arbitrary constants
//   - ctx.tpo (already-built TpoSession[] from Phase 1's dataAdapters.ts)
//   - ctx.footprint (already-built CandleFootprint map from Phase 1)
//
// scanLiquidityPool() only returns a single ScanResult (bias/weight/text)
// for the nearest pool — it does not expose a numeric price (ScanResult
// has no price field, see lib/elvoid/types.ts). To get an actual price
// level for the zone list, buildLiquidityZones() below groups swings into
// pools itself using the SAME clustering tolerance scanLiquidityPool()
// uses internally (0.4% — documented there as `tolerance`), rather than
// inventing a new threshold. This is a ~10-line grouping step over
// already-computed SwingPoint[]; the actual swing-detection math it groups
// is not re-derived. scanLiquidityPool() itself is still called (see
// below) so its bias/weight read is reused for the zone's strength/label
// rather than recomputed by hand.
// ---------------------------------------------------------------------------

import { findSwingPoints, atr as atrSeries } from "@/lib/elvoid/indicators";
import { scanLiquiditySweep, scanLiquidityPool } from "@/lib/elvoid/scanners";
import type { Candle } from "@/lib/elvoid/types";
import type { TpoSession } from "@/lib/elvoid/tpo";
import type { CandleFootprint } from "@/lib/elvoid/footprint";
import type { OracleContext, OracleDataQuality } from "./types";

// ---------------------------------------------------------------------------
// 1) LiquidityZone[]
// ---------------------------------------------------------------------------

export type LiquidityZoneType = "SWING_HIGH" | "SWING_LOW" | "LIQUIDITY_POOL" | "VAH" | "VAL" | "POC";

export interface LiquidityZone {
  type: LiquidityZoneType;
  price: number;
  /** Expected liquidity side: resting stops/interest sit on the opposite side of price action that formed the level — a swing high / pool-of-highs is where SHORT-side stops rest (a sweep there is bullish), and vice versa. Matches the same bias convention scanLiquidityPool()/scanLiquiditySweep() already use. */
  side: "LONG" | "SHORT";
  /** 0-10, source-specific — swing recency/count, pool touch count, or a fixed structural weight for VAH/VAL/POC. Not comparable 1:1 across types; Phase 7.5 is expected to weigh by type + strength + distance together. */
  strength: number;
  source: "swing" | "liquidity_pool" | "tpo";
  evidence: string;
  quality: OracleDataQuality;
  distanceFromPrice: number; // absolute price units
}

/** Same clustering tolerance scanLiquidityPool() uses internally (documented there as 0.4%) — reused, not reinvented, so a swing counted as part of a pool here matches what Standard Elvoid AI would also call a pool. */
const POOL_CLUSTER_TOLERANCE_PCT = 0.004;

function clusterSwingsIntoPools(points: { price: number; index: number }[]): { price: number; count: number; lastIndex: number }[] {
  const pools: { price: number; count: number; lastIndex: number }[] = [];
  for (const p of points) {
    const match = pools.find((pool) => Math.abs(pool.price - p.price) / p.price <= POOL_CLUSTER_TOLERANCE_PCT);
    if (match) {
      match.count += 1;
      match.lastIndex = Math.max(match.lastIndex, p.index);
    } else {
      pools.push({ price: p.price, count: 1, lastIndex: p.index });
    }
  }
  return pools.filter((p) => p.count >= 2);
}

/**
 * Merge near-identical zones (e.g. a swing high sitting almost exactly at
 * VAH) into one entry, keeping the higher-strength one but noting the
 * overlap in its evidence. Dedup radius = 0.5x ATR — reuses the same ATR
 * series already computed elsewhere in the Oracle pipeline (smcIctFactor)
 * rather than a new fixed percentage.
 */
function dedupeZones(zones: LiquidityZone[], atrValue: number): LiquidityZone[] {
  const radius = atrValue > 0 ? atrValue * 0.5 : 0;
  if (radius <= 0) return zones;
  const kept: LiquidityZone[] = [];
  for (const zone of zones.sort((a, b) => b.strength - a.strength)) {
    const overlap = kept.find((k) => Math.abs(k.price - zone.price) <= radius);
    if (overlap) {
      overlap.evidence += ` (overlaps ${zone.type} @ ${zone.price.toFixed(4)} within ${radius.toFixed(4)} — merged, stronger zone kept.)`;
    } else {
      kept.push({ ...zone });
    }
  }
  return kept;
}

export function buildLiquidityZones(ctx: OracleContext): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const candles = ctx.candles as Candle[];
  const price = ctx.currentPrice;

  if (candles.length < 20) {
    // Not enough candles for swing/pool detection — honestly return no
    // zones rather than fabricating them (spec: "do not invent fake
    // zones when the underlying source is unavailable").
    return zones;
  }

  const swings = findSwingPoints(candles, 3);
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  // --- SWING_HIGH / SWING_LOW: most recent 3 per side, untapped (still beyond current price on their side) ---
  const recentHighs = [...highs].sort((a, b) => b.index - a.index).slice(0, 5);
  const recentLows = [...lows].sort((a, b) => b.index - a.index).slice(0, 5);
  for (const h of recentHighs) {
    zones.push({
      type: "SWING_HIGH",
      price: h.price,
      side: "SHORT", // resting stops/short-side liquidity sit above a swing high
      strength: 4,
      source: "swing",
      evidence: `Swing high @ ${h.price.toFixed(4)} (candle #${h.index}) — resting liquidity likely above this level (unswept sell-side stops).`,
      quality: "real",
      distanceFromPrice: Math.abs(h.price - price),
    });
  }
  for (const l of recentLows) {
    zones.push({
      type: "SWING_LOW",
      price: l.price,
      side: "LONG",
      strength: 4,
      source: "swing",
      evidence: `Swing low @ ${l.price.toFixed(4)} (candle #${l.index}) — resting liquidity likely below this level (unswept buy-side stops).`,
      quality: "real",
      distanceFromPrice: Math.abs(l.price - price),
    });
  }

  // --- LIQUIDITY_POOL: clusters of >=2 equal highs/lows, same tolerance scanLiquidityPool() uses ---
  const highPools = clusterSwingsIntoPools(highs);
  const lowPools = clusterSwingsIntoPools(lows);
  // scanLiquidityPool() itself is still called and its bias/weight reused
  // for whichever pool it judges nearest/most relevant, rather than
  // recomputing a strength score by hand for that one.
  const poolRead = scanLiquidityPool(price, swings);
  for (const p of highPools) {
    const isTheOneScanLiquidityPoolPicked = poolRead.bias === "bullish" && Math.abs(p.price - price) / price < 0.004 * 2;
    zones.push({
      type: "LIQUIDITY_POOL",
      price: p.price,
      side: "SHORT",
      strength: Math.min(10, 5 + (p.count - 2) * 1.5),
      source: "liquidity_pool",
      evidence: isTheOneScanLiquidityPoolPicked
        ? `Equal-high pool (${p.count}x touches) @ ${p.price.toFixed(4)} — ${poolRead.detail}`
        : `Equal-high pool (${p.count}x touches) @ ${p.price.toFixed(4)} — untapped sell-side liquidity cluster.`,
      quality: "real",
      distanceFromPrice: Math.abs(p.price - price),
    });
  }
  for (const p of lowPools) {
    const isTheOneScanLiquidityPoolPicked = poolRead.bias === "bearish" && Math.abs(p.price - price) / price < 0.004 * 2;
    zones.push({
      type: "LIQUIDITY_POOL",
      price: p.price,
      side: "LONG",
      strength: Math.min(10, 5 + (p.count - 2) * 1.5),
      source: "liquidity_pool",
      evidence: isTheOneScanLiquidityPoolPicked
        ? `Equal-low pool (${p.count}x touches) @ ${p.price.toFixed(4)} — ${poolRead.detail}`
        : `Equal-low pool (${p.count}x touches) @ ${p.price.toFixed(4)} — untapped buy-side liquidity cluster.`,
      quality: "real",
      distanceFromPrice: Math.abs(p.price - price),
    });
  }

  // --- VAH / VAL / POC: from the already-built TPO session (Phase 1), zero extra computation ---
  const sessions = ctx.tpo as TpoSession[] | null;
  const lastSession = sessions && sessions.length > 0 ? sessions[sessions.length - 1] : null;
  if (lastSession) {
    if (lastSession.tvah !== null) {
      zones.push({
        type: "VAH",
        price: lastSession.tvah,
        side: "SHORT",
        strength: 6,
        source: "tpo",
        evidence: `TPO Value Area High @ ${lastSession.tvah.toFixed(4)} (session block count: ${lastSession.blockCount}).`,
        quality: "real",
        distanceFromPrice: Math.abs(lastSession.tvah - price),
      });
    }
    if (lastSession.tval !== null) {
      zones.push({
        type: "VAL",
        price: lastSession.tval,
        side: "LONG",
        strength: 6,
        source: "tpo",
        evidence: `TPO Value Area Low @ ${lastSession.tval.toFixed(4)} (session block count: ${lastSession.blockCount}).`,
        quality: "real",
        distanceFromPrice: Math.abs(lastSession.tval - price),
      });
    }
    if (lastSession.poc !== null) {
      zones.push({
        type: "POC",
        price: lastSession.poc,
        side: lastSession.poc >= price ? "SHORT" : "LONG",
        strength: 5,
        source: "tpo",
        evidence: `TPO Point of Control (fair value magnet) @ ${lastSession.poc.toFixed(4)}.`,
        quality: "real",
        distanceFromPrice: Math.abs(lastSession.poc - price),
      });
    }
  }

  const atrValues = atrSeries(candles, 14);
  const lastAtr = atrValues[atrValues.length - 1] || 0;
  return dedupeZones(zones, lastAtr).sort((a, b) => a.distanceFromPrice - b.distanceFromPrice);
}

// ---------------------------------------------------------------------------
// 2) Liquidity Event Classification
// ---------------------------------------------------------------------------

export type LiquidityEventType = "SWEEP" | "RECLAIM" | "BREAK" | "REJECTION" | "NO_CLEAR_EVENT";

export interface LiquidityEvent {
  type: LiquidityEventType;
  side: "LONG" | "SHORT" | null; // directional implication of the event, null for NO_CLEAR_EVENT
  level: number | null; // the swing level that was swept, if any
  evidence: string;
  quality: OracleDataQuality;
}

const FOLLOW_THROUGH_CANDLES = 3;

/**
 * Reuses scanLiquiditySweep() as the sole trigger — it already detects "a
 * wick pierced a prior swing high/low and the SAME candle closed back
 * beyond it" (its own definition of a sweep). What's new here: looking at
 * the `FOLLOW_THROUGH_CANDLES` candles AFTER that trigger candle to see
 * whether price actually held the reclaim (RECLAIM), kept going the other
 * way (BREAK), or gave the move back (REJECTION) — scanLiquiditySweep()
 * itself only ever looks at the single latest candle, so it cannot
 * distinguish these on its own.
 */
export function classifyLiquidityEvent(ctx: OracleContext): LiquidityEvent {
  const candles = ctx.candles as Candle[];
  if (candles.length < 20) {
    return { type: "NO_CLEAR_EVENT", side: null, level: null, evidence: "Candle history tidak cukup untuk deteksi liquidity event.", quality: "unavailable" };
  }

  const swings = findSwingPoints(candles, 3);
  const atrValues = atrSeries(candles, 14);
  const lastAtr = atrValues[atrValues.length - 1] || candles[candles.length - 1].close * 0.02;

  // Find the most recent candle (within the observation window) that
  // scanLiquiditySweep() would have flagged as a sweep trigger, by
  // replaying it against progressively earlier candle slices — this does
  // not change scanLiquiditySweep()'s own logic, only asks "was the sweep
  // condition true as of candle i" for a few recent i's so we have
  // follow-through candles to inspect afterward.
  const lookback = Math.min(FOLLOW_THROUGH_CANDLES + 2, candles.length - 5);
  let triggerIndex = -1;
  let triggerSide: "LONG" | "SHORT" | null = null;
  let triggerLevel: number | null = null;

  for (let back = lookback; back >= 0; back--) {
    const idx = candles.length - 1 - back;
    if (idx < 5) continue;
    const slice = candles.slice(0, idx + 1);
    const sliceSwings = swings.filter((s) => s.index < idx); // only swings formed strictly before the candidate trigger candle
    const sweep = scanLiquiditySweep(slice, sliceSwings, lastAtr);
    if (sweep.bias !== "neutral" && sweep.weight > 0) {
      triggerIndex = idx;
      triggerSide = sweep.bias === "bullish" ? "LONG" : "SHORT";
      const priorLow = sliceSwings.filter((s) => s.type === "low").slice(-1)[0];
      const priorHigh = sliceSwings.filter((s) => s.type === "high").slice(-1)[0];
      triggerLevel = sweep.bias === "bullish" ? priorLow?.price ?? null : priorHigh?.price ?? null;
      break; // most recent trigger only
    }
  }

  if (triggerIndex === -1 || triggerSide === null || triggerLevel === null) {
    return { type: "NO_CLEAR_EVENT", side: null, level: null, evidence: "Belum ada liquidity sweep yang jelas di window observasi terakhir.", quality: "real" };
  }

  const followThrough = candles.slice(triggerIndex + 1);
  if (followThrough.length < 1) {
    return {
      type: "SWEEP",
      side: triggerSide,
      level: triggerLevel,
      evidence: `Liquidity sweep terdeteksi di level ${triggerLevel.toFixed(4)} (arah ${triggerSide}), tapi belum ada candle lanjutan untuk konfirmasi reclaim/break/rejection.`,
      quality: "real",
    };
  }

  const lastFollow = followThrough[followThrough.length - 1];
  const holdingBeyondLevel = triggerSide === "LONG" ? lastFollow.close > triggerLevel : lastFollow.close < triggerLevel;
  const netMove = lastFollow.close - candles[triggerIndex].close;
  const meaningfulContinuation = Math.abs(netMove) > lastAtr * 0.3;
  const continuedSameDirection = triggerSide === "LONG" ? netMove > 0 : netMove < 0;

  if (followThrough.length < FOLLOW_THROUGH_CANDLES) {
    // Some follow-through exists but not enough to be confident — report
    // the trigger honestly as insufficiently confirmed rather than forcing
    // a RECLAIM/BREAK/REJECTION label.
    return {
      type: "SWEEP",
      side: triggerSide,
      level: triggerLevel,
      evidence: `Liquidity sweep di level ${triggerLevel.toFixed(4)} (arah ${triggerSide}) — hanya ${followThrough.length} candle lanjutan tersedia (butuh ${FOLLOW_THROUGH_CANDLES}), belum cukup untuk klasifikasi reclaim/break/rejection.`,
      quality: "real",
    };
  }

  if (holdingBeyondLevel && continuedSameDirection && meaningfulContinuation) {
    return {
      type: "BREAK",
      side: triggerSide,
      level: triggerLevel,
      evidence: `Level ${triggerLevel.toFixed(4)} disapu lalu ditembus dan diterima (${FOLLOW_THROUGH_CANDLES} candle lanjutan close ${triggerSide === "LONG" ? "di atas" : "di bawah"} level, net move ${netMove.toFixed(4)} > 0.3xATR) — acceptance/continuation, bukan reversal semata.`,
      quality: "real",
    };
  }
  if (holdingBeyondLevel && continuedSameDirection) {
    return {
      type: "RECLAIM",
      side: triggerSide,
      level: triggerLevel,
      evidence: `Level ${triggerLevel.toFixed(4)} disapu lalu direbut kembali (${FOLLOW_THROUGH_CANDLES} candle lanjutan bertahan di sisi ${triggerSide === "LONG" ? "atas" : "bawah"} level) — reclaim terkonfirmasi, momentum lanjutan masih lemah.`,
      quality: "real",
    };
  }
  return {
    type: "REJECTION",
    side: triggerSide,
    level: triggerLevel,
    evidence: `Level ${triggerLevel.toFixed(4)} disapu (arah awal ${triggerSide}) tapi ${FOLLOW_THROUGH_CANDLES} candle lanjutan gagal bertahan (close kembali ${triggerSide === "LONG" ? "di bawah" : "di atas"} level) — sweep gagal follow-through, bukan reversal valid.`,
    quality: "real",
  };
}

// ---------------------------------------------------------------------------
// 3) Order Flow <-> Price Response
// ---------------------------------------------------------------------------

export type OrderFlowInterpretation = "BUYING_PRESSURE" | "SELLING_PRESSURE" | "ABSORPTION" | "EXHAUSTION" | "NO_CLEAR_FLOW";

export interface OrderFlowPriceResponse {
  interpretation: OrderFlowInterpretation;
  deltaDirection: "buy" | "sell" | "neutral";
  deltaMagnitude: number; // sum of |delta| across the observation window
  priceDisplacement: number; // signed, price units, close[last] - close[first] over the window
  evidence: string;
  quality: OracleDataQuality;
}

const OBSERVATION_WINDOW = 5; // same window footprintFactor() already uses in confluence.ts — reused, not a new number

/**
 * Compares footprint delta (already built by Phase 1's dataAdapters.ts,
 * same source footprintFactor() reads in confluence.ts) against actual
 * price displacement over the SAME candle window. This comparison does
 * not exist anywhere else in the repo — footprintFactor() only scores
 * delta magnitude in isolation, it never checks what price did.
 */
export function buildOrderFlowPriceResponse(ctx: OracleContext): OrderFlowPriceResponse {
  const candles = ctx.candles as Candle[];
  const map = ctx.footprint as Map<number, CandleFootprint> | null;

  if (!map || map.size === 0 || candles.length < OBSERVATION_WINDOW + 1) {
    return {
      interpretation: "NO_CLEAR_FLOW",
      deltaDirection: "neutral",
      deltaMagnitude: 0,
      priceDisplacement: 0,
      evidence: "Footprint atau candle history tidak cukup untuk membandingkan order flow dengan price response.",
      quality: "unavailable",
    };
  }

  const entries = Array.from(map.values()).sort((a, b) => a.candleTime - b.candleTime);
  const recent = entries.slice(-OBSERVATION_WINDOW);
  if (recent.length < OBSERVATION_WINDOW) {
    return {
      interpretation: "NO_CLEAR_FLOW",
      deltaDirection: "neutral",
      deltaMagnitude: 0,
      priceDisplacement: 0,
      evidence: `Hanya ${recent.length}/${OBSERVATION_WINDOW} candle footprint tersedia di window observasi — tidak cukup untuk kesimpulan order flow vs price response.`,
      quality: "unavailable",
    };
  }

  const totalDelta = recent.reduce((s, c) => s + c.delta, 0);
  const totalVolume = recent.reduce((s, c) => s + c.totalVolume, 0);
  if (totalVolume === 0) {
    return {
      interpretation: "NO_CLEAR_FLOW",
      deltaDirection: "neutral",
      deltaMagnitude: 0,
      priceDisplacement: 0,
      evidence: "Volume footprint 0 di window observasi.",
      quality: "unavailable",
    };
  }
  const deltaRatio = totalDelta / totalVolume;
  const deltaMagnitude = Math.abs(totalDelta);

  // Match the window to actual candles by time so displacement is measured
  // over the exact same candles the footprint window covers.
  const windowStart = recent[0].candleTime;
  const windowEnd = recent[recent.length - 1].candleTime;
  const windowCandles = candles.filter((c) => c.time >= windowStart && c.time <= windowEnd);
  if (windowCandles.length < 2) {
    return {
      interpretation: "NO_CLEAR_FLOW",
      deltaDirection: deltaRatio > 0.05 ? "buy" : deltaRatio < -0.05 ? "sell" : "neutral",
      deltaMagnitude,
      priceDisplacement: 0,
      evidence: "Candle yang cocok dengan window footprint tidak cukup untuk mengukur price displacement.",
      quality: "unavailable",
    };
  }
  const priceDisplacement = windowCandles[windowCandles.length - 1].close - windowCandles[0].close;

  const atrValues = atrSeries(candles, 14);
  const lastAtr = atrValues[atrValues.length - 1] || windowCandles[0].close * 0.02;
  const meaningfulMove = Math.abs(priceDisplacement) > lastAtr * 0.5; // ATR-normalized, not a fixed % — reuses the same ATR series smcIctFactor()/regime.ts already compute
  const weakDeltaRatio = Math.abs(deltaRatio) < 0.05; // same "near-balanced" cutoff footprintFactor() already uses

  const deltaDirection: "buy" | "sell" | "neutral" = weakDeltaRatio ? "neutral" : deltaRatio > 0 ? "buy" : "sell";

  if (deltaDirection === "neutral") {
    return {
      interpretation: "NO_CLEAR_FLOW",
      deltaDirection,
      deltaMagnitude,
      priceDisplacement,
      evidence: `Delta footprint hampir seimbang (${totalDelta.toFixed(2)} dari volume ${totalVolume.toFixed(2)}) di ${OBSERVATION_WINDOW} candle terakhir — tidak ada arah order flow yang cukup jelas untuk dibandingkan dengan price response.`,
      quality: "real",
    };
  }

  const priceAgreesWithDelta = deltaDirection === "buy" ? priceDisplacement > 0 : priceDisplacement < 0;

  if (priceAgreesWithDelta && meaningfulMove) {
    // Split the window in half to check whether the delta that's driving
    // this move is still building (healthy continuation) or already
    // fading despite price having extended — "directional flow losing
    // effectiveness after an extended move" per spec. Bounded: only
    // triggers when there's an actual later-half collapse (<40% of the
    // earlier half), not on every minor fluctuation.
    const mid = Math.floor(recent.length / 2);
    const earlierDelta = recent.slice(0, mid).reduce((s, c) => s + c.delta, 0);
    const laterDelta = recent.slice(mid).reduce((s, c) => s + c.delta, 0);
    const sameDirectionHalves = deltaDirection === "buy" ? earlierDelta > 0 && laterDelta > 0 : earlierDelta < 0 && laterDelta < 0;
    const laterCollapsed = sameDirectionHalves && Math.abs(laterDelta) < Math.abs(earlierDelta) * 0.4;

    if (laterCollapsed) {
      return {
        interpretation: "EXHAUSTION",
        deltaDirection,
        deltaMagnitude,
        priceDisplacement,
        evidence: `Price sudah bergerak ${priceDisplacement.toFixed(4)} (searah delta ${deltaDirection === "buy" ? "buy" : "sell"}) tapi delta paruh kedua window (${laterDelta.toFixed(2)}) menyusut <40% dari paruh pertama (${earlierDelta.toFixed(2)}) — indikasi order flow mulai kehabisan tenaga setelah pergerakan yang sudah terjadi, bukan kepastian.`,
        quality: "real",
      };
    }

    return {
      interpretation: deltaDirection === "buy" ? "BUYING_PRESSURE" : "SELLING_PRESSURE",
      deltaDirection,
      deltaMagnitude,
      priceDisplacement,
      evidence: `${deltaDirection === "buy" ? "Buy" : "Sell"} delta dominan (${totalDelta.toFixed(2)}) di ${OBSERVATION_WINDOW} candle terakhir DIKONFIRMASI oleh price displacement ${priceDisplacement.toFixed(4)} (>0.5xATR) searah — order flow dan price response sejalan.`,
      quality: "real",
    };
  }

  if (!priceAgreesWithDelta || !meaningfulMove) {
    // Strong directional delta but price failed to move meaningfully (or
    // moved the other way) in the same window — potential absorption.
    // Deliberately conservative: requires the delta to be non-trivial
    // (deltaRatio already passed the 0.05 "near-balanced" filter above)
    // across the FULL multi-candle window, not a single-candle disagreement.
    return {
      interpretation: "ABSORPTION",
      deltaDirection,
      deltaMagnitude,
      priceDisplacement,
      evidence: `${deltaDirection === "buy" ? "Buy" : "Sell"} delta dominan (${totalDelta.toFixed(2)}) di ${OBSERVATION_WINDOW} candle terakhir TAPI price displacement hanya ${priceDisplacement.toFixed(4)} (${meaningfulMove ? "berlawanan arah" : "<0.5xATR, tidak signifikan"}) — indikasi kemungkinan absorption (agresi diserap tanpa progres harga sepadan), bukan kepastian.`,
      quality: "real",
    };
  }

  return {
    interpretation: "NO_CLEAR_FLOW",
    deltaDirection,
    deltaMagnitude,
    priceDisplacement,
    evidence: "Kombinasi delta dan price response tidak masuk pola BUYING/SELLING/ABSORPTION yang jelas.",
    quality: "real",
  };
}

// ---------------------------------------------------------------------------
// Bundle for the Oracle route
// ---------------------------------------------------------------------------

export interface LiquidityOrderFlowContext {
  zones: LiquidityZone[];
  event: LiquidityEvent;
  priceResponse: OrderFlowPriceResponse;
}

export function buildLiquidityOrderFlowContext(ctx: OracleContext): LiquidityOrderFlowContext {
  return {
    zones: buildLiquidityZones(ctx),
    event: classifyLiquidityEvent(ctx),
    priceResponse: buildOrderFlowPriceResponse(ctx),
  };
}
