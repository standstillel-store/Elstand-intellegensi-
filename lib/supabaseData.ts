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
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
