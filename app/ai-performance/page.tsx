import { AppShell } from "@/components/AppShell";
import { AiPerformanceView } from "@/components/ai-performance/AiPerformanceView";
import { getWallet, getDefaultWallet, getStatistics, getDefaultStatistics } from "@/lib/elvoid/paperTrader";
import { listSignals } from "@/lib/elvoid/signals";
import { getPerformanceReport, getJournalEntries } from "@/lib/elvoid/performance";
import { maskPremiumSignals, maskPremiumJournalEntries } from "@/lib/ai/oracle/presentation";

// AI PERFORMANCE — single source of truth for "how good is the AI doing".
// Every number here is re-read from the exact same tables Portfolio, AI
// Journal, and Paper Trader already used (paper_wallet, ai_statistics,
// ai_signals, ai_journal) — nothing new is computed or duplicated, this page
// just presents them together. Those three routes/components still exist
// and still work (reachable via the "View full ->" buttons below); this is
// additive, not a replacement.
export const metadata = { title: "AI Performance | ELSTAND INTELLIGENCE" };
export const revalidate = 30;

export default async function AiPerformancePage() {
  const [wallet, stats, openSignals, report, recentJournal] = await Promise.all([
    getWallet(),
    getStatistics(),
    listSignals({ status: ["new", "open", "tp1_hit"], limit: 50 }),
    getPerformanceReport(),
    getJournalEntries(10),
  ]);

  return (
    <AppShell
      title="AI Performance"
      subtitle="AI trading performance, execution history, and portfolio analytics."
    >
      <AiPerformanceView
        wallet={wallet ?? getDefaultWallet()}
        stats={stats ?? getDefaultStatistics()}
        openSignals={maskPremiumSignals(openSignals)}
        report={report}
        recentJournal={maskPremiumJournalEntries(recentJournal)}
      />
    </AppShell>
  );
}
