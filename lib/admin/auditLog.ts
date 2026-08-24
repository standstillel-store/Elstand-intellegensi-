import { getSupabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Phase 6.6.0.1 section 8 — admin audit log foundation.
//
// Mirrors the existing lib/activityLog.ts pattern (fire-and-forget: an
// audit write failing must never block or fail the admin action it's
// logging). Table is supabase/migrations/2026-08-admin-audit.sql.
//
// Hard rule: never pass anything here that could end up being a password,
// a password hash, a private key, a seed phrase, or any secret — this
// module doesn't redact, so that discipline has to live at every call
// site. Metadata should be small, non-sensitive context (e.g. which route
// path was hit), not request bodies.
// ---------------------------------------------------------------------------

export type AdminAuditAction = "ADMIN_LOGIN_SUCCESS" | "ADMIN_LOGIN_FAILED" | "ADMIN_LOGIN_RATE_LIMITED" | "ADMIN_LOGOUT";

// Single shared admin identity for this phase — there is no per-admin
// username/account concept yet (one password, see spec section 3), so this
// is an honest label rather than an invented user record.
const ADMIN_IDENTIFIER = "admin";

export async function logAdminAction(action: AdminAuditAction, opts: { ipHash?: string; metadata?: Record<string, unknown> } = {}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn(`[admin_audit_log] Supabase not configured — skipping log for "${action}"`);
    return;
  }
  const { error } = await supabase.from("admin_audit_log").insert({
    action,
    admin_identifier: ADMIN_IDENTIFIER,
    ip_hash: opts.ipHash ?? null,
    metadata: opts.metadata ?? null,
  });
  if (error) console.error(`[admin_audit_log] insert failed for "${action}":`, error.message);
}

/** Read the most recent audit log rows for the System Logs admin page. Returns an empty array (never throws) if Supabase isn't configured or the query fails — the page shows an honest "no data" state instead of crashing. */
export async function getRecentAdminAuditLog(limit = 50): Promise<
  Array<{ id: string; action: string; admin_identifier: string | null; ip_hash: string | null; metadata: Record<string, unknown> | null; created_at: string }>
> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("admin_audit_log").select("id, action, admin_identifier, ip_hash, metadata, created_at").order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("[admin_audit_log] select failed:", error.message);
    return [];
  }
  return data ?? [];
}
