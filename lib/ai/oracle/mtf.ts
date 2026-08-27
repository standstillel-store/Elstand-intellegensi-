// ---------------------------------------------------------------------------
// ELVOID PRO — Multi-Timeframe Context (Phase 7.2)
//
// Gives Elvoid Pro CONTEXT about higher/lower timeframe structure. This is
// explicitly NOT a second directional decision — see classifyMtfRelationship
// below, which only ever returns a descriptive relationship label, never a
// LONG/SHORT verdict. The canonical Pro decision remains gradeConfluence()'s
// output (grading.ts), untouched by this file.
//
// Reuses existing primitives only:
//   - lib/binance.ts getKlines() for the extra HTF/LTF candle fetch (same
//     function, same 60s in-process cache the anchor timeframe already
//     uses — see lib/cache.ts). No new fetch/cache infrastructure.
//   - lib/elvoid/indicators.ts findSwingPoints/detectTrend/findSupportResistance
//     and lib/elvoid/scanners.ts scanMarketStructure/scanTrend — the exact
//     same functions marketStructureFactor() in confluence.ts already uses
//     for the anchor timeframe, applied here to additional candle series.
//
// No new market-structure algorithm. No fabricated candles: an interval
// that isn't in TIMEFRAME_MAP, or whose fetch fails/returns too few candles,
// is reported as `available: false` and contributes nothing.
// ---------------------------------------------------------------------------

import { getKlines } from "@/lib/binance";
import { findSwingPoints, detectTrend, findSupportResistance, type SrLevel } from "@/lib/elvoid/indicators";
import { scanMarketStructure, scanTrend } from "@/lib/elvoid/scanners";
import type { Candle } from "@/lib/elvoid/types";

export type MtfBias = "LONG" | "SHORT" | "NEUTRAL";

/**
 * Deterministic anchor -> {htf, ltf} mapping. Documented per Phase 7.2 spec
 * step 2 — not universally "correct", just the fixed rule this version of
 * Elvoid Pro uses. Only intervals the app already supports (see
 * lib/market-data/timeframeHistory.ts) appear here. An anchor with no
 * mapped neighbor on one side (e.g. "1d" has no HTF) reports that side as
 * unavailable rather than guessing.
 */
export const TIMEFRAME_MAP: Record<string, { htf: string | null; ltf: string | null }> = {
  "1m": { htf: "15m", ltf: null },
  "5m": { htf: "1h", ltf: "1m" },
  "15m": { htf: "4h", ltf: "5m" },
  "1h": { htf: "1d", ltf: "15m" },
  "4h": { htf: "1d", ltf: "1h" },
  "1d": { htf: null, ltf: "4h" },
};

export interface TimeframeSlice {
  timeframe: string;
  available: boolean;
  bias: MtfBias;
  /** The scanMarketStructure/scanTrend combined weight behind `bias` (0 when NEUTRAL/unavailable) — same scale confluence.ts's marketStructureFactor uses. */
  strength: number;
  evidence: string;
  /** Nearest protective S/R level for `bias` (support under a LONG bias, resistance under a SHORT bias) — used only to detect a real, measured structural break, never invented. Null when bias is NEUTRAL or too little history exists. */
  protectiveLevel: SrLevel | null;
}

export type MtfRelationship =
  | "ALIGNED_BULLISH"
  | "ALIGNED_BEARISH"
  | "PULLBACK_IN_UPTREND"
  | "PULLBACK_IN_DOWNTREND"
  | "CONTINUATION_AFTER_PULLBACK_BULLISH"
  | "CONTINUATION_AFTER_PULLBACK_BEARISH"
  | "HTF_THESIS_THREATENED_BULLISH"
  | "HTF_THESIS_THREATENED_BEARISH"
  | "NEUTRAL_OR_MIXED"
  | "INSUFFICIENT_DATA";

export interface MtfContext {
  anchorInterval: string;
  htf: TimeframeSlice | null; // null when this anchor has no mapped HTF (e.g. "1d")
  mtf: TimeframeSlice; // the anchor timeframe itself — always present, reuses the anchor's own candles (no extra fetch)
  ltf: TimeframeSlice | null; // null when this anchor has no mapped LTF (e.g. "1m")
  relationship: MtfRelationship;
  relationshipEvidence: string;
}

