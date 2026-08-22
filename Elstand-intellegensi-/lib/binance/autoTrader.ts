import { getBinanceConfig, type BinanceConfig } from "./config";
import * as futures from "./futuresClient";
import { buildGatedSignal, fetchTradingCandles } from "./signalBridge";
import { evaluateExitConditions, buildNewsWindow } from "./exitConditions";
import { openPosition, closePosition, moveStopToBreakeven } from "./tradingEngine";
import { blocksNewEntry } from "./newsGate";
import {
  getAutoTraderSettings,
  getDefaultAutoTraderSettings,
  acquireTickLock,
  releaseTickLock,
  logDecision,
  getEmergencyStop,
  getPositionMeta,
  type AutoTraderSettings,
} from "./db";
import { buildScanContext } from "../elvoid/service";

// ---------------------------------------------------------------------------
// One call to runAutoTraderTick() = one full pass of:
//   Analyze Market -> Generate Signal -> (gate) -> Open Position
//   Monitor Trade -> (gate) -> Modify / Close Position
// exactly the "Auto Trading: every minute" and "Trade Monitor: every
// minute" requirements. Intended to be invoked by Vercel Cron once a
// minute (see vercel.json + app/api/binance/auto-trade/tick/route.ts) and
// also callable on demand from the dashboard for an immediate read.
// ---------------------------------------------------------------------------

export interface TickSummary {
  ranAt: string;
  enabled: boolean;
  emergencyStopped: boolean;
  symbolsScanned: string[];
  entriesOpened: string[];
  positionsClosed: string[];
  breakevensSet: string[];
  skipped: { symbol: string; reason: string }[];
  errors: { symbol: string; reason: string }[];
}

async function monitorOpenPosition(
  symbol: string,
  side: "LONG" | "SHORT",
  settings: AutoTraderSettings,
  newsWindow: Awaited<ReturnType<typeof buildNewsWindow>>,
  cfg: BinanceConfig
): Promise<{ closed: boolean; breakevenSet: boolean; note: string }> {
  const [positions, klines, meta] = await Promise.all([
    futures.getPositions(cfg, symbol),
    fetchTradingCandles(symbol, settings.timeframe, 120, cfg),
    getPositionMeta(symbol),
  ]);
  const position = positions[0];
  if (!position) return { closed: false, breakevenSet: false, note: "Posisi sudah tidak ada (mungkin sudah tersentuh SL/TP)." };
  if (klines.length < 30) return { closed: false, breakevenSet: false, note: "Data candle belum cukup untuk monitor." };

  const account = await futures.getFuturesAccount(cfg);
  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const trueRanges = closes.map((_, i) => (i === 0 ? highs[0] - lows[0] : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))));
  const lastAtr = trueRanges.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, trueRanges.length);

  const evaluation = evaluateExitConditions({
    klines,
    side,
    currentEquity: account.totalMarginBalance,
    positionQty: position.positionAmt,
    entryPrice: position.entryPrice,
    protectiveStop: meta?.initial_stop ?? null,
    newsWindow,
    lastAtr,
  });

  if (evaluation.shouldExit) {
    const result = await closePosition(symbol, { source: "auto_trader", reason: evaluation.triggeredReasons.join("; ") }, cfg);
    await logDecision({
      action: result.ok ? "exit_auto" : "exit_failed",
      symbol,
      side,
      detail: result.ok ? `Auto Exit: ${evaluation.triggeredReasons.join(", ")}` : `Auto Exit gagal: ${result.reason}`,
      meta: { checks: evaluation.checks },
    });
    return { closed: result.ok, breakevenSet: false, note: evaluation.triggeredReasons.join(", ") };
  }

  // Move SL to breakeven once price has reached TP1 and it hasn't already been moved.
  if (meta && !meta.breakeven_moved && meta.tp1) {
    const reachedTp1 = side === "LONG" ? position.markPrice >= meta.tp1 : position.markPrice <= meta.tp1;
    if (reachedTp1) {
      const result = await moveStopToBreakeven(symbol, cfg);
      await logDecision({
        action: result.ok ? "breakeven_set" : "breakeven_failed",
        symbol,
        side,
        detail: result.ok ? "TP1 tercapai — SL dipindah ke breakeven." : `Gagal memindah SL ke breakeven: ${result.reason}`,
      });
      return { closed: false, breakevenSet: result.ok, note: "TP1 tercapai, breakeven diset." };
    }
  }

  return { closed: false, breakevenSet: false, note: "Posisi masih valid — semua Auto Exit check lolos." };
}

