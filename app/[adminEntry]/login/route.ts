import { NextResponse, type NextRequest } from "next/server";
import { isValidAdminEntryPath } from "@/lib/admin/auth";
import { verifyAdminPassword, hashIp } from "@/lib/admin/crypto";
import { createAdminSessionValue, ADMIN_SESSION_COOKIE, adminSessionCookieOptions, SESSION_MAX_AGE_SECONDS } from "@/lib/admin/session";
import { checkAdminLoginRateLimit, recordMemoryFallbackFailure } from "@/lib/admin/rateLimit";
import { logAdminAction } from "@/lib/admin/auditLog";
import { getRequestIp } from "@/lib/admin/requestIp";

// ---------------------------------------------------------------------------
// Phase 6.6.0.1 section 3 + 4 + 9 — admin login endpoint.
//
// Living under app/[adminEntry]/login (not a static /api/admin-login) means
// this endpoint's own URL also requires knowing ADMIN_ENTRY_PATH — a bot
// working through a wordlist of common admin paths never reaches password
// verification at all, it just 404s at the page above.
//
// Order of operations matters here: entry-path check, THEN rate limit,
// THEN password verification. Rate limiting has to happen before
// scryptSync runs, or the cost of hashing becomes itself a timing side
// channel / a cheap way to burn CPU past the "protection".
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { adminEntry: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ip = getRequestIp(request);
  const ipHash = hashIp(ip);

  const rateLimit = await checkAdminLoginRateLimit(ipHash);
  if (!rateLimit.allowed) {
    await logAdminAction("ADMIN_LOGIN_RATE_LIMITED", { ipHash });
    return NextResponse.json({ error: "Too many attempts.", retryAfterSeconds: rateLimit.retryAfterSeconds }, { status: 429 });
  }

  let password: unknown;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Password required." }, { status: 400 });
  }

  const storedHash = process.env.ADMIN_PASSWORD_HASH;
  const passwordOk = verifyAdminPassword(password, storedHash);

  if (!passwordOk) {
    recordMemoryFallbackFailure(ipHash);
    await logAdminAction("ADMIN_LOGIN_FAILED", { ipHash });
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const sessionValue = createAdminSessionValue();
  if (!sessionValue) {
    // ADMIN_SESSION_SECRET missing — fail closed rather than issuing an
    // unsigned/unverifiable session.
    return NextResponse.json({ error: "Admin session is not configured on this deployment." }, { status: 503 });
  }

  await logAdminAction("ADMIN_LOGIN_SUCCESS", { ipHash });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, sessionValue, adminSessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return response;
}
