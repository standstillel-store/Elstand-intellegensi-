// ---------------------------------------------------------------------------
// Pattern detection for AI Insights & Patterns.
//
// Reuses ConfluenceResult's factors (Phase 2 of the Oracle build — same
// scanners, same footprint/TPO/orderbook reads, zero duplicate
// computation) plus OracleContext.tpo's multi-session history for the two
// patterns that need to compare across sessions (POC Migration, Value Area
// Shift). No CVD or Open Interest time series exist anywhere in this
// codebase yet (OracleContext never fetches them), so CVD Divergence,
// Open-Interest divergence, Exhaustion, Breakout Confirmation/Failure, and
// Re-accumulation/Distribution are deliberately NOT implemented here rather
// than faked — see the engine's own "not implemented" list surfaced in the
// API response's dataQuality/limitations, per spec's explicit preference
// for 2 valid insights over 10 hollow ones.
// ---------------------------------------------------------------------------

import type { OracleContext } from "../oracle/types";
import type { ConfluenceResult, ConfluenceFactor } from "../oracle/confluenceTypes";
import type { CandleFootprint } from "@/lib/elvoid/footprint";
import type { TpoSession } from "@/lib/elvoid/tpo";
import type { InsightPattern, PatternKind, InsightCategory } from "./types";
import { computeConfidence } from "./confidence";

function worstQuality(qualities: ("real" | "proxy" | "unavailable")[]): "real" | "proxy" | "unavailable" {
  if (qualities.includes("unavailable")) return "unavailable";
  if (qualities.includes("proxy")) return "proxy";
  return "real";
}

function factor(factors: ConfluenceFactor[], source: ConfluenceFactor["source"]): ConfluenceFactor | undefined {
  return factors.find((f) => f.source === source);
}

function makePattern(
  kind: PatternKind,
  label: string,
  category: InsightCategory,
  evidence: string[],
  interpretation: string,
  risk: string,
  confirmingSources: ConfluenceFactor["source"][],
  qualities: ("real" | "proxy" | "unavailable")[],
  strength: number,
  hasContradiction: boolean,
  now: string
): InsightPattern {
  return {
    kind,
    label,
    category,
    confidence: computeConfidence({ evidenceCount: evidence.length, sourceQualities: qualities, strength, hasContradiction }),
    evidence,
    interpretation,
    risk,
    confirmingSources,
    dataQuality: worstQuality(qualities),
    detectedAt: now,
  };
}

function detectLiquiditySweep(confluence: ConfluenceResult, now: string): InsightPattern | null {
  const smc = factor(confluence.factors, "smc_ict");
  if (!smc || smc.quality === "unavailable" || !/sweep/i.test(smc.evidence)) return null;
  const footprint = factor(confluence.factors, "footprint");
  const side = smc.longWeight > smc.shortWeight ? "LONG" : "SHORT";
  const footprintAgrees =
    footprint &&
    footprint.quality !== "unavailable" &&
    (side === "LONG" ? footprint.longWeight > footprint.shortWeight : footprint.shortWeight > footprint.longWeight) &&
    Math.max(footprint.longWeight, footprint.shortWeight) > 0;
  const evidence = [smc.evidence];
  if (footprintAgrees && footprint) evidence.push(footprint.evidence);
  return makePattern(
    "LIQUIDITY_SWEEP",
    "Liquidity Sweep",
    "structure",
    evidence,
    `Price menyapu liquidity di sisi ${side === "LONG" ? "bawah" : "atas"} sebelum bergerak berlawanan arah — pola klasik stop-hunt sebelum reversal/continuation.`,
    "Gagal reclaim level yang disweep bisa berarti sweep ini adalah bagian dari kelanjutan tren, bukan reversal.",
    footprintAgrees ? ["smc_ict", "footprint"] : ["smc_ict"],
    footprintAgrees ? [smc.quality, footprint!.quality] : [smc.quality],
    Math.min(1, Math.max(smc.longWeight, smc.shortWeight) / 12),
    false,
    now
  );
}

