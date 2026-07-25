import { AppShell } from "@/components/AppShell";
import { JournalTabs } from "@/components/ai-journal/JournalTabs";
import { Disclaimer } from "@/components/Disclaimer";
import { getJournalEntries, getPerformanceReport } from "@/lib/elvoid/performance";

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
      <JournalTabs entries={entries} report={report} />
    </AppShell>
  );
}