export async function runAutoTraderTick(cfg: BinanceConfig = getBinanceConfig()): Promise<TickSummary> {
  const ranAt = new Date().toISOString();
  const settings = (await getAutoTraderSettings()) ?? getDefaultAutoTraderSettings();
  const summary: TickSummary = {
    ranAt,
    enabled: settings.enabled,
    emergencyStopped: false,
    symbolsScanned: [],
    entriesOpened: [],
    positionsClosed: [],
    breakevensSet: [],
    skipped: [],
    errors: [],
  };

  if (!settings.enabled) return summary;

  if (cfg.market !== "futures") {
    await logDecision({
      action: "tick_skipped",
      detail: "AI Auto Trading butuh BINANCE_MARKET=futures (Long/Short, leverage, liquidation price adalah konsep Futures) — server ini terhubung ke Binance Spot.",
    });
    summary.skipped.push({ symbol: "*", reason: "BINANCE_MARKET=spot — Auto Trading nonaktif." });
    return summary;
  }

  const emergency = await getEmergencyStop();
  summary.emergencyStopped = emergency.stopped;

  const gotLock = await acquireTickLock();
  if (!gotLock) {
    await logDecision({ action: "tick_skipped", detail: "Tick sebelumnya masih berjalan — dilewati untuk mencegah tumpang tindih." });
    summary.skipped.push({ symbol: "*", reason: "Tick sebelumnya masih berjalan." });
    return summary;
  }

  try {
    const [newsWindow, sharedCtx, allPositions] = await Promise.all([buildNewsWindow(), buildScanContext(), futures.getPositions(cfg)]);
    const openSymbols = new Set(allPositions.map((p) => p.symbol));

    for (const symbol of settings.symbols) {
      summary.symbolsScanned.push(symbol);
      try {
        const existingPosition = allPositions.find((p) => p.symbol === symbol);

        if (existingPosition) {
          const result = await monitorOpenPosition(symbol, existingPosition.side, settings, newsWindow, cfg);
          if (result.closed) summary.positionsClosed.push(symbol);
          if (result.breakevenSet) summary.breakevensSet.push(symbol);
          continue;
        }

        if (emergency.stopped) {
          summary.skipped.push({ symbol, reason: "Emergency Stop aktif — entry baru ditahan." });
          continue;
        }
        if (openSymbols.size >= settings.max_concurrent_positions) {
          summary.skipped.push({ symbol, reason: `Sudah mencapai batas ${settings.max_concurrent_positions} posisi bersamaan.` });
          continue;
        }
        const newsBlock = blocksNewEntry(newsWindow);
        if (newsBlock.blocked) {
          await logDecision({ action: "skip_news", symbol, detail: newsBlock.reason ?? "Ditahan karena News." });
          summary.skipped.push({ symbol, reason: newsBlock.reason ?? "Ditahan karena News." });
          continue;
        }

        const gated = await buildGatedSignal(
          symbol,
          settings.timeframe,
          { minConfluences: settings.min_confluences, minRiskReward: settings.min_risk_reward, riskPercent: settings.risk_percent },
          sharedCtx,
          cfg
        );
        if (!gated) {
          summary.skipped.push({ symbol, reason: "Data tidak cukup untuk analisa." });
          continue;
        }
        if (!gated.passed) {
          await logDecision({
            action: "skip_no_trade",
            symbol,
            side: gated.signal.side,
            detail: gated.rejectReason ?? "NO TRADE.",
            meta: { confluences: gated.confluenceCount, rrTp1: gated.rrTp1, rrTp2: gated.rrTp2 },
          });
          summary.skipped.push({ symbol, reason: gated.rejectReason ?? "NO TRADE." });
          continue;
        }

        const { signal, confluenceCount, rrTp2 } = gated;
        const result = await openPosition(
          {
            symbol,
            direction: signal.side,
            orderType: "MARKET",
            riskPercent: settings.risk_percent,
            stopLoss: signal.sl,
            takeProfit: signal.tp1,
            takeProfit2: signal.tp2,
            takeProfitPercent: 50,
            leverage: settings.leverage,
            marginType: "ISOLATED",
            source: "auto_trader",
            strategy: signal.strategy,
            confluences: confluenceCount,
            riskReward: rrTp2,
            reason: signal.reason,
          },
          cfg
        );

        await logDecision({
          action: result.ok ? "entry_opened" : "entry_rejected",
          symbol,
          side: signal.side,
          detail: result.ok
            ? `${signal.strategy} — ${confluenceCount} confluence, RR 1:${rrTp2.toFixed(1)}, confidence ${signal.confidence}%.`
            : `Entry ditolak: ${result.reason}`,
          meta: { confluences: confluenceCount, rrTp2, confidence: signal.confidence, tradeGrade: signal.tradeGrade },
        });

        if (result.ok) {
          summary.entriesOpened.push(symbol);
          openSymbols.add(symbol);
        } else {
          summary.errors.push({ symbol, reason: result.reason ?? "Gagal membuka posisi." });
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Error tidak diketahui.";
        summary.errors.push({ symbol, reason });
        await logDecision({ action: "tick_error", symbol, detail: reason });
      }
    }
  } finally {
    await releaseTickLock();
  }

  return summary;
}
