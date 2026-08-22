import { NextResponse } from "next/server";
import { resolveBinanceConfig, getCredentialsStatus } from "@/lib/binance/credentials";
import { getServerTime, ping } from "@/lib/binance/marketData";
import { getLastCallMeta } from "@/lib/binance/restClient";
import { getEmergencyStop } from "@/lib/binance/db";
import { isSupabaseConfigured } from "@/lib/supabase";

export async function GET() {
  const cfg = await resolveBinanceConfig();
  const credentials = await getCredentialsStatus();
  const emergency = await getEmergencyStop();

  if (!cfg.configured) {
    return NextResponse.json({
      connected: false,
      configured: false,
      mode: cfg.mode,
      market: cfg.market,
      credentials,
      emergencyStopped: emergency.stopped,
      persistenceConfigured: isSupabaseConfigured(),
      error: "Binance API key/secret belum dikonfigurasi.",
    });
  }

  const startedAt = Date.now();
  try {
    const [serverTime] = await Promise.all([getServerTime(cfg), ping(cfg)]);
    const localTime = Date.now();
    const roundTripMs = localTime - startedAt;
    const meta = getLastCallMeta();
    return NextResponse.json({
      connected: true,
      configured: true,
      mode: cfg.mode,
      market: cfg.market,
      baseUrl: cfg.baseUrl,
      serverTime,
      localTime,
      clockDriftMs: serverTime - localTime,
      latencyMs: meta?.latencyMs ?? roundTripMs,
      credentials,
      emergencyStopped: emergency.stopped,
      persistenceConfigured: isSupabaseConfigured(),
    });
  } catch (err) {
    console.error("[ElVoid AI][Binance] status check gagal:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      connected: false,
      configured: true,
      mode: cfg.mode,
      market: cfg.market,
      credentials,
      emergencyStopped: emergency.stopped,
      persistenceConfigured: isSupabaseConfigured(),
      error: err instanceof Error ? err.message : "Gagal terhubung ke Binance.",
    });
  }
}
