import { NextResponse } from "next/server";
import { getEconomicCalendar } from "@/lib/economiccalendar";

export async function GET() {
  try {
    const events = await getEconomicCalendar();
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: "calendar_fetch_failed" }, { status: 502 });
  }
}
