"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PositionInfo,
  OpenOrderInfo,
  OrderResult,
  RiskCalculationResult,
  EngineOrderType,
  BinanceMode,
  BinanceMarket,
} from "@/lib/binance/types";
import type { PositionMeta } from "@/lib/binance/db";

export type PositionRow = PositionInfo & { meta: PositionMeta | null };

// ---------------------------------------------------------------------------
// Single source of truth for the Trading Dashboard's live state. Every
// panel (positions, orders, account, auto-trader, emergency controls)
// reads from here instead of fetching independently, so a manual action
// (placing an order, closing a position) can trigger one shared refresh
// instead of each panel guessing when to refetch.
// ---------------------------------------------------------------------------

export interface StatusState {
  connected: boolean;
  configured: boolean;
  mode: BinanceMode;
  market: BinanceMarket;
  serverTime?: number;
  latencyMs?: number;
  clockDriftMs?: number;
  emergencyStopped: boolean;
  persistenceConfigured: boolean;
  error?: string;
}

export interface AutoTraderSettingsState {
  enabled: boolean;
  symbols: string[];
  timeframe: string;
  risk_percent: number;
  leverage: number;
  min_confluences: number;
  min_risk_reward: number;
  max_risk_reward: number;
  max_concurrent_positions: number;
  cooldown_minutes: number;
  running: boolean;
  last_run_at: string | null;
}

export interface DecisionLogRow {
  id: string;
  ran_at: string;
  action: string;
  symbol?: string;
  side?: string;
  detail: string;
  meta?: Record<string, unknown>;
}

export interface AccountSummary {
  totalWalletBalance: number;
  totalMarginBalance: number;
  totalUnrealizedProfit: number;
  availableMargin: number;
  usedMargin: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: body?.error ?? `Request gagal (${res.status}).` };
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Koneksi gagal." };
  }
}

