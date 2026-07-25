"use client";
import { useEffect, useState, type ReactNode } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatUsd, formatPct } from "@/lib/format";
import { MAX_RISK_PERCENT_CLIENT } from "@/lib/binance/constantsClient";
import type { EngineOrderType, RiskCalculationResult, BinanceMarket } from "@/lib/binance/types";

const ALL_ORDER_TYPES: { value: EngineOrderType; label: string; futuresOnly?: boolean }[] = [
  { value: "MARKET", label: "Market" },
  { value: "LIMIT", label: "Limit" },
  { value: "STOP", label: "Stop (Stop-Limit)" },
  { value: "STOP_MARKET", label: "Stop Market" },
  { value: "TAKE_PROFIT", label: "Take Profit (Limit)" },
  { value: "TAKE_PROFIT_MARKET", label: "Take Profit Market" },
  { value: "TRAILING_STOP_MARKET", label: "Trailing Stop", futuresOnly: true },
];

const WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "w-full rounded-md border border-line bg-bg-raised px-2.5 py-1.5 text-sm text-ink focus:border-signal/50 focus:outline-none";

export function OrderPanel({
  defaultSymbol,
  market,
  onSymbolChange,
  onPlaceOrder,
  onCalculateRisk,
}: {
  defaultSymbol: string;
  market: BinanceMarket;
  onSymbolChange: (symbol: string) => void;
  onPlaceOrder: (body: {
    symbol: string;
    direction?: "LONG" | "SHORT";
    side?: "BUY" | "SELL";
    type: EngineOrderType;
    quantity?: number;
    riskPercent?: number;
    price?: number;
    stopPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    takeProfit2?: number;
    leverage?: number;
    marginType?: "ISOLATED" | "CROSSED";
    callbackRate?: number;
    activationPrice?: number;
    reduceOnly?: boolean;
  }) => Promise<boolean>;
  onCalculateRisk: (body: { symbol: string; entryPrice: number; stopPrice: number; side: "LONG" | "SHORT"; riskPercent: number; leverage: number }) => Promise<
    (RiskCalculationResult & { accountEquity: number }) | null
  >;
}) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [orderType, setOrderType] = useState<EngineOrderType>("MARKET");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [sizeMode, setSizeMode] = useState<"risk" | "manual">("risk");
  const [riskPercent, setRiskPercent] = useState("1");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [entryEstimate, setEntryEstimate] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [takeProfit2, setTakeProfit2] = useState("");
  const [leverage, setLeverage] = useState("5");
  const [marginType, setMarginType] = useState<"ISOLATED" | "CROSSED">("ISOLATED");
  const [callbackRate, setCallbackRate] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [riskPreview, setRiskPreview] = useState<(RiskCalculationResult & { accountEquity: number }) | null>(null);

  const isEntry = orderType === "MARKET" || orderType === "LIMIT";
  const needsPrice = orderType === "LIMIT" || orderType === "STOP" || orderType === "TAKE_PROFIT";
  const needsStopPrice = orderType === "STOP" || orderType === "STOP_MARKET" || orderType === "TAKE_PROFIT" || orderType === "TAKE_PROFIT_MARKET";
  const isTrailing = orderType === "TRAILING_STOP_MARKET";
  const isFutures = market === "futures";
  const availableOrderTypes = ALL_ORDER_TYPES.filter((t) => isFutures || !t.futuresOnly);

  useEffect(() => {
    if (!isFutures && isTrailing) setOrderType("MARKET");
  }, [isFutures, isTrailing]);

  useEffect(() => {
    onSymbolChange(symbol);
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live risk preview whenever the sizing inputs change, for entry orders sized by risk.
  useEffect(() => {
    if (!isEntry || sizeMode !== "risk") {
      setRiskPreview(null);
      return;
    }
    const entry = Number(entryEstimate) || Number(price);
    const sl = Number(stopLoss);
    const rp = Number(riskPercent);
    const lev = isFutures ? Number(leverage) || 1 : 1;
    if (!entry || !sl || !rp) {
      setRiskPreview(null);
      return;
    }
    const handle = setTimeout(async () => {
      const result = await onCalculateRisk({ symbol, entryPrice: entry, stopPrice: sl, side: direction, riskPercent: rp, leverage: lev });
      setRiskPreview(result);
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntry, sizeMode, entryEstimate, price, stopLoss, riskPercent, leverage, symbol, direction, isFutures]);

  async function submit() {
    setFeedback(null);
    setSubmitting(true);
    const body: Parameters<typeof onPlaceOrder>[0] = { symbol, type: orderType };

    if (isEntry && isFutures) {
      body.direction = direction;
      if (orderType === "LIMIT") body.price = Number(price) || undefined;
      if (sizeMode === "risk") {
        body.riskPercent = Number(riskPercent);
        body.stopLoss = Number(stopLoss) || undefined;
      } else {
        body.quantity = Number(quantity) || undefined;
        body.stopLoss = Number(stopLoss) || undefined;
      }
      body.takeProfit = Number(takeProfit) || undefined;
      body.takeProfit2 = Number(takeProfit2) || undefined;
      body.leverage = Number(leverage) || undefined;
      body.marginType = marginType;
    } else if (isEntry && !isFutures) {
      // Spot Market/Limit is a plain buy/sell — no leveraged position to attach an SL/TP
      // bracket to. Size either manually or by risk % (still meaningful: risk = |entry-stop|
      // × qty even unleveraged), then place separate Stop/Take-Profit orders afterward if wanted.
      body.side = direction === "LONG" ? "BUY" : "SELL";
      if (orderType === "LIMIT") body.price = Number(price) || undefined;
      if (sizeMode === "risk") {
        body.riskPercent = Number(riskPercent);
        body.stopPrice = Number(stopLoss) || undefined; // reused as the risk-sizing reference stop, not an order trigger here
      } else {
        body.quantity = Number(quantity) || undefined;
      }
    } else {
      // Standalone Stop/Stop-Market/Take-Profit/Trailing-Stop orders from this panel manage
      // an existing position or holding (protective/exit orders) — never a fresh entry — so
      // they default reduceOnly on Futures (Spot has no reduceOnly concept; a Spot sell is
      // just a sell). The side is the closing side for the selected direction.
      body.side = direction === "LONG" ? "SELL" : "BUY";
      if (isFutures) body.reduceOnly = true;
      body.quantity = Number(quantity) || undefined;
      if (needsPrice) body.price = Number(price) || undefined;
      if (needsStopPrice) body.stopPrice = Number(stopPrice) || undefined;
      if (isTrailing) {
        body.callbackRate = Number(callbackRate) || undefined;
        body.quantity = Number(quantity) || undefined;
      }
    }

    const ok = await onPlaceOrder(body);
    setFeedback(ok ? "Order berhasil dikirim." : "Order gagal — lihat pesan error di atas.");
    setSubmitting(false);
  }

  return (
    <div className="glow-card p-4">
      <SectionHeader code="ORP" title="Order Panel" hint={symbol} />

      <div className="space-y-3">
        <Field label="Symbol">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputClass}>
            {WATCHLIST.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDirection("LONG")}
            className={`rounded-md border py-2 text-sm font-bold tracking-wide ${direction === "LONG" ? "border-up bg-up/15 text-up" : "border-line text-ink-muted"}`}
          >
            {isFutures ? "LONG" : "BUY"}
          </button>
          <button
            onClick={() => setDirection("SHORT")}
            className={`rounded-md border py-2 text-sm font-bold tracking-wide ${direction === "SHORT" ? "border-down bg-down/15 text-down" : "border-line text-ink-muted"}`}
          >
            {isFutures ? "SHORT" : "SELL"}
          </button>
        </div>

        <Field label="Order Type">
          <select value={orderType} onChange={(e) => setOrderType(e.target.value as EngineOrderType)} className={inputClass}>
            {availableOrderTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        {needsPrice && (
          <Field label="Price">
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} placeholder="Limit price" />
          </Field>
        )}
        {needsStopPrice && (
          <Field label="Stop / Trigger Price">
            <input type="number" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} className={inputClass} placeholder="Trigger price" />
          </Field>
        )}
        {isTrailing && (
          <Field label="Callback Rate (%)">
            <input type="number" step="0.1" min="0.1" max="5" value={callbackRate} onChange={(e) => setCallbackRate(e.target.value)} className={inputClass} />
          </Field>
        )}

        {isEntry && (
          <>
            <div className="flex gap-2 text-[11px]">
              <button
                onClick={() => setSizeMode("risk")}
                className={`flex-1 rounded-md border py-1.5 ${sizeMode === "risk" ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted"}`}
              >
                Size by Risk %
              </button>
              <button
                onClick={() => setSizeMode("manual")}
                className={`flex-1 rounded-md border py-1.5 ${sizeMode === "manual" ? "border-signal bg-signal/10 text-ink" : "border-line text-ink-muted"}`}
              >
                Manual Quantity
              </button>
            </div>

            {sizeMode === "risk" ? (
              <Field label={`Risk per Trade (% — max ${MAX_RISK_PERCENT_CLIENT}%)`}>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  max={MAX_RISK_PERCENT_CLIENT}
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(e.target.value)}
                  className={inputClass}
                />
              </Field>
            ) : (
              <Field label="Quantity">
                <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
              </Field>
            )}

            {orderType === "MARKET" && sizeMode === "risk" && (
              <Field label="Current Price Estimate (for risk preview)">
                <input type="number" value={entryEstimate} onChange={(e) => setEntryEstimate(e.target.value)} className={inputClass} placeholder="cth. 65000" />
              </Field>
            )}

            <Field label={isFutures ? "Stop Loss (wajib untuk sizing by risk)" : "Reference Stop (untuk sizing by risk)"}>
              <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className={inputClass} />
            </Field>
            {isFutures && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Take Profit 1">
                    <input type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Take Profit 2 (opsional)">
                    <input type="number" value={takeProfit2} onChange={(e) => setTakeProfit2(e.target.value)} className={inputClass} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Leverage">
                    <input type="number" min="1" max="125" value={leverage} onChange={(e) => setLeverage(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Margin Type">
                    <select value={marginType} onChange={(e) => setMarginType(e.target.value as "ISOLATED" | "CROSSED")} className={inputClass}>
                      <option value="ISOLATED">Isolated</option>
                      <option value="CROSSED">Cross</option>
                    </select>
                  </Field>
                </div>
              </>
            )}
            {!isFutures && (
              <p className="text-[11px] text-ink-faint">
                Spot tidak punya posisi berleverage untuk melekatkan bracket SL/TP otomatis — setelah order ini terisi, pasang Stop/Take Profit terpisah lewat
                tipe order di atas.
              </p>
            )}
          </>
        )}

        {!isEntry && (
          <Field label="Quantity">
            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
          </Field>
        )}

        {riskPreview && (
          <div className={`rounded-md border p-3 text-xs ${riskPreview.ok ? "border-signal/30 bg-signal/5" : "border-down/40 bg-down/10"}`}>
            {riskPreview.ok ? (
              <div className="grid grid-cols-2 gap-y-1">
                <span className="text-ink-faint">Quantity</span>
                <span className="mono-num text-right text-ink">{riskPreview.quantity}</span>
                <span className="text-ink-faint">Notional</span>
                <span className="mono-num text-right text-ink">{formatUsd(riskPreview.notional)}</span>
                <span className="text-ink-faint">Margin Required</span>
                <span className="mono-num text-right text-ink">{formatUsd(riskPreview.marginRequired)}</span>
                <span className="text-ink-faint">Max Loss</span>
                <span className="mono-num text-right text-down">
                  {formatUsd(riskPreview.maxLossUsd)} ({formatPct(riskPreview.maxLossPercent)})
                </span>
                {riskPreview.liquidationPrice && (
                  <>
                    <span className="text-ink-faint">Est. Liquidation</span>
                    <span className="mono-num text-right text-amber">{formatUsd(riskPreview.liquidationPrice)}</span>
                  </>
                )}
              </div>
            ) : (
              <p className="text-down">{riskPreview.reason}</p>
            )}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className={`w-full rounded-md py-2.5 text-sm font-bold tracking-wide disabled:opacity-50 ${
            direction === "LONG" ? "bg-up text-bg hover:bg-up/90" : "bg-down text-bg hover:bg-down/90"
          }`}
        >
          {submitting
            ? "Mengirim…"
            : isEntry
              ? `${isFutures ? (direction === "LONG" ? "Open Long" : "Open Short") : direction === "LONG" ? "Buy" : "Sell"} — ${orderType}`
              : `Place ${orderType}`}
        </button>
        {feedback && <p className="text-center text-xs text-ink-muted">{feedback}</p>}
      </div>
    </div>
  );
}
