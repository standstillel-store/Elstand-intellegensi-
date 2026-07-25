import type { SupabaseClient } from "@supabase/supabase-js";

/** Append one row to activity_log. Fire-and-forget by design — an audit-log write failing should never break the action it's logging. */
export async function logActivity(
  supabase: SupabaseClient,
  userId: string,
  eventType:
    | "login"
    | "logout"
    | "logout_all"
    | "wallet_connected"
    | "wallet_disconnected"
    | "energy_spent"
    | "energy_reset"
    | "settings_changed"
    | "account_delete_requested",
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("activity_log").insert({
    user_id: userId,
    event_type: eventType,
    metadata: metadata ?? null,
  });
  if (error) console.error(`[activity_log] insert failed for "${eventType}":`, error.message);
}

/** Upsert the calling device's "last seen" — called on login and on each activity heartbeat. */
export async function touchDevice(supabase: SupabaseClient, userId: string, deviceLabel: string, userAgent: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("devices").upsert(
    { user_id: userId, device_label: deviceLabel, user_agent: userAgent, last_seen_at: now },
    { onConflict: "user_id,device_label" }
  );
  if (error) console.error("[devices] upsert failed:", error.message);
}
