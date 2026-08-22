// ---------------------------------------------------------------------------
// ELVOID PRO ORACLE — confluence engine (Phase 2)
//
// Turns an OracleContext (Phase 1, lib/ai/oracle/dataAdapters.ts) into a
// ConfluenceResult: independent LONG and SHORT evidence, per source.
//
// Rules this file enforces:
//  - Every factor's number comes from something actually measured in the
//    OracleContext — no hardcoded weight is added just because a "real"
//    signal is expected.
//  - unavailable data => weight 0, quality "unavailable" — NEVER treated as
//    neutral-as-a-vote or silently defaulted to a side.
//  - proxy data (currently: Liquidity Volume Map, and Microstructure when
//    the requested symbol isn't BTC) has its computed weight capped by
//    PROXY_WEIGHT_CAP so a proxy read can never out-score a real orderbook/
//    liquidity read of similar strength.
//  - LONG and SHORT are computed independently per factor; nothing forces
//    them to be complementary, and genuine internal conflict is recorded
//    in `contradictions` instead of averaged away.
//  - Grading (NO_TRADE/B+/A/A+) is explicitly NOT done here — Phase 3.
//
// Does not import from or modify buildFootprintByCandle / buildTpoSessions /
// buildLiquidityVolumeMap / getOrderBookDepth's own pipeline files beyond
// reading their already-computed output off OracleContext (Phase 1
// adapter's job, not this file's).
// ---------------------------------------------------------------------------

import { findSwingPoints, detectTrend, atr as atrSeries } from "@/lib/elvoid/indicators";
import { scanMarketStructure, scanTrend, scanFairValueGap, scanOrderBlock, scanLiquiditySweep } from "@/lib/elvoid/scanners";
import type { CandleFootprint } from "@/lib/elvoid/footprint";
import type { TpoSession } from "@/lib/elvoid/tpo";
import type { LiquidityVolumeMap } from "@/lib/elvoid/liquidityVolumeMap";
import type { BtcMicrostructure } from "@/lib/intelligence/btcMicrostructure";
import type { OracleContext } from "./types";
import type { ConfluenceFactor, ConfluenceResult, ConfluenceContradiction, ConfluenceSource } from "./confluenceTypes";

/** Proxy-quality factors have their raw computed weight multiplied by this before being recorded — keeps a proxy read structurally below a real read of comparable strength, per spec. */
const PROXY_WEIGHT_CAP = 0.5;

function emptyFactor(source: ConfluenceSource, label: string, reason: string): ConfluenceFactor {
  return { source, label, longWeight: 0, shortWeight: 0, quality: "unavailable", evidence: reason };
}

// --- 1) Market Structure ---------------------------------------------------
function marketStructureFactor(ctx: OracleContext): ConfluenceFactor {
  if (ctx.candles.length < 20) return emptyFactor("market_structure", "Market Structure", "Candle history tidak cukup untuk membaca struktur pasar.");
  const swings = findSwingPoints(ctx.candles, 3);
  const trend = detectTrend(ctx.candles);
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
  const evidence = evidenceParts.length ? evidenceParts.join(" ") : "Struktur & tren belum menunjukkan arah yang jelas.";
  return { source: "market_structure", label: "Market Structure", longWeight, shortWeight, quality: "real", evidence };
}

