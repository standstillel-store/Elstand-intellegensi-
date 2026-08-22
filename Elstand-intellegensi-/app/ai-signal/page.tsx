import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { AiSignalView } from "@/components/ai-signal/AiSignalView";
import { SkeletonCard } from "@/components/ui/Skeleton";

export const metadata = {
  title: "AI Signal | ELSTAND INTELLIGENCE",
};

export default function AiSignalPage() {
  return (
    <AppShell
      title="ElVoid AI Signal"
      subtitle="Chart real-time dengan AI reading otomatis, plus scan seluruh watchlist sekaligus."
    >
      <Suspense fallback={<SkeletonCard lines={8} />}>
        <AiSignalView />
      </Suspense>
    </AppShell>
  );
}
