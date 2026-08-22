import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ElVoid AI Paper Trader persists signals, journal entries, statistics, and
// the paper wallet to Supabase (see supabase/schema.sql). Every caller in
// lib/elvoid/* checks getSupabase() for null first and degrades to an empty
// list / default value instead of throwing — same "everything degrades
// gracefully" rule the rest of ElVoid AI's data sources already follow (see
// lib/alchemy.ts, lib/newsapi.ts). Until the two env vars below are set,
// Paper Trader still renders and generates signals, it just can't remember
// anything between requests.

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Server-only client using the service-role key (bypasses RLS by design —
 * see the note in supabase/schema.sql). Never import this from a "use
 * client" component; it should only ever be reached from Server Components
 * or Route Handlers.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    client = null;
    return client;
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
