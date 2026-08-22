export function formatUsd(n: number): string {
  if (!isFinite(n)) return "-";
  if (Math.abs(n) >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1 ? 6 : 2,
  }).format(n);
}

export function formatPct(n: number): string {
  if (!isFinite(n)) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.floor(hrs / 24)}d`;
}

const CURRENCY_FLAG: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CNY: "🇨🇳", AUD: "🇦🇺",
  CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿", INR: "🇮🇳", KRW: "🇰🇷", IDR: "🇮🇩",
  BRL: "🇧🇷", MXN: "🇲🇽", ZAR: "🇿🇦", SGD: "🇸🇬", HKD: "🇭🇰", SEK: "🇸🇪",
  NOK: "🇳🇴", TRY: "🇹🇷",
};

/** Best-effort flag for a country/currency code as used by the economic calendar feed (e.g. "USD", "EUR"). Falls back to a neutral globe rather than guessing. */
export function currencyFlag(code: string): string {
  return CURRENCY_FLAG[code?.toUpperCase()] ?? "🌐";
}

/** Precise "Xd Xh Xm Xs" countdown for a live-ticking display — timeUntil() above is the coarse one-unit version used in static/server-rendered lists. */
export function preciseCountdown(iso: string): { text: string; isPast: boolean; isSoon: boolean } {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return { text: "Berlangsung", isPast: true, isSoon: false };
  const totalSec = Math.floor(diffMs / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const text = d > 0 ? `${d}h ${h}j` : h > 0 ? `${h}j ${m}m` : `${m}m ${s}d`;
  return { text, isPast: false, isSoon: diffMs < 30 * 60 * 1000 };
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}