function detectOrderBlockReaction(confluence: ConfluenceResult, now: string): InsightPattern | null {
  const smc = factor(confluence.factors, "smc_ict");
  if (!smc || smc.quality === "unavailable" || !/order block/i.test(smc.evidence)) return null;
  const side = smc.longWeight > smc.shortWeight ? "LONG" : "SHORT";
  return makePattern(
    "ORDER_BLOCK_REACTION",
    "Order Block Reaction",
    "structure",
    [smc.evidence],
    `Price bereaksi dari zona Order Block ${side === "LONG" ? "demand" : "supply"} — area di mana institutional order flow sebelumnya terkonsentrasi.`,
    "Order Block bisa gagal (mitigated) jika price menembus zona ini dengan volume besar.",
    ["smc_ict"],
    [smc.quality],
    Math.min(1, Math.max(smc.longWeight, smc.shortWeight) / 9),
    false,
    now
  );
}

function detectFvgReaction(confluence: ConfluenceResult, now: string): InsightPattern | null {
  const smc = factor(confluence.factors, "smc_ict");
  if (!smc || smc.quality === "unavailable" || !/fair value gap|fvg/i.test(smc.evidence)) return null;
  const side = smc.longWeight > smc.shortWeight ? "LONG" : "SHORT";
  return makePattern(
    "FVG_REACTION",
    "FVG Reaction",
    "structure",
    [smc.evidence],
    `Price bereaksi terhadap Fair Value Gap ${side === "LONG" ? "bullish" : "bearish"} yang belum terisi penuh.`,
    "FVG bisa terisi penuh (fully filled) dan kehilangan relevansinya sebagai zona reaksi.",
    ["smc_ict"],
    [smc.quality],
    Math.min(1, Math.max(smc.longWeight, smc.shortWeight) / 9),
    false,
    now
  );
}

function detectOrderBookImbalance(confluence: ConfluenceResult, now: string): InsightPattern | null {
  const ob = factor(confluence.factors, "orderbook");
  if (!ob || ob.quality === "unavailable" || Math.max(ob.longWeight, ob.shortWeight) === 0) return null;
  const side = ob.longWeight > ob.shortWeight ? "bid" : "ask";
  return makePattern(
    "ORDER_BOOK_IMBALANCE",
    "Order Book Imbalance",
    "orderbook",
    [ob.evidence],
    `Depth ${side} secara signifikan lebih tebal dari sisi lawannya di top level order book saat ini.`,
    "Resting liquidity ini bisa ditarik (withdrawn) sewaktu-waktu tanpa eksekusi — bukan komitmen yang mengikat.",
    ["orderbook"],
    [ob.quality],
    Math.min(1, Math.max(ob.longWeight, ob.shortWeight) / 8),
    false,
    now
  );
}

function detectFootprintImbalance(confluence: ConfluenceResult, context: OracleContext, now: string): InsightPattern | null {
  const fp = factor(confluence.factors, "footprint");
  const map = context.footprint as Map<number, CandleFootprint> | null;
  if (!fp || fp.quality === "unavailable" || !map || map.size === 0) return null;
  const recent = Array.from(map.values()).sort((a, b) => a.candleTime - b.candleTime).slice(-5);
  const totalImbalance = recent.reduce((s, c) => s + c.cells.filter((cell) => cell.imbalance).length, 0);
  if (totalImbalance === 0) return null;
  const stacked = recent.filter((c) => c.cells.filter((cell) => cell.imbalance).length >= 2).length >= 2;
  const side = fp.longWeight > fp.shortWeight ? "beli" : "jual";
  return makePattern(
    stacked ? "STACKED_IMBALANCE" : "FOOTPRINT_IMBALANCE",
    stacked ? "Stacked Imbalance" : "Footprint Imbalance",
    "footprint",
    [`${totalImbalance} cell imbalance terdeteksi di ${recent.length} candle terakhir.`, fp.evidence],
    stacked
      ? `Imbalance ${side} bertumpuk (stacked) di beberapa candle berturut-turut pada level harga yang berdekatan — indikasi agresi ${side} yang konsisten, bukan satu kejadian tunggal.`
      : `Imbalance ${side} muncul di footprint candle terakhir — indikasi aktivitas agresif satu arah.`,
    "Imbalance tanpa lanjutan pergerakan harga bisa jadi tanda absorpsi, bukan breakout.",
    ["footprint"],
    [fp.quality],
    Math.min(1, totalImbalance / 8),
    false,
    now
  );
}

