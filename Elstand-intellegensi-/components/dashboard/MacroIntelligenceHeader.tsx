"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Settings, LayoutGrid, Calendar, Newspaper, Star, LineChart } from "lucide-react";
import { NavDrawer } from "@/components/mobile/NavDrawer";
import { AlertsBell } from "@/components/alerts/AlertsBell";
import { ProfileMenu } from "@/components/layout/ProfileMenu";

// ---------------------------------------------------------------------------
// Bespoke chrome for the Macro Intelligence page — deliberately NOT the
// shared AppShell (TopNav + Sidebar), so this page gets its own single
// header instead of AppShell's generic bar stacked on top of a second
// module header. Hamburger, bell, and avatar are the same real components
// used everywhere else in the app (NavDrawer / AlertsBell / ProfileMenu),
// so they stay fully functional — only the layout around them is custom.
// ---------------------------------------------------------------------------

const TABS = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/economic-calendar", label: "Calendar", icon: Calendar },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/portfolio", label: "Watchlist", icon: Star },
  { href: "/macro-intelligence", label: "Insights", icon: LineChart },
];

export function MacroIntelligenceHeader() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop topnav */}
      <div className="sticky top-0 z-30 hidden border-b border-line bg-bg/95 backdrop-blur lg:block">
        <div className="flex items-center gap-6 px-6 py-3">
          <NavDrawer />
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-signal animate-pulseGlow" />
            <div className="leading-tight">
              <span className="text-[15px] font-bold tracking-tight text-ink">
                ELSTAND <span className="font-semibold text-signal">Intel Hub</span>
              </span>
              <p className="text-[11px] text-ink-faint">Market Intelligence Dashboard</p>
            </div>
          </Link>

          <nav className="ml-2 flex items-center gap-1 text-[13px]">
            {TABS.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={
                    active
                      ? "rounded-md px-3 py-1.5 font-medium text-signal"
                      : "rounded-md px-3 py-1.5 text-ink-muted transition-colors hover:text-ink"
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-bg-raised/60 px-3 py-1.5 text-[13px] text-ink-faint">
              <Search size={14} />
              <span>Search events, news, assets...</span>
            </div>
            <AlertsBell />
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-faint transition-colors hover:text-ink"
            >
              <Settings size={15} />
            </Link>
            <ProfileMenu />
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <NavDrawer />
          <Link href="/dashboard" className="min-w-0 flex-1">
            <span className="truncate text-sm font-bold tracking-tight text-ink">
              ELSTAND <span className="font-semibold text-signal">Intel Hub</span>
            </span>
            <p className="truncate text-[10px] text-ink-faint">Market Intelligence Dashboard</p>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <AlertsBell />
            <ProfileMenu />
          </div>
        </div>
      </div>
    </>
  );
}

export function MacroIntelligenceBottomTabs() {
  const pathname = usePathname();
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur lg:hidden">
      <div className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = pathname === t.href;
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${active ? "text-signal" : "text-ink-faint"}`}
            >
              <Icon size={18} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
