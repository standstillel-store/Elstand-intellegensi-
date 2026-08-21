import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// DATA ENGINE Supabase client — separate project from lib/supabase.ts (CORE).
// Holds only the market-data layer: market_history (footprint / volume
// profile / liquidity / TPO) and bn_trade_ticks (raw whale/tick data). Split
// out from CORE because this data is stateless/re-derivable from Binance and
// grows independently (bn_trade_ticks alone can hit several hundred MB —
// see the STORAGE WARNING in supabase/data-engine-schema.sql), so it gets
// its own storage quota instead of competing with user/auth data.
//
// Same "everything degrades gracefully" contract as lib/supabase.ts: every
// caller checks getDataSupabase() for null first and falls back to an empty
// list instead of throwing. Server-only — never import from a "use client"
// component.

let client: SupabaseClient | null | undefined;

const FETCH_TIMEOUT_MS = 8_000;

/** Supabase-js has no default fetch timeout — an unreachable/misconfigured DATA_SUPABASE_URL (wrong project, wrong region, DNS issue) would otherwise hang every DB call indefinitely. This matters a lot here: it's indistinguishable from an RPC hang from the outside (see AUDIT.md — identical curl timeouts persisted across three different BSC RPC providers AND after fixing CoinGecko's own missing timeout, which is what pointed at Supabase next). */
function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function isDataSupabaseConfigured(): boolean {
  return Boolean(process.env.DATA_SUPABASE_URL && process.env.DATA_SUPABASE_SERVICE_ROLE_KEY);
}

export function getDataSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.DATA_SUPABASE_URL;
  const key = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    client = null;
    return client;
  }
  client = createClient(url, key, { auth: { persistSession: false }, global: { fetch: timeoutFetch } });
  return client;
}