// --- 2) SMC / ICT (Fair Value Gap + Order Block + Liquidity Sweep) --------
function smcIctFactor(ctx: OracleContext): ConfluenceFactor {
  if (ctx.candles.length < 20) return emptyFactor("smc_ict", "SMC/ICT", "Candle history tidak cukup untuk deteksi FVG/Order Block/Liquidity Sweep.");
  const swings = findSwingPoints(ctx.candles, 3);
  const atrValues = atrSeries(ctx.candles, 14);
  const lastAtr = atrValues[atrValues.length - 1] || ctx.currentPrice * 0.02;

  const fvg = scanFairValueGap(ctx.candles);
  const ob = scanOrderBlock(ctx.candles);
  const sweep = scanLiquiditySweep(ctx.candles, swings, lastAtr);

  let longWeight = 0;
  let shortWeight = 0;
  const evidenceParts: string[] = [];
  for (const scan of [fvg, ob, sweep]) {
    if (scan.bias === "bullish") longWeight += scan.weight;
    if (scan.bias === "bearish") shortWeight += scan.weight;
    if (scan.weight > 0) evidenceParts.push(scan.detail);
  }
  const evidence = evidenceParts.length ? evidenceParts.join(" ") : "Tidak ada FVG/Order Block/Liquidity Sweep yang signifikan saat ini.";
  return { source: "smc_ict", label: "SMC/ICT", longWeight, shortWeight, quality: "real", evidence };
}

// --- 3) TPO -----------------------------------------------------------------
function tpoFactor(ctx: OracleContext): ConfluenceFactor {
  const sessions = ctx.tpo as TpoSession[] | null;
  if (!sessions || sessions.length === 0) return emptyFactor("tpo", "TPO", "TPO session tidak tersedia.");
  const last = sessions[sessions.length - 1];
  if (last.tvah === null || last.tval === null || last.poc === null) {
    return emptyFactor("tpo", "TPO", "Session TPO terakhir belum punya Value Area/POC yang valid (block count terlalu sedikit).");
  }

  const price = ctx.currentPrice;
  if (price > last.tvah) {
    return {
      source: "tpo",
      label: "TPO",
      longWeight: 7,
      shortWeight: 0,
      quality: "real",
      evidence: `Harga (${price.toFixed(4)}) trading di atas TPO Value Area High (${last.tvah.toFixed(4)}) — acceptance di luar value area, bias bullish.`,
    };
  }
  if (price < last.tval) {
    return {
      source: "tpo",
      label: "TPO",
      longWeight: 0,
      shortWeight: 7,
      quality: "real",
      evidence: `Harga (${price.toFixed(4)}) trading di bawah TPO Value Area Low (${last.tval.toFixed(4)}) — acceptance di luar value area, bias bearish.`,
    };
  }
  const pocDistPct = ((price - last.poc) / last.poc) * 100;
  if (Math.abs(pocDistPct) < 0.05) {
    return {
      source: "tpo",
      label: "TPO",
      longWeight: 0,
      shortWeight: 0,
      quality: "real",
      evidence: `Harga persis di POC (${last.poc.toFixed(4)}) — area fair value, tidak ada bias arah dari TPO saat ini.`,
    };
  }
  return {
    source: "tpo",
    label: "TPO",
    longWeight: pocDistPct < 0 ? 2 : 0,
    shortWeight: pocDistPct > 0 ? 2 : 0,
    quality: "real",
    evidence: `Harga di dalam Value Area, ${pocDistPct > 0 ? "di atas" : "di bawah"} POC (${last.poc.toFixed(4)}) sebesar ${Math.abs(pocDistPct).toFixed(2)}% — sinyal lemah, harga masih di zona fair value.`,
  };
}

