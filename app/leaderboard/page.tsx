import { AppShell } from "@/components/AppShell";
import { LeaderboardView } from "@/components/leaderboard/LeaderboardView";

export const metadata = {
  title: "Leaderboard | ELSTAND INTELLIGENCE",
};

export default function LeaderboardPage() {
  return (
    <AppShell title="Leaderboard" subtitle="Top contributors by ELS Testnet earned and AI Energy balance.">
      <LeaderboardView />
    </AppShell>
  );
}
