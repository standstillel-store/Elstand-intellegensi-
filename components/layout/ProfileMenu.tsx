"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleUser, ChevronDown, Zap, LogOut, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { AppUser, AppProfile } from "@/lib/auth/profile";
import { useAiEnergyRefresh } from "@/lib/energyBus";

interface AccountMeResponse {
  signedIn: boolean;
  user: AppUser | null;
  profile: AppProfile | null;
  energy: { balance: number; nextResetAt: string } | null;
}

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<AccountMeResponse | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const loadMe = useCallback(() => {
    fetch("/api/account/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setMe(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // Balance can change elsewhere (Settings claim, or any AI feature spending
  // it) between page load and the moment someone actually opens this menu to
  // check it — refresh right then rather than showing stale data.
  useEffect(() => {
    if (open) loadMe();
  }, [open, loadMe]);

  // AI Energy purchase bug fix: also refetch the instant a purchase/claim
  // happens anywhere else in the app, not only when this menu is opened.
  useAiEnergyRefresh(loadMe);

  async function handleLogout() {
    setLoggingOut(true);
    setOpen(false);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/auth/client");
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // still redirect below even if sign-out itself failed
    } finally {
      router.push("/login");
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Profil"
        className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-ink-muted hover:border-signal/40 hover:text-ink"
      >
        {me?.profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.profile.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <CircleUser size={16} />
        )}
        <ChevronDown size={12} className={clsx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-64 rounded-md border border-line bg-bg-raised py-1.5 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2.5 px-3 py-2">
            {me?.profile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={me.profile.avatarUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full border border-line"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-bg-surface text-ink-faint">
                <CircleUser size={18} />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{me?.profile?.username || "Trader"}</p>
              <p className="truncate text-xs text-ink-faint">{me?.user?.email ?? ""}</p>
            </div>
          </div>

          <div className="my-1 border-t border-line" />

          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <Zap size={12} className="text-signal-glow" /> AI Energy
            </span>
            <span className="mono-num font-semibold text-ink">{me?.energy?.balance ?? "—"}</span>
          </div>

          <div className="my-1 border-t border-line" />

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-down hover:bg-down/10 disabled:opacity-50"
          >
            {loggingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            {loggingOut ? "Memproses…" : "Logout"}
          </button>
        </div>
      )}
    </div>
  );
}
