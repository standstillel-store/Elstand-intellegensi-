import { NextResponse } from "next/server";
import { getWallet, getDefaultWallet, updateWalletSettings } from "@/lib/elvoid/paperTrader";
import type { TradeGrade } from "@/lib/elvoid/types";

export async function GET() {
  const wallet = await getWallet();
  return NextResponse.json({ wallet: wallet ?? getDefaultWallet(), configured: Boolean(wallet) });
}

export async function PATCH(req: Request) {
  let body: { riskPercent?: number; autoExecute?: boolean; autoExecuteMinGrade?: TradeGrade };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  if (typeof body.riskPercent !== "number" || Number.isNaN(body.riskPercent)) {
    return NextResponse.json({ error: "riskPercent wajib diisi dengan angka." }, { status: 400 });
  }
  const result = await updateWalletSettings(body.riskPercent, body.autoExecute, body.autoExecuteMinGrade);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
