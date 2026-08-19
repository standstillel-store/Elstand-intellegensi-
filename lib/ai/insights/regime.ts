// ---------------------------------------------------------------------------
// Market regime classification — reuses the SAME ConfluenceResult factors
// Oracle already computed (no duplicate scanning), plus raw candle
// volatility from OracleContext. Priority-ordered: the first rule that
// finds real supporting evidence wins; RANGING is the honest fallback when
// nothing distinctive is detected (not "nothing happened" — ranging is a
// real, valid regime), and UNAVAILABLE is used only when the data needed to
// classify anything at all (candles + market structure) isn't there.
// ---------------------------------------------------------------------------

import type { OracleContext } from "../oracle/types";
import type { ConfluenceResult } from "../oracle/confluenceTypes";
import type { MarketRegime } from "./types";

function atrPercent(ctx: OracleContext): number | null {
  if (ctx.candles.length < 15 || ctx.currentPrice <= 0) return null;
  const recent = ctx.candles.slice(-15);
  const trueRanges = recent.map((c, i) => {
    const prevClose = i > 0 ? recent[i - 1].close : c.open;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  const atr = trueRanges.reduce((s, v) => s + v, 0) / trueRanges.length;
  return (atr / ctx.currentPrice) * 100;
}

function orderBookDepthTotal(ctx: OracleContext): number | null {
  if (!ctx.orderBook) return null;
  return ctx.orderBook.bids.reduce((s, b) => s + b.qty, 0) + ctx.orderBook.asks.reduce((s, a) => s + a.qty, 0);
}

export function classifyMarketRegime(ctx: OracleContext, confluence: ConfluenceResult): { regime: MarketRegime; evidence: string } {
  const structure = confluence.factors.find((f) => f.source === "market_structure");
  const footprint = confluence.factors.find((f) => f.source === "footprint");
  const tpo = confluence.factors.find((f) => f.source === "tpo");

  if (!structure || structure.quality === "unavailable") {
    return { regime: "UNAVAILABLE", evidence: "Market Structure data tidak tersedia — regime tidak bisa diklasifikasi." };
  }

  const vol = atrPercent(ctx);
  if (vol !== null && vol >= 3.5) {
    return { regime: "HIGH_VOLATILITY", evidence: `ATR 15-candle ≈ ${vol.toFixed(2)}% dari harga — volatilitas jauh di atas normal.` };
  }

  const depth = orderBookDepthTotal(ctx);
  if (depth !== null && depth > 0 && depth < 5) {
    return { regime: "LOW_LIQUIDITY", evidence: `Total depth order book (top level) hanya ${depth.toFixed(2)} unit — likuiditas tipis, slippage risk tinggi.` };
  }

  const structureStrong = Math.max(structure.longWeight, structure.shortWeight) >= 8;
  const structureSide = structure.longWeight > structure.shortWeight ? "LONG" : structure.shortWeight > structure.longWeight ? "SHORT" : null;

  // BREAKOUT: structure AND TPO agree the same direction, both firing meaningfully.
  if (tpo && tpo.quality !== "unavailable" && structureSide) {
    const tpoSide = tpo.longWeight > tpo.shortWeight ? "LONG" : tpo.shortWeight > tpo.longWeight ? "SHORT" : null;
    if (tpoSide && tpoSide === structureSide && tpo.longWeight + tpo.shortWeight >= 7 && structureStrong) {
      return { regime: "BREAKOUT", evidence: `${structure.evidence} ${tpo.evidence}` };
    }
  }

  // ABSORPTION: footprint firing strongly one direction while structure stays flat — aggression not translating into structural movement.
  if (footprint && footprint.quality === "real") {
    const footprintStrong = Math.max(footprint.longWeight, footprint.shortWeight) >= 8;
    if (footprintStrong && !structureStrong) {
      return { regime: "ABSORPTION", evidence: `${footprint.evidence} Namun struktur harga tidak banyak bergerak — indikasi absorpsi.` };
    }
  }

  if (structureStrong && structureSide) {
    return { regime: "TRENDING", evidence: structure.evidence };
  }

  return { regime: "RANGING", evidence: structure.quality === "real" ? structure.evidence : "Tidak ada arah dominan yang cukup kuat dari struktur pasar saat ini." };
}
