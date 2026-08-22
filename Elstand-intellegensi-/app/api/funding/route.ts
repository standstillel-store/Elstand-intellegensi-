import { NextResponse } from "next/server";
import { getFundingSnapshot } from "@/lib/binance";

export async function GET() {
  try {
    const funding = await getFundingSnapshot();
    return NextResponse.json({ funding });
  } catch {
    return NextResponse.json({ funding: [] });
  }
}
