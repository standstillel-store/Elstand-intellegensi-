import { NextResponse } from "next/server";
import { getPerformanceReport } from "@/lib/elvoid/performance";

export async function GET() {
  const report = await getPerformanceReport();
  return NextResponse.json(report);
}
