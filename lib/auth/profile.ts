import type { SupabaseClient, User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Turns a Supabase auth.users row (from Google OAuth) into the app's own
// users/profiles/ai_token/user_settings rows — see the "Phase 3" section of
// supabase/schema.sql for the tables this writes to. Runs via the anon-key,
// user-scoped client (lib/auth/server.ts), NOT the service-role client in
// lib/supabase.ts — the RLS policies (auth.uid() = id/user_id) allow a
// signed-in user to write exactly these rows for themselves, so no
// elevated key is needed here.
// ---------------------------------------------------------------------------

export interface AppUser {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
}

export interface AppProfile {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
}

function deriveUsername(user: User): string | null {
  const meta = user.user_metadata ?? {};
  return (meta.full_name as string) || (meta.name as string) || (user.email ? user.email.split("@")[0] : null);
}

function deriveAvatarUrl(user: User): string | null {
  const meta = user.user_metadata ?? {};
  return (meta.avatar_url as string) || (meta.picture as string) || null;
}

/**
 * Called once per successful sign-in (app/auth/callback/route.ts). Creates
 * the users/profiles/ai_token/user_settings rows the first time this
 * auth.uid() is ever seen, and on every later login just refreshes
 * last_login_at/last_active_at plus username/avatar (in case the Google
 * account's name or picture changed) — a single upsert does both jobs.
 * Never throws: a hiccup here shouldn't block sign-in itself, so callers
 * treat a false return as "log it, continue anyway".
 */
export async function upsertUserProfile(supabase: SupabaseClient, user: User): Promise<boolean> {
  const now = new Date().toISOString();

  const { error: userError } = await supabase.from("users").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      last_login_at: now,
      last_active_at: now,
    },
    { onConflict: "id" }
  );
  if (userError) {
    console.error("[auth/profile] users upsert failed:", userError.message);
    return false;
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      username: deriveUsername(user),
      avatar_url: deriveAvatarUrl(user),
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (profileError) {
    console.error("[auth/profile] profiles upsert failed:", profileError.message);
    return false;
  }

  // Only insert if missing — these two must NOT be touched on every login,
  // or a returning user's AI Energy balance / settings would be reset.
  const { error: tokenError } = await supabase
    .from("ai_token")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (tokenError) console.error("[auth/profile] ai_token seed failed:", tokenError.message);

  const { error: settingsError } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (settingsError) console.error("[auth/profile] user_settings seed failed:", settingsError.message);

  return true;
}

/** Best-effort "user is active right now" ping — see app/api/account/heartbeat/route.ts. */
export async function touchLastActive(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from("users").update({ last_active_at: new Date().toISOString() }).eq("id", userId);
  if (error) console.error("[auth/profile] touchLastActive failed:", error.message);
}

export async function getAppUser(supabase: SupabaseClient, userId: string): Promise<AppUser | null> {
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    email: data.email,
    createdAt: data.created_at,
    lastLoginAt: data.last_login_at,
    lastActiveAt: data.last_active_at,
  };
}

export async function getAppProfile(supabase: SupabaseClient, userId: string): Promise<AppProfile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id, username: data.username, avatarUrl: data.avatar_url };
}
