import { notFound, redirect } from "next/navigation";
import { isValidAdminEntryPath, requireAdminSession } from "@/lib/admin/auth";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

// ---------------------------------------------------------------------------
// Phase 6.6.0.1 section 1 + 2 — private admin entry.
//
// This is a catch-all single-segment dynamic route at the app root. Next.js
// always resolves a static folder (app/dashboard, app/wallet, app/earn, ...)
// before falling back to a dynamic one at the same level, so this can never
// shadow any existing top-level page — it only ever activates for a path
// segment that isn't already one of this app's real routes. That's what
// lets ADMIN_ENTRY_PATH be an arbitrary env-var string instead of a
// hardcoded folder name.
//
// A mismatched segment calls notFound() — same 404 a person gets for any
// other unknown URL, so probing this path is indistinguishable from
// probing a random one. Per section 2, the private path is not itself
// authentication: even a matching segment still requires the login form
// below, and a stale/expired session still bounces back here.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default function AdminEntryPage({ params }: { params: { adminEntry: string } }) {
  if (!isValidAdminEntryPath(params.adminEntry)) {
    notFound();
  }

  if (requireAdminSession()) {
    redirect(`/${params.adminEntry}/dashboard`);
  }

  return <AdminLoginForm adminEntry={params.adminEntry} />;
}
