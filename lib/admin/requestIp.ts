import type { NextRequest } from "next/server";

/** Best-effort client IP from headers Vercel's edge sets (x-forwarded-for / x-real-ip). Falls back to "unknown" — never throws, and the caller only ever uses this for hashing (see crypto.ts hashIp), never stores it raw. */
export function getRequestIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
