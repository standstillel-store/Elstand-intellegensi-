import { notFound, redirect } from "next/navigation";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { AdminDashboardShell } from "@/components/admin/AdminDashboardShell";
import { AdminStatusCards } from "@/components/admin/AdminStatusCards";

export const dynamic = "force-dynamic";

export default function AdminDashboardPage({ params }: { params: { adminEntry: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) {
    notFound();
  }
  if (!requireAdminSession()) {
    redirect(`/${params.adminEntry}`);
  }

  return (
    <AdminDashboardShell adminEntry={params.adminEntry} active="dashboard">
      <h2 className="mb-1 text-sm font-semibold text-white">System Status</h2>
      <p className="mb-4 text-xs text-white/40">Live checks — run on every page load, not cached claims.</p>
      {/* AdminStatusCards is an async Server Component (does real health checks) — App Router renders these directly. */}
      <AdminStatusCards />
    </AdminDashboardShell>
  );
}