export function useBinanceTrading() {
  const [status, setStatus] = useState<StatusState | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrderInfo[]>([]);
  const [autoTrader, setAutoTrader] = useState<AutoTraderSettingsState | null>(null);
  const [decisionLog, setDecisionLog] = useState<DecisionLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    const { data } = await fetchJson<StatusState>("/api/binance/status");
    if (mounted.current && data) setStatus(data);
  }, []);

  const refreshAccount = useCallback(async () => {
    const { data } = await fetchJson<{ summary: AccountSummary }>("/api/binance/account");
    if (mounted.current && data) setAccount(data.summary);
  }, []);

  const refreshPositions = useCallback(async () => {
    const { data } = await fetchJson<{ positions: PositionRow[] }>("/api/binance/positions");
    if (mounted.current && data) setPositions(data.positions);
  }, []);

  const refreshOrders = useCallback(async () => {
    const { data } = await fetchJson<{ orders: OpenOrderInfo[] }>("/api/binance/orders?status=open");
    if (mounted.current && data) setOpenOrders(data.orders);
  }, []);

  const refreshAutoTrader = useCallback(async () => {
    const { data } = await fetchJson<{ settings: AutoTraderSettingsState }>("/api/binance/auto-trade");
    if (mounted.current && data) setAutoTrader(data.settings);
  }, []);

  const refreshDecisionLog = useCallback(async () => {
    const { data } = await fetchJson<{ decisions: DecisionLogRow[] }>("/api/binance/auto-trade/log?limit=60");
    if (mounted.current && data) setDecisionLog(data.decisions);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshAccount(), refreshPositions(), refreshOrders(), refreshAutoTrader(), refreshDecisionLog()]);
    if (mounted.current) setLoading(false);
  }, [refreshStatus, refreshAccount, refreshPositions, refreshOrders, refreshAutoTrader, refreshDecisionLog]);

  useEffect(() => {
    refreshAll();
    const fast = setInterval(() => {
      refreshPositions();
      refreshOrders();
    }, 6_000);
    const medium = setInterval(() => {
      refreshAccount();
      refreshStatus();
    }, 12_000);
    const slow = setInterval(() => {
      refreshAutoTrader();
      refreshDecisionLog();
    }, 20_000);
    // The AI Auto Trading "every minute" heartbeat. Vercel Cron can also
    // hit /api/binance/auto-trade/tick server-side (see vercel.json), but
    // that requires a Pro plan for per-minute cadence — this client-side
    // tick works on any hosting/plan as long as the dashboard tab is open,
    // and is what keeps Auto Trading progressing out of the box.
    const tick = setInterval(() => {
      fetchJson("/api/binance/auto-trade/tick", { method: "POST" }).then(() => {
        refreshDecisionLog();
        refreshPositions();
        refreshAccount();
      });
    }, 60_000);
    return () => {
      clearInterval(fast);
      clearInterval(medium);
      clearInterval(slow);
      clearInterval(tick);
    };
  }, [refreshAll, refreshPositions, refreshOrders, refreshAccount, refreshStatus, refreshAutoTrader, refreshDecisionLog]);

  // --- actions ---------------------------------------------------------

  async function runAction<T>(fn: () => Promise<{ data: T | null; error: string | null }>): Promise<boolean> {
    setActionError(null);
    const { data, error } = await fn();
    if (error) {
      setActionError(error);
      return false;
    }
    void data;
    await Promise.all([refreshPositions(), refreshOrders(), refreshAccount()]);
    return true;
  }

  const placeOrder = useCallback(
    (body: {
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
      closePosition?: boolean;
      market?: BinanceMarket;
    }) => runAction<OrderResult>(() => fetchJson("/api/binance/order", { method: "POST", body: JSON.stringify(body) })),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const cancelOrder = useCallback(
    (symbol: string, orderId: number) => runAction(() => fetchJson(`/api/binance/order?symbol=${symbol}&orderId=${orderId}`, { method: "DELETE" })),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const closePosition = useCallback(
    (symbol: string, percent?: number) => runAction(() => fetchJson("/api/binance/position/close", { method: "POST", body: JSON.stringify({ symbol, percent }) })),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const closeAllPositions = useCallback(
    (reason?: string) => runAction(() => fetchJson("/api/binance/position/close-all", { method: "POST", body: JSON.stringify({ reason }) })),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setTrailingStop = useCallback(
    (symbol: string, callbackRate: number, activationPrice?: number) =>
      runAction(() => fetchJson("/api/binance/trailing-stop", { method: "POST", body: JSON.stringify({ symbol, callbackRate, activationPrice }) })),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const moveToBreakeven = useCallback(
    (symbol: string) => runAction(() => fetchJson("/api/binance/breakeven", { method: "POST", body: JSON.stringify({ symbol }) })),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setLeverage = useCallback(
    (symbol: string, leverage: number, marginType?: "ISOLATED" | "CROSSED") =>
      runAction(() => fetchJson("/api/binance/leverage", { method: "POST", body: JSON.stringify({ symbol, leverage, marginType }) })),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const calculateRisk = useCallback(
    async (body: { symbol: string; entryPrice: number; stopPrice: number; side: "LONG" | "SHORT"; riskPercent: number; leverage: number }) => {
      const { data, error } = await fetchJson<RiskCalculationResult & { accountEquity: number; maxRiskPercent: number }>("/api/binance/risk/calculate", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (error) setActionError(error);
      return data;
    },
    []
  );

  const updateAutoTraderSettings = useCallback(
    async (patch: Partial<AutoTraderSettingsState>) => {
      const ok = await runAction(() => fetchJson("/api/binance/auto-trade", { method: "PATCH", body: JSON.stringify(patch) }));
      await refreshAutoTrader();
      return ok;
    },
    [refreshAutoTrader] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const runTickNow = useCallback(async () => {
    const ok = await runAction(() => fetchJson("/api/binance/auto-trade/tick", { method: "POST" }));
    await refreshDecisionLog();
    return ok;
  }, [refreshDecisionLog]); // eslint-disable-line react-hooks/exhaustive-deps

  const setEmergencyStop = useCallback(
    async (stopped: boolean, reason?: string) => {
      const ok = await runAction(() => fetchJson("/api/binance/emergency-stop", { method: "POST", body: JSON.stringify({ stopped, reason }) }));
      await refreshStatus();
      return ok;
    },
    [refreshStatus] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return {
    status,
    account,
    positions,
    openOrders,
    autoTrader,
    decisionLog,
    loading,
    actionError,
    clearActionError: () => setActionError(null),
    refreshAll,
    placeOrder,
    cancelOrder,
    closePosition,
    closeAllPositions,
    setTrailingStop,
    moveToBreakeven,
    setLeverage,
    calculateRisk,
    updateAutoTraderSettings,
    runTickNow,
    setEmergencyStop,
  };
}
