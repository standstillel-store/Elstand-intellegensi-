import { NextResponse } from "next/server";
import { resetPaperTrader } from "@/lib/elvoid/paperTrader";

export async function POST(req: Request) {
  let body: { startingBalance?: number } = {};
  try {
    body = (await req.json()) as { startingBalance?: number };
  } catch {
    // no body is fine — falls back to the default starting balance
  }
  const result = await resetPaperTrader(body.startingBalance ?? 10000);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
