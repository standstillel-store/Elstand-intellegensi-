import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { AiStatistics } from "@/lib/elvoid/types";

const DEFAULT_STATS: AiStatistics = {
  total_trade: 0,
  wins: 0,
  losses: 0,
  win_rate: 0,
  average_rr: 0,
  profit_factor: 0,
  max_drawdown: 0,
  total_profit: 0,
  updated_at: new Date(0).toISOString(),
};

export async function GET() {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ stats: DEFAULT_STATS, configured: false });
  const { data } = await sb.from("ai_statistics").select("*").eq("id", 1).maybeSingle();
  return NextResponse.json({ stats: data ?? DEFAULT_STATS, configured: true });
}
