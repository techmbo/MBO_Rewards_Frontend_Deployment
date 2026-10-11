import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNavigationWarmup } from "../../hooks/useNavigationWarmup";
import { PortalShell } from "./PortalShell";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";

/**
 * TEMPORARY. Rendered only when the backend reports the bypass live — which it never does in
 * production. Remove with the rest of the bypass.
 */
export function DevAuthBypassBanner() {
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950"
    >
      DEV AUTH BYPASS ACTIVE — signed in as a synthetic admin. Preview only; not a real session.
    </div>
  );
}

export function AppShell() {
  const { user, devBypass } = useAuth();
  useNavigationWarmup(user);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (user?.role === "CLIENT") {
    return <PortalShell />;
  }

  return (
    <div className="min-h-dvh bg-surface-page">
      {devBypass && <DevAuthBypassBanner />}
      <div className="lg:flex">
        <Sidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <TopNav onMenuClick={() => setMobileOpen(true)} />
          <main className="flex-1 p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
