import { useEffect } from "react";

// ---------------------------------------------------------------------------
// AI Energy purchase bug — ROOT CAUSE FIX.
//
// lib/payments/store.ts (purchase grant) and lib/energy.ts (daily claim /
// spend) both correctly read and write the SAME ai_token.balance row — that
// part was never broken; GET /api/ai-energy reads it back correctly too.
// The bug is downstream of the database: four separate client components
// display this balance (components/dashboard/AiEnergyWidget.tsx,
// components/settings/sections/AiEnergySection.tsx,
// components/layout/ProfileMenu.tsx, components/layout/SidebarProfile.tsx)
// and each one fetches it exactly once on mount with no shared cache or
// invalidation between them. So a confirmed on-chain purchase correctly
// credits AI Energy server-side, but every already-mounted display keeps
// showing its stale first-load number until a full page reload — which
// reads as "AI Energy balance did not increase" even though it did.
//
// This app has no shared data-fetching layer (no SWR/react-query, no
// Context) to plug into, and adding one now would be a much bigger change
// than this bug needs. This is the smallest fix that closes the gap: a
// plain browser CustomEvent bus. Whoever changes the balance calls
// notifyAiEnergyChanged() once; every display component calls
// useAiEnergyRefresh(reload) with its OWN existing reload function so it
// re-fetches when that fires. Nothing about how each component fetches its
// own data changes otherwise — no new dependency, no provider to wrap the
// app in.
// ---------------------------------------------------------------------------

const EVENT_NAME = "elstand:ai-energy-changed";

/** Call once, client-side, right after any action that changes the signed-in user's AI Energy balance on the server (purchase grant, daily claim, feature spend/refund) — so every mounted balance display refreshes itself instead of showing a stale number. */
export function notifyAiEnergyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_NAME));
}

/** Re-runs `reload` whenever notifyAiEnergyChanged() fires anywhere in the app — in addition to whatever effect already calls it on mount. `reload` should be the component's existing fetch function; this hook does not introduce a second one. */
export function useAiEnergyRefresh(reload: () => void) {
  useEffect(() => {
    window.addEventListener(EVENT_NAME, reload);
    return () => window.removeEventListener(EVENT_NAME, reload);
  }, [reload]);
}
