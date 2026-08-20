import { NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// DB_HEALTH — one-shot ground truth for "which Supabase project is the
// running server actually talking to, and can it actually see the tables it
// needs". Built specifically to short-circuit the failure mode where a
// human has to manually compare a project ref copied from Vercel env vars
// against a project ref copied from a Supabase dashboard tab — easy to get
// wrong, easy to be looking at a stale tab. This route asks the live
// server process directly instead.
//
// Safe to expose: NEXT_PUBLIC_SUPABASE_URL is already public (it's a
// NEXT_PUBLIC_ var, shipped to the browser bundle anyway). The service-role
// key itself is NEVER returned, only whether it's present.
// ---------------------------------------------------------------------------

async function checkTable(tableName: string) {
  const supabase = getSupabase();
  if (!supabase) return { table: tableName, ok: false, error: "Supabase client not configured." };
  try {
    const { count, error } = await supabase.from(tableName).select("*", { count: "exact", head: true });
    if (error) return { table: tableName, ok: false, error: error.message };
    return { table: tableName, ok: true, rowCount: count ?? null };
  } catch (err) {
    return { table: tableName, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  // Extract just the project ref (the xxxxx in https://xxxxx.supabase.co)
  // so this is easy to eyeball-compare against a Supabase dashboard URL
  // without a human having to paste the whole string somewhere to diff it.
  const projectRef = url ? url.replace(/^https?:\/\//, "").split(".")[0] : null;

  const [marketHistory, bnTradeTicks, marketHistoryMeta] = await Promise.all([
    checkTable("market_history"),
    checkTable("bn_trade_ticks"),
    checkTable("market_history_meta"),
  ]);

  const allOk = marketHistory.ok && bnTradeTicks.ok;

  return NextResponse.json({
    // What the RUNNING deployment actually has configured — not what a
    // human remembers setting, not what's in a stale browser tab.
    supabaseConfigured: isSupabaseConfigured(),
    supabaseProjectRef: projectRef,
    serviceRoleKeyPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    environment: process.env.VERCEL_ENV ?? null,
    checkedAt: new Date().toISOString(),
    tables: { marketHistory, bnTradeTicks, marketHistoryMeta },
    summary: allOk
      ? "OK — server can see both market_history and bn_trade_ticks in the connected Supabase project."
      : "BROKEN — server cannot see one or more required tables. Compare supabaseProjectRef above against the Supabase dashboard project you're inspecting; if they don't match, that's the whole bug. If they DO match, the tables genuinely don't exist (or the schema cache needs a reload) in that exact project.",
  });
}