// --- 4) Footprint -------------------------------------------------------------
function footprintFactor(ctx: OracleContext): ConfluenceFactor {
  const map = ctx.footprint as Map<number, CandleFootprint> | null;
  if (!map || map.size === 0) return emptyFactor("footprint", "Footprint", "Footprint tidak tersedia (trade sample tidak cukup).");

  const entries = Array.from(map.values()).sort((a, b) => a.candleTime - b.candleTime);
  const recent = entries.slice(-5);
  if (recent.length === 0) return emptyFactor("footprint", "Footprint", "Belum ada candle dengan footprint di window terakhir.");

  const totalDelta = recent.reduce((s, c) => s + c.delta, 0);
  const totalVolume = recent.reduce((s, c) => s + c.totalVolume, 0);
  const imbalanceCount = recent.reduce((s, c) => s + c.cells.filter((cell) => cell.imbalance).length, 0);

  if (totalVolume === 0) return emptyFactor("footprint", "Footprint", "Volume footprint 0 di window terakhir.");

  const deltaRatio = totalDelta / totalVolume; // -1..1
  const magnitude = Math.min(12, Math.abs(deltaRatio) * 30 + Math.min(4, imbalanceCount * 0.5));

  if (Math.abs(deltaRatio) < 0.05) {
    return {
      source: "footprint",
      label: "Footprint",
      longWeight: 0,
      shortWeight: 0,
      quality: "real",
      evidence: `Delta footprint ${recent.length} candle terakhir hampir seimbang (${totalDelta.toFixed(2)} dari total volume ${totalVolume.toFixed(2)}) — tidak ada dominasi buy/sell yang jelas.`,
    };
  }

  const label =
    deltaRatio > 0
      ? `Buy delta dominan di ${recent.length} candle terakhir (delta +${totalDelta.toFixed(2)}, ${imbalanceCount} cell imbalance) — indikasi agresi beli.`
      : `Sell delta dominan di ${recent.length} candle terakhir (delta ${totalDelta.toFixed(2)}, ${imbalanceCount} cell imbalance) — indikasi agresi jual.`;

  return {
    source: "footprint",
    label: "Footprint",
    longWeight: deltaRatio > 0 ? magnitude : 0,
    shortWeight: deltaRatio < 0 ? magnitude : 0,
    quality: "real",
    evidence: label,
  };
}

// --- 5) Order Book ------------------------------------------------------------
function orderBookFactor(ctx: OracleContext): ConfluenceFactor {
  if (!ctx.orderBook || ctx.orderBook.bids.length === 0 || ctx.orderBook.asks.length === 0) {
    return emptyFactor("orderbook", "Order Book", "Order book depth tidak tersedia.");
  }
  const { bids, asks } = ctx.orderBook;
  const bidVolume = bids.reduce((s, b) => s + b.qty, 0);
  const askVolume = asks.reduce((s, a) => s + a.qty, 0);
  const total = bidVolume + askVolume;
  if (total === 0) return emptyFactor("orderbook", "Order Book", "Order book depth kosong.");

  const imbalance = (bidVolume - askVolume) / total; // -1..1
  const magnitude = Math.min(8, Math.abs(imbalance) * 16);

  if (Math.abs(imbalance) < 0.08) {
    return {
      source: "orderbook",
      label: "Order Book",
      longWeight: 0,
      shortWeight: 0,
      quality: "real",
      evidence: `Bid/ask depth relatif seimbang (bid ${bidVolume.toFixed(2)} vs ask ${askVolume.toFixed(2)}, top ${bids.length} level) — tidak ada dominasi resting liquidity.`,
    };
  }

  return {
    source: "orderbook",
    label: "Order Book",
    longWeight: imbalance > 0 ? magnitude : 0,
    shortWeight: imbalance < 0 ? magnitude : 0,
    quality: "real",
    evidence:
      imbalance > 0
        ? `Bid depth lebih tebal dari ask (${bidVolume.toFixed(2)} vs ${askVolume.toFixed(2)}, top ${bids.length} level) — resting liquidity condong mendukung sisi beli.`
        : `Ask depth lebih tebal dari bid (${askVolume.toFixed(2)} vs ${bidVolume.toFixed(2)}, top ${asks.length} level) — resting liquidity condong mendukung sisi jual.`,
  };
}

