import { AppShell } from "@/components/AppShell";
import { getSnapshot } from "@/lib/snapshot";
import { buildHighMomentum } from "@/lib/scanner-categories";
import { getDerivativesRows, buildDerivativesOverview, buildIntelligenceRows } from "@/lib/derivatives";
import { IntelligenceTerminal } from "@/components/scanner/IntelligenceTerminal";

export const revalidate = 60;

export default async function ScannerPage() {
  const snap = await getSnapshot();

  const derivativesRows = await getDerivativesRows(snap.funding);
  const overview = buildDerivativesOverview(derivativesRows);

  const pumpScoreBySymbol = new Map(snap.pumpCandidates.map((c) => [c.symbol, c.score]));
  const momentumScoreBySymbol = new Map(buildHighMomentum(snap.markets).map((c) => [c.symbol, c.score]));

  const rows = buildIntelligenceRows(snap.markets, derivativesRows, snap.whales, pumpScoreBySymbol, momentumScoreBySymbol);

  return (
    <AppShell title="Altcoin Intelligence" subtitle="Find Opportunity. Avoid Risk. Follow Smart Money.">
      <IntelligenceTerminal rows={rows} overview={overview} />
    </AppShell>
  );
}
