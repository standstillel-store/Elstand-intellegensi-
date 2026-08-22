"use client";

import { createBrowserClient } from "@supabase/ssr";

// Auth-only client for the browser (Google sign-in, sign-out). Separate from
// lib/supabase.ts on purpose: that file holds the server-only service-role
// client ElVoid AI's data layer uses and must never reach the browser. This
// one only ever uses the public anon key.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase auth isn't configured yet — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }

  return createBrowserClient(url, anonKey);
}
