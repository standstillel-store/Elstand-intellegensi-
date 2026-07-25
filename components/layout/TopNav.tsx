"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Search, Settings, BookOpen, ChevronDown, CircleUser } from "lucide-react";
import clsx from "clsx";
import { useTokenAnalyzer } from "@/components/token-analyzer/TokenAnalyzerContext";
import { AlertsBell } from "@/components/alerts/AlertsBell";
import { formatUsd, formatPct } from "@/lib/format";

interface TickerRow {
  symbol: string;
  price: number | null;
  change24h: number | null;
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
              <CircleUser size={16} />
              <ChevronDown size={12} className={clsx("transition-transform", profileOpen && "rotate-180")} />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] w-48 rounded-md border border-line bg-bg-raised py-1 shadow-2xl shadow-black/40">
                <Link href="/settings" className="flex items-center gap-2 px-3 py-2 text-sm text-ink-muted hover:bg-bg-surface hover:text-ink">
                  <Settings size={14} /> Settings
                </Link>
                <Link href="/methodology" className="flex items-center gap-2 px-3 py-2 text-sm text-ink-muted hover:bg-bg-surface hover:text-ink">
                  <BookOpen size={14} /> Methodology
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