// --- 6) Liquidity Volume Map (PROXY — traded volume, not resting book history) ---
function liquidityFactor(ctx: OracleContext): ConfluenceFactor {
  const map = ctx.liquidity as LiquidityVolumeMap | null;
  if (!map || map.columns.length === 0 || map.bins.length === 0) {
    return emptyFactor("liquidity", "Liquidity", "Liquidity volume map tidak tersedia.");
  }
  const lastColumn = map.columns[map.columns.length - 1];
  let maxIdx = 0;
  for (let i = 1; i < lastColumn.values.length; i++) {
    if (lastColumn.values[i] > lastColumn.values[maxIdx]) maxIdx = i;
  }
  const peakBin = map.bins[maxIdx];
  const peakValue = lastColumn.values[maxIdx];
  const peakTouch = lastColumn.touch[maxIdx] ?? 0;
  if (!peakBin || peakValue <= 0) return emptyFactor("liquidity", "Liquidity", "Belum ada volume node yang signifikan di kolom terbaru.");

  const price = ctx.currentPrice;
  const peakMid = (peakBin.priceLow + peakBin.priceHigh) / 2;
  const distPct = Math.abs((peakMid - price) / price) * 100;
  if (distPct < 0.05) {
    return {
      source: "liquidity",
      label: "Liquidity",
      longWeight: 0,
      shortWeight: 0,
      quality: "proxy",
      evidence: `Harga saat ini sudah berada di high-volume node (${peakMid.toFixed(4)}, ${peakTouch}x touch) — bukan level magnet, netral. (Proxy dari traded volume, bukan resting order book.)`,
    };
  }

  const rawWeight = Math.min(6, 2 + peakTouch * 0.5);
  const weight = rawWeight * PROXY_WEIGHT_CAP;
  const towardsAbove = peakMid > price;
  return {
    source: "liquidity",
    label: "Liquidity",
    longWeight: towardsAbove ? weight : 0,
    shortWeight: !towardsAbove ? weight : 0,
    quality: "proxy",
    evidence: `High-volume node terdeteksi di ${peakMid.toFixed(4)} (${peakTouch}x touch, ${distPct.toFixed(2)}% dari harga saat ini) — potensi magnet harga ${towardsAbove ? "ke atas" : "ke bawah"}. Proxy dari traded volume per bin, bukan resting order book historis.`,
  };
}

// --- 7) Microstructure --------------------------------------------------------
function microstructureFactor(ctx: OracleContext): ConfluenceFactor {
  const micro = ctx.microstructure as BtcMicrostructure | null;
  if (!micro || (!micro.connected.funding && !micro.connected.orderbook)) {
    return emptyFactor("microstructure", "Microstructure", "Microstructure snapshot tidak tersedia.");
  }
  const isBtcNative = ctx.symbol === "BTC" || ctx.symbol === "BTCUSDT";
  const quality: "real" | "proxy" = isBtcNative ? "real" : "proxy";

  const signals: { bias: "bullish" | "bearish"; weight: number; note: string }[] = [];
  if (micro.connected.funding && typeof micro.fundingRate === "number") {
    if (micro.fundingRate > 0.0005) signals.push({ bias: "bearish", weight: 3, note: `Funding rate tinggi (${(micro.fundingRate * 100).toFixed(4)}%) — long crowded, risiko squeeze turun.` });
    else if (micro.fundingRate < -0.0005) signals.push({ bias: "bullish", weight: 3, note: `Funding rate negatif (${(micro.fundingRate * 100).toFixed(4)}%) — short crowded, risiko squeeze naik.` });
  }
  if (typeof micro.basisPercent === "number" && Math.abs(micro.basisPercent) > 0.02) {
    signals.push(
      micro.basisPercent > 0
        ? { bias: "bullish", weight: 2, note: `Basis futures-spot positif (${micro.basisPercent.toFixed(3)}%) — kontango, minat beli di futures.` }
        : { bias: "bearish", weight: 2, note: `Basis futures-spot negatif (${micro.basisPercent.toFixed(3)}%) — backwardation, tekanan jual di futures.` }
    );
  }

  if (signals.length === 0) {
    return {
      source: "microstructure",
      label: "Microstructure",
      longWeight: 0,
      shortWeight: 0,
      quality,
      evidence:
        "Funding/basis BTC dalam rentang normal — tidak ada sinyal microstructure yang signifikan." +
        (isBtcNative ? "" : " (Diterapkan sebagai konteks makro BTC, bukan data spesifik simbol ini — proxy.)"),
    };
  }

  let longWeight = signals.filter((s) => s.bias === "bullish").reduce((s, x) => s + x.weight, 0);
  let shortWeight = signals.filter((s) => s.bias === "bearish").reduce((s, x) => s + x.weight, 0);
  if (quality === "proxy") {
    longWeight *= PROXY_WEIGHT_CAP;
    shortWeight *= PROXY_WEIGHT_CAP;
  }
  const evidence = signals.map((s) => s.note).join(" ") + (isBtcNative ? "" : " (Diterapkan sebagai konteks makro BTC, bukan data spesifik simbol ini — proxy.)");
  return { source: "microstructure", label: "Microstructure", longWeight, shortWeight, quality, evidence };
}

