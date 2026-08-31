"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/auth/client";

// ---------------------------------------------------------------------------
// Phase B — Landing Redesign. READ-ONLY auth status for the landing page's
// CTAs. This deliberately does nothing else:
//   - no sign-in call, no sign-out call
//   - no wallet connection or wallet signature logic
//   - no writes to Supabase, no session mutation
// It only asks "is someone currently signed in?" so a CTA label/href can
// switch between the guest and authenticated states. All actual auth
// orchestration (Google OAuth, wallet linking, session exchange) stays
// exactly where the Phase A audit found it: app/login/page.tsx,
// app/auth/callback/route.ts, middleware.ts — none of which this file
// imports or duplicates.
//
// `status` starts "loading" (not "guest") so the CTA can render a neutral
// fallback instead of briefly flashing "Get Started" for a user who turns
// out to be signed in a moment later.
// ---------------------------------------------------------------------------

export type AuthStatus = "loading" | "guest" | "authenticated";

export function useAuthStatus(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;

    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      // Supabase env vars not configured in this environment — degrade to
      // "guest" rather than throwing, same "never crash the page" pattern
      // the rest of this app already follows for optional integrations.
      setStatus("guest");
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setStatus(data.user ? "authenticated" : "guest");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setStatus(session?.user ? "authenticated" : "guest");
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return status;
}
