import { AppShell } from "@/components/AppShell";
import { getWallet, getDefaultWallet, getStatistics, getDefaultStatistics } from "@/lib/elvoid/paperTrader";
import { listSignals } from "@/lib/elvoid/signals";
import { getPerformanceReport } from "@/lib/elvoid/performance";
import { PortfolioView } from "@/components/portfolio/PortfolioView";

export const metadata = { title: "Portfolio | ELSTAND INTELLIGENCE" };
export const revalidate = 60;

export default async function PortfolioPage() {
  const [wallet, stats, openSignals, performance] = await Promise.all([
    getWallet(),
    getStatistics(),
    listSignals({ status: ["new", "open", "tp1_hit"], limit: 50 }),
    getPerformanceReport(),
  ]);

  return (
    <AppShell
      title="Portfolio"
      subtitle="Allocation view di atas ElVoid AI Paper Trader wallet — belum ada wallet-connect exchange nyata."
    >
      <PortfolioView
        wallet={wallet ?? getDefaultWallet()}
        stats={stats ?? getDefaultStatistics()}
        openSignals={openSignals}
        equityCurve={performance.equityCurve}
      />
    </AppShell>
  );
}
