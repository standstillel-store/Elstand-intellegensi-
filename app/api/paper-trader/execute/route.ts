import { NextResponse } from "next/server";
import { executeSignal } from "@/lib/elvoid/paperTrader";
import type { OrderType } from "@/lib/elvoid/types";

const VALID_ORDER_TYPES: OrderType[] = ["market", "limit", "stop"];

export async function POST(req: Request) {
  let body: { signalId?: string; orderType?: OrderType };
  try {
    body = (await req.json()) as { signalId?: string; orderType?: OrderType };
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  if (!body.signalId) return NextResponse.json({ error: "signalId wajib diisi." }, { status: 400 });
  const orderType = body.orderType && VALID_ORDER_TYPES.includes(body.orderType) ? body.orderType : "market";

  const result = await executeSignal(body.signalId, orderType);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
