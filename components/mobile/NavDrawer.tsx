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
  ScanSearch,
  Settings,
  BookOpen,
  LineChart,
  Gift,
  WalletMinimal,
  Gauge,
  Crown,
} from "lucide-react";
import clsx from "clsx";
import { SidebarProfile } from "../layout/SidebarProfile";

// AI PERFORMANCE CONSOLIDATION (see PHASE7-8 notes in CHANGES.md): Portfolio,
// AI Journal, and Paper Trader are no longer top-level nav items — their
// routes/components/API/data model are untouched, they're just reached from
// inside /ai-performance now instead of the hamburger. Same for Live Trading
// and Whale Activity, which stay linked-but-unlisted (route still works,
// just not advertised in nav) per the same "remove from nav ≠ delete" rule.
// Token Scanner stays in nav (explicitly kept per spec).
//
// Grouped to match the ELSTAND INTEL visual reference (INTELLIGENCE /
// ECOSYSTEM / SYSTEM section labels), same grouping as Sidebar.tsx. Wallet
// is now live (BSC Testnet + ELS Testnet). Elvoid Pro terminal (Phase 1) is
// now linked here too — keep in sync with Sidebar.tsx's NAV_GROUPS since
// this drawer is a separate mobile-only duplicate, not a shared import.
const NAV_GROUPS = [
  {
    label: "Intelligence",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/macro-intelligence", label: "Macro Intelligence", icon: Radar },
      { href: "/ai-signal", label: "AI Signal", icon: Radar },
      { href: "/ai-performance", label: "AI Performance", icon: LineChart },
      { href: "/scanner", label: "Token Scanner", icon: ScanSearch },
    ],
  },
  {
    // Keep in sync with Sidebar.tsx — see note there on why this is its
    // own top-level group rather than nested under Intelligence/Ecosystem.
    label: "Premium Intelligence",
    items: [{ href: "/elstand-premium", label: "ELSTAND PREMIUM", icon: Crown, badge: "PRO" }],
  },
  {
    label: "Ecosystem",
    items: [
      { href: "/elvoid-pro", label: "ELVOID PRO", icon: Gauge, badge: "PRO" },
      { href: "/earn", label: "Earn & Reward", icon: Gift },
      { href: "/wallet", label: "Wallet", icon: WalletMinimal },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
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

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal-glow/80">
                {group.label}
              </p>
              {group.items.map((item) => {
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
                    {"badge" in item && item.badge && (
                      <span className="ml-auto rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-gold">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-3 border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Link
            href="/methodology"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-xs text-ink-faint hover:bg-bg-raised hover:text-ink-muted"
          >
            <BookOpen size={14} />
            Methodology
          </Link>
          <SidebarProfile />
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
