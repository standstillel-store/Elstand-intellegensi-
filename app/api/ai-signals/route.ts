import { NextResponse } from "next/server";
import { buildScanContext, buildSignalForSymbol } from "@/lib/elvoid/service";
import { listSignals, insertSignal } from "@/lib/elvoid/signals";
import type { SignalStatus } from "@/lib/elvoid/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status = statusParam
    ? ((statusParam.includes(",") ? statusParam.split(",") : statusParam) as SignalStatus | SignalStatus[])
    : undefined;
  const limit = Number(searchParams.get("limit") ?? 50);
  const signals = await listSignals({ status, limit });
  return NextResponse.json({ signals });
}

export async function POST(req: Request) {
  let body: { coin?: string; timeframe?: string };
  try {
    body = (await req.json()) as { coin?: string; timeframe?: string };
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  const coin = (body.coin ?? "").trim();
  if (!coin) return NextResponse.json({ error: "Sertakan simbol coin, misalnya BTC." }, { status: 400 });
  const timeframe = body.timeframe ?? "4h";

  try {
    const ctx = await buildScanContext();
    const generated = await buildSignalForSymbol(coin, ctx, timeframe);
    if (!generated) {
      return NextResponse.json(
        { error: `Data candle untuk ${coin.toUpperCase()} tidak tersedia saat ini — coba simbol lain.` },
        { status: 404 }
      );
    }
    const saved = await insertSignal(generated);
    if (saved) return NextResponse.json({ signal: saved, persisted: true });

    // Supabase not configured — still return the freshly generated signal so
    // the AI Signal page keeps working, just without persistence.
    return NextResponse.json({
      signal: {
        ...generated,
        extra_reasoning: generated.extraReasoning,
        trade_grade: generated.tradeGrade,
        probability_tp: generated.probabilityTp,
        probability_sl: generated.probabilitySl,
        order_type: "market" as const,
        id: `local-${Date.now()}`,
        status: "new",
        created_at: new Date().toISOString(),
      },
      persisted: false,
    });
  } catch (err) {
    console.error("[ElVoid AI] signal generation error:", err);
    return NextResponse.json({ error: "Gagal menghasilkan sinyal saat ini — coba lagi sebentar." }, { status: 500 });
  }
}
