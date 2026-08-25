import { AppShell } from "@/components/AppShell";
import { BugClaimView } from "@/components/earn/BugClaimView";

export const metadata = {
  title: "Claim Bug Bounty | ELSTAND INTELLIGENCE",
};

export default function BugHunterClaimPage({ params }: { params: { token: string } }) {
  return (
    <AppShell title="Claim Reward" subtitle="Konfirmasi klaim reward bug bounty kamu.">
      <div className="mx-auto max-w-md">
        <BugClaimView token={params.token} />
      </div>
    </AppShell>
  );
}