// --- 8) Macro -------------------------------------------------------------------
function macroFactor(ctx: OracleContext): ConfluenceFactor {
  // Not yet wired to a real DXY feed inside the Oracle adapter (Phase 1
  // note) — reporting unavailable rather than fabricating a neutral or
  // directional read.
  void ctx;
  return emptyFactor("macro", "Macro", "Data DXY/macro calendar belum diintegrasikan ke Oracle adapter — factor ini unavailable sampai sumber data real ditambahkan.");
}

function detectContradictions(factors: ConfluenceFactor[]): ConfluenceContradiction[] {
  const contradictions: ConfluenceContradiction[] = [];
  for (const f of factors) {
    if (f.longWeight > 0 && f.shortWeight > 0) {
      contradictions.push({ description: `${f.label} punya bukti untuk LONG dan SHORT sekaligus — sinyal internal ambigu.`, sources: [f.source] });
    }
  }
  const strongSide = (f: ConfluenceFactor) => (f.longWeight > f.shortWeight ? "LONG" : f.shortWeight > f.longWeight ? "SHORT" : null);
  const ms = factors.find((f) => f.source === "market_structure");
  const fp = factors.find((f) => f.source === "footprint");
  if (ms && fp) {
    const msSide = strongSide(ms);
    const fpSide = strongSide(fp);
    if (msSide && fpSide && msSide !== fpSide && Math.max(ms.longWeight, ms.shortWeight) > 3 && Math.max(fp.longWeight, fp.shortWeight) > 3) {
      contradictions.push({
        description: `Market Structure condong ${msSide} sementara Footprint condong ${fpSide} — struktur harga dan agresi order flow saat ini berlawanan arah.`,
        sources: ["market_structure", "footprint"],
      });
    }
  }
  return contradictions;
}

/**
 * Runs all confluence factors against one OracleContext and produces a
 * ConfluenceResult. Pure function of its input — no fetching here (that's
 * Phase 1's job), no grading (Phase 3's job).
 */
export function computeConfluence(ctx: OracleContext): ConfluenceResult {
  const factors: ConfluenceFactor[] = [
    marketStructureFactor(ctx),
    smcIctFactor(ctx),
    tpoFactor(ctx),
    footprintFactor(ctx),
    orderBookFactor(ctx),
    liquidityFactor(ctx),
    microstructureFactor(ctx),
    macroFactor(ctx),
  ];

  const longScore = factors.reduce((s, f) => s + f.longWeight, 0);
  const shortScore = factors.reduce((s, f) => s + f.shortWeight, 0);
  const dominantSide: ConfluenceResult["dominantSide"] = longScore === shortScore ? "NEUTRAL" : longScore > shortScore ? "LONG" : "SHORT";

  return {
    symbol: ctx.symbol,
    timestamp: new Date().toISOString(),
    longScore: Math.round(longScore * 100) / 100,
    shortScore: Math.round(shortScore * 100) / 100,
    factors,
    evidence: factors.map((f) => `[${f.label}${f.quality === "proxy" ? " · PROXY" : f.quality === "unavailable" ? " · UNAVAILABLE" : ""}] ${f.evidence}`),
    contradictions: detectContradictions(factors),
    dataQuality: ctx.dataQuality.map((d) => d.quality),
    dominantSide,
  };
}
