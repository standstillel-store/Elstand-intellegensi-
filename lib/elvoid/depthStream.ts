// ---------------------------------------------------------------------------
// Shared, ref-counted Binance Futures partial-depth WebSocket.
//
// Spec requirement: Order Book panel and Liquidity Heatmap must represent
// the SAME market state, and must not open redundant connections. This
// module is the single source of truth for live depth per symbol — every
// consumer (OrderBookPanel, LiquidityHeatmapEmbeddedChart) subscribes to
// the same underlying socket instead of polling REST or opening its own
// connection.
//
// Uses the public partial-book-depth stream (`<symbol>@depth20@500ms`),
// which Binance itself maintains as a top-N snapshot pushed every 500ms —
// this avoids the diff-stream + REST-snapshot resync dance a full
// `@depth` order-book replica would need, while still being genuine,
// exchange-maintained resting liquidity (not executed trades, not candle
// volume). No API key required.
// ---------------------------------------------------------------------------

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface DepthState {
  bids: DepthLevel[];
  asks: DepthLevel[];
  timestamp: number; // ms, client receive time (Binance partial-depth frames carry no server timestamp)
}

type Listener = (state: DepthState) => void;
type StatusListener = (status: "connecting" | "live" | "error") => void;

interface Channel {
  ws: WebSocket | null;
  listeners: Set<Listener>;
  statusListeners: Set<StatusListener>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  lastState: DepthState | null;
  closed: boolean;
}

const channels = new Map<string, Channel>();

function wsUrlFor(pair: string): string {
  return `wss://fstream.binance.com/ws/${pair.toLowerCase()}@depth20@500ms`;
}

function ensureChannel(pair: string): Channel {
  let ch = channels.get(pair);
  if (ch) return ch;
  ch = { ws: null, listeners: new Set(), statusListeners: new Set(), reconnectTimer: null, lastState: null, closed: false };
  channels.set(pair, ch);
  connect(pair, ch);
  return ch;
}

function connect(pair: string, ch: Channel) {
  if (ch.closed) return;
  ch.statusListeners.forEach((l) => l("connecting"));
  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrlFor(pair));
  } catch {
    ch.statusListeners.forEach((l) => l("error"));
    scheduleReconnect(pair, ch);
    return;
  }
  ch.ws = ws;
  ws.onopen = () => ch.statusListeners.forEach((l) => l("live"));
  ws.onerror = () => ch.statusListeners.forEach((l) => l("error"));
  ws.onclose = () => {
    if (ch.closed) return;
    scheduleReconnect(pair, ch);
  };
  ws.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data as string) as { b?: [string, string][]; a?: [string, string][] };
      if (!parsed.b || !parsed.a) return;
      const state: DepthState = {
        bids: parsed.b.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty) })).filter((l) => l.qty > 0),
        asks: parsed.a.map(([price, qty]) => ({ price: parseFloat(price), qty: parseFloat(qty) })).filter((l) => l.qty > 0),
        timestamp: Date.now(),
      };
      ch.lastState = state;
      ch.listeners.forEach((l) => l(state));
    } catch {
      // malformed frame — ignore, next frame arrives in <1s
    }
  };
}

function scheduleReconnect(pair: string, ch: Channel) {
  if (ch.reconnectTimer || ch.closed) return;
  ch.reconnectTimer = setTimeout(() => {
    ch.reconnectTimer = null;
    if (!ch.closed) connect(pair, ch);
  }, 3000);
}

/** Subscribe to live depth for a symbol (e.g. "BTC"). Returns an unsubscribe function. Opens the shared socket on first subscriber, tears it down when the last one leaves. */
export function subscribeDepth(symbol: string, onState: Listener, onStatus?: StatusListener): () => void {
  const pair = `${symbol.toUpperCase()}USDT`;
  const ch = ensureChannel(pair);
  ch.listeners.add(onState);
  if (onStatus) ch.statusListeners.add(onStatus);
  if (ch.lastState) onState(ch.lastState);

  return () => {
    ch.listeners.delete(onState);
    if (onStatus) ch.statusListeners.delete(onStatus);
    if (ch.listeners.size === 0 && ch.statusListeners.size === 0) {
      ch.closed = true;
      if (ch.reconnectTimer) clearTimeout(ch.reconnectTimer);
      ch.ws?.close();
      channels.delete(pair);
    }
  };
}
