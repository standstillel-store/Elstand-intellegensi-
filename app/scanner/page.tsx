import { AppShell } from "@/components/AppShell";
import { getSnapshot } from "@/lib/snapshot";
import { buildDumpCandidates, buildHighMomentum, buildSmartMoneyAccumulation, buildWhaleBuying, buildWhaleSelling } from "@/lib/scanner-categories";
import { TokenScannerView } from "@/components/scanner/TokenScannerView";

export const revalidate = 60;

export default async function ScannerPage() {
  const snap = await getSnapshot();

  const data = {
    pump: snap.pumpCandidates,
    dump: buildDumpCandidates(snap.markets, snap.funding, snap.whales),
    rugpull: snap.rugpullRisks,
    smartMoney: buildSmartMoneyAccumulation(snap.whales, snap.markets),
    momentum: buildHighMomentum(snap.markets),
    whaleBuying: buildWhaleBuying(snap.whales),
    whaleSelling: buildWhaleSelling(snap.whales),
  };

  return (
    <AppShell title="Token Scanner" subtitle="7 kategori live screener — klik koin untuk membuka Token Analyzer.">
      <TokenScannerView data={data} />
    </AppShell>
  );
}
