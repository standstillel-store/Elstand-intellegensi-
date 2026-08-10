"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Radar, ScanSearch, Settings, BookOpen, LineChart } from "lucide-react";

// AI PERFORMANCE CONSOLIDATION: Portfolio / AI Journal / Paper Trader are no
// longer top-level nav items — routes, components, API, and data model are
// untouched, they're reached from inside /ai-performance now. Live Trading
// and Whale Activity stay linked-but-unlisted the same way (route still
// live, just not in nav). Token Scanner stays in nav (explicitly kept per
// spec). See lib/elvoid/performance.ts and app/ai-performance/page.tsx for
// where the consolidated sections now live.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/macro-intelligence", label: "Macro Intelligence", icon: Radar },
  { href: "/ai-signal", label: "AI Signal", icon: Radar },
  { href: "/ai-performance", label: "AI Performance", icon: LineChart },
  { href: "/scanner", label: "Token Scanner", icon: ScanSearch },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-60 flex-col border-r border-line bg-bg-surface/60 lg:top-14 lg:flex">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="h-2 w-2 rounded-full bg-signal animate-pulseGlow" />
        <div className="leading-tight">
          <p className="eyebrow text-[9px] tracking-[0.18em] text-ink-faint">ElVoid AI Engine</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold tracking-tight">ELSTAND</span>
            <span className="text-[10px] font-semibold tracking-wide text-ink-faint">INTEL</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
                active
                  ? "border-signal bg-signal/10 font-medium text-ink shadow-glow-signal"
                  : "border-transparent text-ink-muted hover:bg-bg-raised hover:text-ink"
              )}
            >
              <item.icon size={16} className={active ? "text-signal-glow" : ""} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <Link
          href="/methodology"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs text-ink-faint hover:text-ink-muted"
        >
          <BookOpen size={14} />
          Methodology
        </Link>
        <p className="px-3 pb-1 pt-2 text-[10px] leading-relaxed text-ink-faint">
          Paper trading only — bukan nasihat keuangan.
        </p>
      </div>
    </aside>
  );
}