function detectAbsorption(confluence: ConfluenceResult, now: string): InsightPattern | null {
  const fp = factor(confluence.factors, "footprint");
  const structure = factor(confluence.factors, "market_structure");
  if (!fp || fp.quality === "unavailable" || !structure) return null;
  const fpStrong = Math.max(fp.longWeight, fp.shortWeight) >= 8;
  const structureWeak = Math.max(structure.longWeight, structure.shortWeight) < 4;
  if (!fpStrong || !structureWeak) return null;
  const side = fp.longWeight > fp.shortWeight ? "beli" : "jual";
  return makePattern(
    "ABSORPTION",
    "Absorption",
    "flow",
    [fp.evidence, structure.quality === "real" ? structure.evidence : "Struktur harga nyaris tidak bergerak meski ada agresi order flow."],
    `Agresi ${side} yang kuat sedang diserap (absorbed) tanpa membuat harga bergerak signifikan — biasanya tanda resting liquidity besar dari sisi lawan.`,
    "Absorpsi bisa gagal jika resting liquidity habis, memicu pergerakan cepat ke arah agresi.",
    ["footprint", "market_structure"],
    [fp.quality, structure.quality],
    Math.min(1, Math.max(fp.longWeight, fp.shortWeight) / 12),
    false,
    now
  );
}

function detectDeltaDivergence(context: OracleContext, now: string): InsightPattern | null {
  const map = context.footprint as Map<number, CandleFootprint> | null;
  if (!map || map.size < 8) return null;
  const entries = Array.from(map.values()).sort((a, b) => a.candleTime - b.candleTime);
  const window = entries.slice(-8);
  if (window.length < 8) return null;

  const firstHalf = window.slice(0, 4);
  const secondHalf = window.slice(4);
  const lastCandle = secondHalf[secondHalf.length - 1];
  const firstCandle = firstHalf[0];
  const lastPrice = lastCandle.poc?.priceHigh ?? lastCandle.cells[0]?.priceHigh;
  const firstPrice = firstCandle.poc?.priceLow ?? firstCandle.cells[0]?.priceLow;
  if (lastPrice === undefined || firstPrice === undefined) return null;
  const priceChange = lastPrice - firstPrice;
  const deltaFirst = firstHalf.reduce((s, c) => s + c.delta, 0);
  const deltaSecond = secondHalf.reduce((s, c) => s + c.delta, 0);

  const priceUp = priceChange > 0;
  const deltaWeakening = priceUp ? deltaSecond < deltaFirst * 0.6 : deltaSecond > deltaFirst * 0.6;
  if (!deltaWeakening || Math.abs(priceChange) === 0) return null;
  if (Math.abs(deltaFirst) < 1) return null;

  return makePattern(
    "DELTA_DIVERGENCE",
    "Delta Divergence",
    "divergence",
    [
      `Delta 4-candle pertama: ${deltaFirst.toFixed(2)}, delta 4-candle terakhir: ${deltaSecond.toFixed(2)}.`,
      `Price bergerak ${priceUp ? "naik" : "turun"} sepanjang window ini.`,
    ],
    `Price masih bergerak ${priceUp ? "naik" : "turun"}, tetapi delta footprint yang mendukung pergerakan ini melemah — indikasi momentum agresif mulai berkurang.`,
    "Divergence bisa berlanjut lama sebelum price benar-benar berbalik — bukan sinyal timing presisi.",
    ["footprint"],
    ["real"],
    Math.min(1, Math.abs(deltaFirst - deltaSecond) / (Math.abs(deltaFirst) || 1)),
    false,
    now
  );
}

function detectPocMigration(context: OracleContext, now: string): InsightPattern | null {
  const sessions = context.tpo as TpoSession[] | null;
  if (!sessions || sessions.length < 2) return null;
  const [prev, last] = sessions.slice(-2);
  if (prev.poc === null || last.poc === null) return null;
  const shiftPct = ((last.poc - prev.poc) / prev.poc) * 100;
  if (Math.abs(shiftPct) < 0.15) return null;
  const dir = shiftPct > 0 ? "naik" : "turun";
  return makePattern(
    "POC_MIGRATION",
    "POC Migration",
    "tpo",
    [`POC session sebelumnya: ${prev.poc.toFixed(4)}, POC session sekarang: ${last.poc.toFixed(4)} (${shiftPct > 0 ? "+" : ""}${shiftPct.toFixed(2)}%).`],
    `Point of Control bermigrasi ${dir} antar session — indikasi fair value trader bergeser ${dir}, konsisten dengan potensi perubahan value area jangka pendek.`,
    "POC bisa migrasi kembali (revert) di session berikutnya jika ini hanya penyesuaian sementara.",
    ["tpo"],
    ["real"],
    Math.min(1, Math.abs(shiftPct) / 1.5),
    false,
    now
  );
}

