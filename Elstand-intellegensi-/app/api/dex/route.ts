import { NextResponse } from "next/server";
import { getTrendingPools, getNewPools } from "@/lib/geckoterminal";

export async function GET() {
  const [trending, fresh] = await Promise.all([getTrendingPools(), getNewPools()]);
  return NextResponse.json({ trending, fresh });
}
