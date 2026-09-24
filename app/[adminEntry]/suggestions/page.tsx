import { notFound, redirect } from "next/navigation";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { AdminDashboardShell } from "@/components/admin/AdminDashboardShell";
import { SuggestionsPanel } from "@/components/admin/SuggestionsPanel";

export const dynamic = "force-dynamic";

export default function AdminSuggestionsPage({ params }: { params: { adminEntry: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) {
    notFound();
  }
  if (!requireAdminSession()) {
    redirect(`/${params.adminEntry}`);
  }

  return (
    <AdminDashboardShell adminEntry={params.adminEntry} active="suggestions">
      <h2 className="mb-1 text-sm font-semibold text-white">Suggestions</h2>
      <p className="mb-4 text-xs text-white/40">Review submitted ideas, approve with an ELS + AI Energy reward, or reject.</p>
      <SuggestionsPanel adminEntry={params.adminEntry} />
    </AdminDashboardShell>
  );
}