function detectValueAreaShift(context: OracleContext, now: string): InsightPattern | null {
  const sessions = context.tpo as TpoSession[] | null;
  if (!sessions || sessions.length < 2) return null;
  const [prev, last] = sessions.slice(-2);
  if (prev.tvah === null || prev.tval === null || last.tvah === null || last.tval === null) return null;
  const prevMid = (prev.tvah + prev.tval) / 2;
  const lastMid = (last.tvah + last.tval) / 2;
  const shiftPct = ((lastMid - prevMid) / prevMid) * 100;
  if (Math.abs(shiftPct) < 0.2) return null;
  const overlapping = last.tval <= prev.tvah && last.tvah >= prev.tval;
  const dir = shiftPct > 0 ? "naik" : "turun";
  return makePattern(
    "VALUE_AREA_SHIFT",
    "Value Area Shift",
    "tpo",
    [
      `Value Area sebelumnya: ${prev.tval.toFixed(4)}\u2013${prev.tvah.toFixed(4)}. Value Area sekarang: ${last.tval.toFixed(4)}\u2013${last.tvah.toFixed(4)}.`,
      overlapping ? "Kedua Value Area masih overlap sebagian." : "Value Area baru sepenuhnya di luar Value Area sebelumnya — tanda acceptance di level baru.",
    ],
    `Value Area bergeser ${dir} antar session${overlapping ? "" : " tanpa overlap"} — pasar sedang menemukan fair value di level yang ${overlapping ? "berdekatan" : "baru"}.`,
    "Value Area shift tanpa volume pendukung bisa jadi tidak stabil dan kembali ke area lama.",
    ["tpo"],
    ["real"],
    Math.min(1, Math.abs(shiftPct) / 1.5 + (overlapping ? 0 : 0.3)),
    false,
    now
  );
}

function detectFailedAuction(context: OracleContext, now: string): InsightPattern | null {
  const sessions = context.tpo as TpoSession[] | null;
  if (!sessions || sessions.length === 0) return null;
  const last = sessions[sessions.length - 1];
  if (last.tvah === null || last.tval === null) return null;
  const price = context.currentPrice;

  const attemptedAbove = last.high > last.tvah * 1.0005;
  const attemptedBelow = last.low < last.tval * 0.9995;
  const rejectedFromAbove = attemptedAbove && price < last.tvah;
  const rejectedFromBelow = attemptedBelow && price > last.tval;
  if (!rejectedFromAbove && !rejectedFromBelow) return null;

  const dir = rejectedFromAbove ? "atas" : "bawah";
  return makePattern(
    "FAILED_AUCTION",
    "Failed Auction",
    "tpo",
    [
      rejectedFromAbove
        ? `Session high (${last.high.toFixed(4)}) sempat melewati TVAH (${last.tvah.toFixed(4)}), tapi harga sekarang (${price.toFixed(4)}) kembali di bawahnya.`
        : `Session low (${last.low.toFixed(4)}) sempat menembus TVAL (${last.tval.toFixed(4)}), tapi harga sekarang (${price.toFixed(4)}) kembali di atasnya.`,
    ],
    `Price mencoba auction di luar Value Area sisi ${dir} tapi gagal mendapatkan acceptance dan kembali masuk — sering mendahului pergerakan berlawanan arah dari percobaan tersebut.`,
    "Failed auction bisa dicoba ulang (retest) sebelum benar-benar gagal secara definitif.",
    ["tpo"],
    ["real"],
    0.55,
    false,
    now
  );
}

export function detectAllPatterns(context: OracleContext, confluence: ConfluenceResult): InsightPattern[] {
  const now = new Date().toISOString();
  const detectors = [
    () => detectLiquiditySweep(confluence, now),
    () => detectOrderBlockReaction(confluence, now),
    () => detectFvgReaction(confluence, now),
    () => detectOrderBookImbalance(confluence, now),
    () => detectFootprintImbalance(confluence, context, now),
    () => detectAbsorption(confluence, now),
    () => detectDeltaDivergence(context, now),
    () => detectPocMigration(context, now),
    () => detectValueAreaShift(context, now),
    () => detectFailedAuction(context, now),
  ];
  const results: InsightPattern[] = [];
  for (const d of detectors) {
    const p = d();
    if (p) results.push(p);
  }
  return results;
}
