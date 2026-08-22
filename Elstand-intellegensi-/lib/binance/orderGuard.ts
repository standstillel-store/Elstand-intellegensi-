import { randomUUID } from "crypto";
import { hasRecentDuplicate } from "./db";
import type { OrderSide } from "./types";

// ---------------------------------------------------------------------------
// "Prevent duplicate orders. Prevent infinite loops. Prevent accidental
// double entry." — three separate failure modes, three separate guards:
//   1. generateClientOrderId: every order gets a unique, traceable ID so a
//      retried network request can never silently create two fills.
//   2. assertNoDuplicateEntry: blocks a second *manual* opening order for
//      the same symbol/side/type within a short window (double-click /
//      double-submit protection). Closing orders are never blocked here.
//   3. In-process per-symbol mutex (below): blocks two order placements for
//      the same symbol from racing each other within one server instance —
//      the auto-trader's per-tick loop and a concurrent manual action can't
//      both slip through between the "check position" and "place order"
//      steps.
// ---------------------------------------------------------------------------

const DUPLICATE_WINDOW_MS = 4_000; // covers double-click / accidental double-submit, not legitimate re-entries

export function generateClientOrderId(prefix: "el" | "auto" | "emg" = "el"): string {
  // Binance caps newClientOrderId at 36 chars — keep this comfortably under.
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 28)}`;
}

export async function assertNoDuplicateEntry(symbol: string, side: OrderSide, orderType: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const duplicate = await hasRecentDuplicate(symbol, side, orderType, DUPLICATE_WINDOW_MS);
  if (duplicate) {
    return { ok: false, reason: `Order ${side} ${orderType} untuk ${symbol} baru saja dikirim beberapa detik lalu — ditolak untuk mencegah double entry.` };
  }
  return { ok: true };
}

const symbolLocks = new Map<string, Promise<void>>();

/**
 * Runs `fn` while holding an in-process lock on `symbol`, queuing any
 * concurrent caller behind it instead of letting two order placements for
 * the same symbol interleave. Not a substitute for Binance's own
 * order-matching safety, but closes the "two requests both read
 * no-open-position and both place an entry" race within this server
 * instance — the most likely source of an accidental doubled position size.
 */
export async function withSymbolLock<T>(symbol: string, fn: () => Promise<T>): Promise<T> {
  const key = symbol.toUpperCase();
  const previous = symbolLocks.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  symbolLocks.set(
    key,
    previous.then(() => current)
  );
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (symbolLocks.get(key) === previous.then(() => current)) {
      symbolLocks.delete(key);
    }
  }
}
