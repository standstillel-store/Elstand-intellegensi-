"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
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
