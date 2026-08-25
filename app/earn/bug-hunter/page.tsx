import { AppShell } from "@/components/AppShell";
import { BugReportForm } from "@/components/earn/BugReportForm";

export const metadata = {
  title: "Report a Bug | ELSTAND INTELLIGENCE",
};

export default function BugHunterPage() {
  return (
    <AppShell title="Bug Hunter" subtitle="Laporkan bug yang kamu temukan dan dapatkan reward ELS.">
      <div className="mx-auto max-w-2xl rounded-md border border-line bg-bg-surface p-5">
        <BugReportForm />
      </div>
    </AppShell>
  );
}
