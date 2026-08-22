import { AppShell } from "@/components/AppShell";
import { JournalTabs } from "@/components/ai-journal/JournalTabs";
import { Disclaimer } from "@/components/Disclaimer";
import { getJournalEntries, getPerformanceReport } from "@/lib/elvoid/performance";
import { maskPremiumJournalEntries } from "@/lib/ai/oracle/presentation";

export const metadata = {
  title: "AI Journal | ELSTAND INTELLIGENCE",
};

export default async function AiJournalPage() {
  const [entries, report] = await Promise.all([getJournalEntries(200), getPerformanceReport()]);
  return (
    <AppShell
      title="AI Journal"
      subtitle="Riwayat setiap paper trade yang sudah ditutup, statistik performa, dan alasan sinyal aslinya."
    >
      <Disclaimer />
      <JournalTabs entries={maskPremiumJournalEntries(entries)} report={report} />
    </AppShell>
  );
}
