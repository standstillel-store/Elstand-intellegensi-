import { NextResponse } from "next/server";
import { buildScanContext, buildSignalForSymbol } from "@/lib/elvoid/service";
import { listSignals, insertSignal } from "@/lib/elvoid/signals";
import type { SignalStatus } from "@/lib/elvoid/types";
import { reserveEnergy, settleEnergy } from "@/lib/energyGate";

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

// Phase 3.2: gated as "Generate AI Signal" (-4 AI Energy). "Berhasil" means
// a signal object actually came out the other end (persisted or not — the
// no-Supabase fallback below still counts, the user got a real signal);
// "gagal" is the 404 (no candle data) or the catch-all below, both of which
// refund immediately so the brief's "jika gagal jangan mengurangi Energy"
// holds exactly. Never blocks unmetered/anonymous callers — same convention
// as every other optional-auth route in this app.
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

  const gate = await reserveEnergy("generate_signal");
  if (!gate.ok) return gate.response;

  try {
    const ctx = await buildScanContext();
    const generated = await buildSignalForSymbol(coin, ctx, timeframe);
    if (!generated) {
      if (gate.reservation) await settleEnergy(gate.reservation, false);
      return NextResponse.json(
        { error: `Data candle untuk ${coin.toUpperCase()} tidak tersedia saat ini — coba simbol lain.` },
        { status: 404 }
      );
    }
    const saved = await insertSignal(generated);
    if (saved) {
      if (gate.reservation) await settleEnergy(gate.reservation, true);
      return NextResponse.json({ signal: saved, persisted: true });
    }

    // Supabase not configured — still return the freshly generated signal so
    // the AI Signal page keeps working, just without persistence. Still a
    // real, successful signal from the user's point of view — charged.
    if (gate.reservation) await settleEnergy(gate.reservation, true);
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
    if (gate.reservation) await settleEnergy(gate.reservation, false);
    return NextResponse.json({ error: "Gagal menghasilkan sinyal saat ini — coba lagi sebentar." }, { status: 500 });
  }
}
