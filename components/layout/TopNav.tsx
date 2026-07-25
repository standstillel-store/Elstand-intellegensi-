"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, CircleUser, Zap, LogOut, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useTokenAnalyzer } from "@/components/token-analyzer/TokenAnalyzerContext";
import { AlertsBell } from "@/components/alerts/AlertsBell";
import { formatUsd, formatPct } from "@/lib/format";
import type { AppUser, AppProfile } from "@/lib/auth/profile";

interface TickerRow {
  symbol: string;
  price: number | null;
  change24h: number | null;
}

interface AccountMeResponse {
  signedIn: boolean;
  user: AppUser | null;
  profile: AppProfile | null;
}

export function TopNav() {
  const { open } = useTokenAnalyzer();
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState<TickerRow[]>([
    { symbol: "BTC", price: null, change24h: null },
    { symbol: "ETH", price: null, change24h: null },
    { symbol: "SOL", price: null, change24h: null },
  ]);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [me, setMe] = useState<AccountMeResponse | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/ticker");
        const data = await res.json();
        if (!cancelled) setTicker(data.ticker);
      } catch {
        /* keep last known values */
      }
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setMe(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    setProfileOpen(false);
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

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const symbol = query.trim().toUpperCase();
    if (symbol) {
      open(symbol);
      setQuery("");
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 hidden h-14 border-b border-line bg-bg/95 backdrop-blur lg:flex">
      <div className="flex w-full items-center gap-6 px-5">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-signal animate-pulseGlow" />
          <div className="leading-tight">
            <p className="eyebrow text-[9px] tracking-[0.18em] text-ink-faint">ElVoid AI Engine</p>
            <span className="text-sm font-bold tracking-tight">ELSTAND INTELLIGENCE</span>
          </div>
        </Link>

        <form onSubmit={handleSearch} className="max-w-md flex-1">
          <div className="flex items-center gap-2 rounded-md border border-line bg-bg-surface px-3 py-1.5 transition-colors focus-within:border-signal/50">
            <Search size={14} className="shrink-0 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search coin / Ask ElVoid AI…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
        </form>

        <div className="mono-num flex shrink-0 items-center gap-4 text-xs">
          {ticker.map((t) => (
            <div key={t.symbol} className="flex items-baseline gap-1.5">
              <span className="font-semibold text-ink-faint">{t.symbol}</span>
              <span className="text-ink">{t.price !== null ? formatUsd(t.price) : "—"}</span>
              {t.change24h !== null && (
                <span className={t.change24h >= 0 ? "text-up" : "text-down"}>{formatPct(t.change24h)}</span>
              )}
            </div>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <AlertsBell />
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-ink-muted hover:border-signal/40 hover:text-ink"
            >
              {me?.profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.profile.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <CircleUser size={16} />
              )}
              <ChevronDown size={12} className={clsx("transition-transform", profileOpen && "rotate-180")} />
            </button>
            {profileOpen && (
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
                    <Zap size={12} className="text-signal-glow" /> AI Token
                  </span>
                  <span className="mono-num font-semibold text-ink">0</span>
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
        </div>
      </div>
    </header>
  );
}
