import { NextResponse, type NextRequest } from "next/server";
import { isValidAdminEntryPath } from "@/lib/admin/auth";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import { logAdminAction } from "@/lib/admin/auditLog";
import { hashIp } from "@/lib/admin/crypto";
import { getRequestIp } from "@/lib/admin/requestIp";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { adminEntry: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await logAdminAction("ADMIN_LOGOUT", { ipHash: hashIp(getRequestIp(request)) });

  const response = NextResponse.json({ ok: true });
  // Clear by setting an already-expired cookie with the same name/path —
  // simplest reliable way to invalidate a stateless signed cookie (there's
  // no server-side session record to delete).
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
