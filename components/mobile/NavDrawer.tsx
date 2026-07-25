"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  Radar,
  Wallet,
  ClipboardList,
  ScanSearch,
  Waves,
  Newspaper,
  CalendarDays,
  Briefcase,
  Settings,
  BookOpen,
  CandlestickChart,
} from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai-signal", label: "AI Signal", icon: Radar },
  { href: "/paper-trader", label: "Paper Trader", icon: Wallet },
  { href: "/trading", label: "Live Trading", icon: CandlestickChart },
  { href: "/ai-journal", label: "AI Journal", icon: ClipboardList },
  { href: "/scanner", label: "Token Scanner", icon: ScanSearch },
  { href: "/whale", label: "Whale Activity", icon: Waves },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/economic-calendar", label: "Economic Calendar", icon: CalendarDays },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavDrawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // Portals need `document`, which only exists client-side after mount.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close automatically on route change so the drawer never lingers over a new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const overlay = (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden={!open}
        className={clsx(
          "fixed inset-0 z-[45] bg-black/60 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Panel — always the full device viewport height (h-dvh), independent of any
          ancestor with a sticky/backdrop-blur that would otherwise box it in. */}
      <div
        role="dialog"
        aria-label="Menu dashboard"
        aria-hidden={!open}
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[80%] max-w-[300px] flex-col border-r border-line bg-bg-surface shadow-2xl shadow-black/40 transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-4">
          <div className="leading-tight">
            <p className="eyebrow text-[9px] tracking-[0.18em] text-ink-faint">ElVoid AI Engine</p>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal animate-pulseGlow" />
              <span className="text-base font-bold tracking-tight">ELSTAND INTEL</span>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-bg-raised hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-md border-l-2 px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-signal bg-signal/10 font-medium text-ink"
                    : "border-transparent text-ink-muted hover:bg-bg-raised hover:text-ink"
                )}
              >
                <item.icon size={16} className={active ? "text-signal-glow" : ""} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Link
            href="/methodology"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-xs text-ink-faint hover:bg-bg-raised hover:text-ink-muted"
          >
            <BookOpen size={14} />
            Methodology
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Buka menu dashboard"
        className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-muted hover:text-ink"
      >
        <Menu size={20} />
      </button>

      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
