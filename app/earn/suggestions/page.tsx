import { AppShell } from "@/components/AppShell";
import { SuggestionForm } from "@/components/earn/SuggestionForm";
import { MySuggestionsList } from "@/components/earn/MySuggestionsList";

export const metadata = {
  title: "Suggestions | ELSTAND INTELLIGENCE",
};

export default function SuggestionsPage() {
  return (
    <AppShell title="Suggestions" subtitle="Share ideas and improvements that can help make ELSTAND better.">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-md border border-line bg-bg-surface p-5">
          <SuggestionForm />
        </div>

        <div className="rounded-md border border-line bg-bg-surface p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Your Suggestions</p>
          <MySuggestionsList />
        </div>
      </div>
    </AppShell>
  );
}
