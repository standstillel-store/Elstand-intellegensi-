import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";

export async function GET() {
  return NextResponse.json({
    supabase: isSupabaseConfigured(),
    alchemy: Boolean(process.env.ALCHEMY_API_KEY),
    newsapi: Boolean(process.env.NEWSAPI_KEY),
    fred: Boolean(process.env.FRED_API_KEY),
  });
}