const MIN_CANDLES_FOR_STRUCTURE = 20;

function emptySlice(timeframe: string, reason: string): TimeframeSlice {
  return { timeframe, available: false, bias: "NEUTRAL", strength: 0, evidence: reason, protectiveLevel: null };
}

/** Same derivation marketStructureFactor() (confluence.ts) applies to the anchor timeframe — reused here for any timeframe's candle series. */
function deriveTimeframeSlice(timeframe: string, candles: Candle[], currentPrice: number): TimeframeSlice {
  if (candles.length < MIN_CANDLES_FOR_STRUCTURE) {
    return emptySlice(timeframe, `Candle history ${timeframe} tidak cukup (${candles.length}/${MIN_CANDLES_FOR_STRUCTURE}) untuk membaca struktur.`);
  }
  const swings = findSwingPoints(candles, 3);
  const trend = detectTrend(candles);
  const structureScan = scanMarketStructure(swings);
  const trendScan = scanTrend(trend);

  let longWeight = 0;
  let shortWeight = 0;
  const evidenceParts: string[] = [];
  for (const scan of [structureScan, trendScan]) {
    if (scan.bias === "bullish") longWeight += scan.weight;
    if (scan.bias === "bearish") shortWeight += scan.weight;
    if (scan.weight > 0) evidenceParts.push(scan.detail);
  }

  const bias: MtfBias = longWeight === shortWeight ? "NEUTRAL" : longWeight > shortWeight ? "LONG" : "SHORT";
  const strength = Math.max(longWeight, shortWeight);
  const evidence = evidenceParts.length ? evidenceParts.join(" ") : `Struktur & tren ${timeframe} belum menunjukkan arah yang jelas.`;

  let protectiveLevel: SrLevel | null = null;
  if (bias !== "NEUTRAL") {
    const levels = findSupportResistance(candles, currentPrice);
    const wanted = bias === "LONG" ? "support" : "resistance";
    const candidates = levels.filter((l) => l.type === wanted);
    // Nearest protective level to current price = the one most likely to matter first if broken.
    protectiveLevel = candidates.sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))[0] ?? null;
  }

  return { timeframe, available: true, bias, strength, evidence, protectiveLevel };
}

/** Real, measured structural break check — never a guess. "Broken" means price has moved past the timeframe's own protective level on the wrong side. */
function isProtectiveLevelBroken(slice: TimeframeSlice, currentPrice: number): boolean {
  if (!slice.available || !slice.protectiveLevel) return false;
  if (slice.bias === "LONG") return currentPrice < slice.protectiveLevel.price;
  if (slice.bias === "SHORT") return currentPrice > slice.protectiveLevel.price;
  return false;
}

/**
 * Descriptive-only relationship between HTF/MTF/LTF. This function returns
 * CONTEXT, never a decision — Phase 7.5 (Scenario Engine) and 7.7 (Decision
 * Arbitration) are what eventually consume this, not a replacement for them.
 *
 * NOTE (documented limitation, not fabricated): "bearish/bullish
 * displacement" per spec Case C is approximated here as "LTF agrees with
 * the break direction" — there is no separate displacement-magnitude
 * detector yet. This keeps the check evidence-based (real LTF structure)
 * without inventing a new signal. A true TRUE_THESIS_INVALIDATION verdict
 * is explicitly deferred to Phase 7.6's Contradiction Classifier.
 */
