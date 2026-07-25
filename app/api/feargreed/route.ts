import { NextResponse } from "next/server";
import { getFearGreed } from "@/lib/alternativeme";

export async function GET() {
  try {
    const data = await getFearGreed();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "fng_fetch_failed" }, { status: 502 });
  }
}
