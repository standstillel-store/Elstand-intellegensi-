import { notFound, redirect } from "next/navigation";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { AdminDashboardShell } from "@/components/admin/AdminDashboardShell";
import { BugHunterPanel } from "@/components/admin/BugHunterPanel";

export const dynamic = "force-dynamic";

export default function AdminBugHunterPage({ params }: { params: { adminEntry: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) {
    notFound();
  }
  if (!requireAdminSession()) {
    redirect(`/${params.adminEntry}`);
  }

  return (
    <AdminDashboardShell adminEntry={params.adminEntry} active="bug-hunter">
      <h2 className="mb-1 text-sm font-semibold text-white">Bug Hunter Reports</h2>
      <p className="mb-4 text-xs text-white/40">Review, approve with a reward amount, or reject submitted bug reports.</p>
      <BugHunterPanel adminEntry={params.adminEntry} />
    </AdminDashboardShell>
  );
}
