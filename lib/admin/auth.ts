import { cookies } from "next/headers";
import { timingSafeStringEqual } from "./crypto";
import { ADMIN_SESSION_COOKIE, isAdminSessionValueValid } from "./session";

// ---------------------------------------------------------------------------
// Phase 6.6.0.1 section 5 — server-side admin authorization.
//
// This file uses next/headers `cookies()`, which throws if evaluated
// outside a server request context — so it can only ever run in a Server
// Component or Route Handler, never in the browser bundle. It's not
// imported from any "use client" component anywhere in this phase; keep it
// that way rather than adding the `server-only` package as a new
// dependency just to enforce something the runtime already enforces.
//
// The rule this file exists to enforce: a private URL is not
// authentication (section 2). Every admin Server Component / Route Handler
// calls requireAdminSession() and acts on its own — never trusts a query
// param, a cookie it didn't verify itself, or frontend state.
// ---------------------------------------------------------------------------

/** True only if `candidate` matches process.env.ADMIN_ENTRY_PATH exactly (constant-time). Fails closed (returns false) if the env var isn't set — an unconfigured deployment must never fall open to a guessable default. */
export function isValidAdminEntryPath(candidate: string): boolean {
  const configured = process.env.ADMIN_ENTRY_PATH;
  if (!configured) return false;
  return timingSafeStringEqual(candidate, configured);
}

/** Read-only check: does the incoming request carry a valid admin session cookie? Safe to call from a Server Component (cookies() is read-only there). */
export function requireAdminSession(): boolean {
  const cookieStore = cookies();
  const value = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return isAdminSessionValueValid(value);
}
