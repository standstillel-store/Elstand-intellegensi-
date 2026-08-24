import { notFound, redirect } from "next/navigation";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { AdminDashboardShell } from "@/components/admin/AdminDashboardShell";
import { getRecentAdminAuditLog } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

const ACTION_STYLES: Record<string, string> = {
  ADMIN_LOGIN_SUCCESS: "text-up",
  ADMIN_LOGIN_FAILED: "text-down",
  ADMIN_LOGIN_RATE_LIMITED: "text-amber",
  ADMIN_LOGOUT: "text-white/60",
};

export default async function AdminLogsPage({ params }: { params: { adminEntry: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) {
    notFound();
  }
  if (!requireAdminSession()) {
    redirect(`/${params.adminEntry}`);
  }

  const entries = await getRecentAdminAuditLog(50);

  return (
    <AdminDashboardShell adminEntry={params.adminEntry} active="logs">
      <h2 className="mb-1 text-sm font-semibold text-white">System Logs</h2>
      <p className="mb-4 text-xs text-white/40">Most recent {entries.length} admin audit events. Never includes passwords, hashes, or secrets.</p>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-line bg-bg-surface p-6 text-center text-xs text-white/40">
          No audit log entries yet — either nothing has happened, or the database isn't configured on this deployment.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-bg-surface">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-white/40">
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Admin</th>
                <th className="px-4 py-2.5 font-medium">IP hash</th>
                <th className="px-4 py-2.5 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line/50 last:border-0">
                  <td className={`px-4 py-2.5 font-medium ${ACTION_STYLES[entry.action] ?? "text-white/70"}`}>{entry.action}</td>
                  <td className="px-4 py-2.5 text-white/60">{entry.admin_identifier ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-white/40">{entry.ip_hash ? `${entry.ip_hash.slice(0, 8)}…` : "—"}</td>
                  <td className="px-4 py-2.5 text-white/60">{new Date(entry.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminDashboardShell>
  );
}
