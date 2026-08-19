import { AppShell } from "@/components/AppShell";
import { LiveDot } from "@/components/ui/LiveDot";
import { DataStateBadge } from "@/components/ui/DataStateBadge";
import { MarketIntelligenceStrip } from "@/components/dashboard/premium/MarketIntelligenceStrip";
import { GlobalRiskRegimePanel } from "@/components/dashboard/premium/GlobalRiskRegimePanel";
import { AltcoinScreenerPro } from "@/components/dashboard/premium/AltcoinScreenerPro";
import { FomcPanel } from "@/components/dashboard/premium/FomcPanel";
import { MacroNewsPanel } from "@/components/dashboard/MacroNewsPanel";
import { getPremiumIntelligenceSnapshot } from "@/lib/intelligence/premium";

// Refetch on every request server-side — this is a live intelligence
// terminal, not a static page. Individual sources still control their own
// cache TTL (see lib/cache.ts `cached()` calls throughout lib/macro.ts,
// lib/intelligence/sources/*, lib/coingecko.ts) so this doesn't hammer
// upstream APIs; it just means the page itself is never stale-cached by Next.
export const dynamic = "force-dynamic";

export default async function ElstandPremiumPage() {
  const snapshot = await getPremiumIntelligenceSnapshot();
  const connectedCount = snapshot.sources.filter((s) => s.state !== "unavailable").length;

  return (
    <AppShell
      title="ELSTAND PREMIUM"
      subtitle="Macro, market regime & altcoin intelligence — separate from ELVOID PRO's trading terminal"
      fullBleed
      right={
        <div className="hidden items-center gap-1.5 text-xs text-ink-muted lg:flex">
          <LiveDot />
          <span>
            Data refreshed {new Date(snapshot.asOf).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
      }
    >
      <MarketIntelligenceStrip snapshot={snapshot} />

      <GlobalRiskRegimePanel sentiment={snapshot.sentiment} />

      <AltcoinScreenerPro
        pumpCandidates={snapshot.pumpCandidates}
        pumpState={snapshot.pumpCandidatesState}
        rugpullRisks={snapshot.rugpullRisks}
        rugpullState={snapshot.rugpullRisksState}
      />

      <section>
        <h2 className="eyebrow mb-2 text-[11px] text-ink-muted">Macro &amp; News Intelligence</h2>
        <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
          <FomcPanel event={snapshot.nextFomc} fedFunds={snapshot.fedFunds.data} fedFundsState={snapshot.fedFunds.state} />
          <MacroNewsPanel news={snapshot.news} />
        </div>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">ELSTAND PREMIUM · Data Sources</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {snapshot.sources.map((s) => (
            <span key={s.label} className="flex items-center gap-1 text-[10px] text-ink-faint">
              <DataStateBadge state={s.state} compact />
              {s.label}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-ink-faint">
          {connectedCount}/{snapshot.sources.length} connected
        </span>
      </section>
    </AppShell>
  );
}
