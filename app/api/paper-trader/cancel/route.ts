import { NextResponse } from "next/server";
import { cancelPendingOrder } from "@/lib/elvoid/paperTrader";

export async function POST(req: Request) {
  let body: { signalId?: string };
  try {
    body = (await req.json()) as { signalId?: string };
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  if (!body.signalId) return NextResponse.json({ error: "signalId wajib diisi." }, { status: 400 });
  const result = await cancelPendingOrder(body.signalId);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
