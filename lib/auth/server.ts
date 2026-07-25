import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Auth-only server client — reads/writes the Supabase session cookies for
// Server Components and Route Handlers. Uses the public anon key (RLS
// applies), unlike lib/supabase.ts's service-role client used for ElVoid
// AI's own data reads/writes.
//
// getAll/setAll (not the older get/set/remove) per Supabase's current
// guidance — the old per-cookie API is deprecated and, per Supabase's own
// docs, "can lead to issues such as random logouts, early session
// termination" in Next.js. This is the fix for exactly that class of bug.
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render — middleware is what
          // actually refreshes the session cookie on the next request.
        }
      },
    },
  });
}