export function classifyMtfRelationship(
  htf: TimeframeSlice | null,
  mtf: TimeframeSlice,
  ltf: TimeframeSlice | null,
  currentPrice: number
): { relationship: MtfRelationship; evidence: string } {
  // Case D / E variants: not enough of the picture to say anything meaningful.
  if (!htf || !htf.available) {
    if (!ltf || !ltf.available) {
      return { relationship: "INSUFFICIENT_DATA", evidence: "HTF dan LTF tidak tersedia — hanya timeframe anchor yang bisa dibaca." };
    }
    return { relationship: "INSUFFICIENT_DATA", evidence: "HTF tidak tersedia untuk anchor ini — konteks multi-timeframe tidak lengkap." };
  }

  if (htf.bias === "NEUTRAL") {
    return { relationship: "NEUTRAL_OR_MIXED", evidence: "Struktur HTF belum menunjukkan arah yang jelas." };
  }

  const htfBullish = htf.bias === "LONG";
  const broken = isProtectiveLevelBroken(htf, currentPrice);
  const ltfAgreesWithBreak = ltf?.available && ltf.bias !== "NEUTRAL" && ltf.bias !== htf.bias;

  if (broken && ltfAgreesWithBreak) {
    return {
      relationship: htfBullish ? "HTF_THESIS_THREATENED_BULLISH" : "HTF_THESIS_THREATENED_BEARISH",
      evidence: `Level protektif HTF (${htf.protectiveLevel?.price.toFixed(2)}) sudah dilewati harga saat ini (${currentPrice.toFixed(2)}) dan LTF (${ltf!.timeframe}) mengonfirmasi arah sebaliknya — tesis HTF ${htfBullish ? "bullish" : "bearish"} terancam. Belum diklasifikasikan sebagai invalidasi penuh (lihat Contradiction Classifier, Phase 7.6).`,
    };
  }

  // MTF (anchor) disagrees with HTF but the HTF protective level is still intact.
  if (mtf.bias !== "NEUTRAL" && mtf.bias !== htf.bias) {
    if (ltf?.available && ltf.bias === htf.bias) {
      return {
        relationship: htfBullish ? "CONTINUATION_AFTER_PULLBACK_BULLISH" : "CONTINUATION_AFTER_PULLBACK_BEARISH",
        evidence: `HTF ${htf.timeframe} ${htfBullish ? "bullish" : "bearish"}, MTF ${mtf.timeframe} menunjukkan pullback sementara, namun LTF ${ltf.timeframe} kembali searah HTF — kandidat continuation setelah pullback.`,
      };
    }
    return {
      relationship: htfBullish ? "PULLBACK_IN_UPTREND" : "PULLBACK_IN_DOWNTREND",
      evidence: `HTF ${htf.timeframe} ${htfBullish ? "bullish" : "bearish"}, MTF ${mtf.timeframe} bergerak berlawanan, level protektif HTF (${htf.protectiveLevel?.price.toFixed(2) ?? "n/a"}) belum dilewati — kemungkinan pullback, bukan pembalikan tesis.`,
    };
  }

  if (mtf.bias === htf.bias) {
    return {
      relationship: htfBullish ? "ALIGNED_BULLISH" : "ALIGNED_BEARISH",
      evidence: `HTF ${htf.timeframe} dan MTF ${mtf.timeframe} searah (${htfBullish ? "bullish" : "bearish"}).`,
    };
  }

  return { relationship: "NEUTRAL_OR_MIXED", evidence: "Kombinasi HTF/MTF/LTF belum membentuk pola yang jelas." };
}

/**
 * Builds the full MTF context for one anchor request. `anchorCandles` MUST
 * be the same candle series the caller already fetched via
 * assembleOracleContext() — this function never re-fetches the anchor
 * timeframe itself, only the mapped HTF/LTF neighbors (if any), each via
 * the existing cached getKlines().
 */
export async function buildMtfContext(symbol: string, anchorInterval: string, anchorCandles: Candle[], currentPrice: number): Promise<MtfContext> {
  const mapping = TIMEFRAME_MAP[anchorInterval];
  const mtf = deriveTimeframeSlice(anchorInterval, anchorCandles, currentPrice);

  const htfInterval = mapping?.htf ?? null;
  const ltfInterval = mapping?.ltf ?? null;

  const [htfCandles, ltfCandles] = await Promise.all([
    htfInterval ? getKlines(symbol, htfInterval, 200).catch(() => []) : Promise.resolve<Candle[]>([]),
    ltfInterval ? getKlines(symbol, ltfInterval, 200).catch(() => []) : Promise.resolve<Candle[]>([]),
  ]);

  const htf = htfInterval ? deriveTimeframeSlice(htfInterval, htfCandles, currentPrice) : null;
  const ltf = ltfInterval ? deriveTimeframeSlice(ltfInterval, ltfCandles, currentPrice) : null;

  const { relationship, evidence } = classifyMtfRelationship(htf, mtf, ltf, currentPrice);

  return { anchorInterval, htf, mtf, ltf, relationship, relationshipEvidence: evidence };
}
