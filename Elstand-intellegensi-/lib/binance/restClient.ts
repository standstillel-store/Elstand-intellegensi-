import { getBinanceConfig, type BinanceConfig } from "./config";
import { buildSignedQuery, toQueryString, redactQueryForLog } from "./signer";
import { BinanceRequestError } from "./types";

// ---------------------------------------------------------------------------
// A thin, purpose-built REST client for Binance's Spot/Futures Testnet+Live
// APIs. No external HTTP library — same "no black box" spirit as the rest
// of this codebase (see lib/binance.ts, lib/elvoid/indicators.ts). Three
// request kinds, matching Binance's own docs:
//   - PUBLIC:  no key needed (klines, order book, ticker)
//   - SIGNED:  API key header + HMAC signature (account, orders, trades)
//   - USER:    API key header only, no signature (rarely needed here)
// ---------------------------------------------------------------------------

export type HttpMethod = "GET" | "POST" | "DELETE" | "PUT";

export interface RequestOptions {
  method?: HttpMethod;
  params?: Record<string, string | number | boolean | undefined | null>;
  signed?: boolean;
  /** Overrides the client's configured base URL for this one call — used by /api/binance/status for connectivity probes. */
  baseUrlOverride?: string;
  /** AbortSignal timeout in ms. Defaults to 10s — Binance Testnet can be slow. */
  timeoutMs?: number;
}

export interface BinanceCallMeta {
  latencyMs: number;
  url: string;
}

let lastCallMeta: BinanceCallMeta | null = null;
export function getLastCallMeta(): BinanceCallMeta | null {
  return lastCallMeta;
}

/**
 * Core request function. Every Binance call in this codebase — spot,
 * futures, public, signed — funnels through here so signing, error
 * normalization, timeouts, and log redaction only need to be right once.
 */
export async function binanceRequest<T>(path: string, options: RequestOptions = {}, cfg: BinanceConfig = getBinanceConfig()): Promise<T> {
  const { method = "GET", params = {}, signed = false, baseUrlOverride, timeoutMs = 10_000 } = options;

  if (signed && !cfg.configured) {
    throw new BinanceRequestError(
      "Binance API key/secret belum dikonfigurasi. Set BINANCE_API_KEY dan BINANCE_SECRET_KEY di environment.",
      -1,
      401
    );
  }

  const base = (baseUrlOverride ?? cfg.baseUrl).replace(/\/$/, "");
  const queryString = signed ? buildSignedQuery(params, cfg.secretKey, cfg.recvWindow) : toQueryString(params);
  const url = queryString ? `${base}${path}?${queryString}` : `${base}${path}`;

  const headers: Record<string, string> = {};
  if (signed || cfg.apiKey) {
    headers["X-MBX-APIKEY"] = cfg.apiKey;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    lastCallMeta = { latencyMs, url: `${base}${path}` };

    const text = await res.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      const errBody = (body ?? {}) as { code?: number; msg?: string };
      const msg = errBody.msg || `Binance ${method} ${path} failed with HTTP ${res.status}`;
      console.error(`[ElVoid AI][Binance] ${method} ${path} -> ${res.status} ${msg} | query=${redactQueryForLog(queryString)}`);
      throw new BinanceRequestError(msg, errBody.code ?? res.status, res.status);
    }

    return body as T;
  } catch (err) {
    if (err instanceof BinanceRequestError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new BinanceRequestError(`Binance ${method} ${path} timed out after ${timeoutMs}ms.`, -2, 504);
    }
    const message = err instanceof Error ? err.message : "Unknown Binance network error";
    console.error(`[ElVoid AI][Binance] ${method} ${path} network error: ${message}`);
    throw new BinanceRequestError(message, -3, 502);
  } finally {
    clearTimeout(timer);
  }
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : fallback;
}
