import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { PLATFORM_NAME } from "../../config/brand";
import { getVisibleNav, isNavItemActive } from "../../config/navigation";
import { useAuth } from "../../context/AuthContext";
import { fetchApi } from "../../api";
import { hasPermission, PERMISSIONS } from "../../auth/permissions";
import { Icon } from "../ui/Icon";
import { prefetchOnIntent } from "../../routes/routePrefetch";

export function Sidebar({ mobileOpen, onClose, collapsed = false, onToggleCollapse }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const sections = getVisibleNav(user);
  const width = collapsed ? "w-[72px]" : "w-64";
  const [navCounts, setNavCounts] = useState(null);

  useEffect(() => {
    if (!user || user.role === "CLIENT") return;
    let active = true;

    const loads = [];
    if (hasPermission(user, PERMISSIONS.CAMPAIGNS_READ)) {
      loads.push(
        fetchApi("/master/catalog-summary")
          .then((res) => res?.data?.navCounts ?? res?.navCounts ?? {})
          .catch(() => ({})),
      );
    }
    if (hasPermission(user, PERMISSIONS.CLIENTS_READ)) {
      loads.push(
        fetchApi("/ops/client/guide")
          .then((res) => res?.data?.navCounts ?? res?.navCounts ?? {})
          .catch(() => ({})),
      );
    }

    if (!loads.length) return undefined;

    Promise.all(loads).then((parts) => {
      if (active) setNavCounts(Object.assign({}, ...parts));
    });

    return () => {
      active = false;
    };
  }, [user]);

  return (
    <>
      {mobileOpen && (
        <button type="button" className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex ${width} shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className={`border-b border-slate-100 ${collapsed ? "px-3 py-4" : "px-4 py-4"}`}>
          <div className="flex items-center justify-between gap-2">
            <Link to="/" className="min-w-0" onClick={onClose}>
              {collapsed ? (
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-700 text-sm font-bold text-white">
                  M
                </span>
              ) : (
                <>
                  <span className="block truncate text-[15px] font-bold tracking-tight text-brand-800">
                    {PLATFORM_NAME}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Operations
                  </span>
                </>
              )}
            </Link>
            {onToggleCollapse ? (
              <button
                type="button"
                className="hidden h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:grid"
                onClick={onToggleCollapse}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <Icon name={collapsed ? "expand" : "collapse"} size={18} />
              </button>
            ) : null}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {sections.map((section) => (
            <div key={section.id} className="mb-4">
              {!collapsed ? (
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {section.label}
                </p>
              ) : (
                <div className="mb-1 border-t border-slate-100" />
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isNavItemActive(item, pathname);
                  const badge =
                    item.badgeKey && navCounts?.[item.badgeKey] != null
                      ? Number(navCounts[item.badgeKey])
                      : null;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={onClose}
                        onMouseEnter={() => prefetchOnIntent(item.path)}
                        onFocus={() => prefetchOnIntent(item.path)}
                        onMouseDown={() => prefetchOnIntent(item.path)}
                        onTouchStart={() => prefetchOnIntent(item.path)}
                        title={item.label}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${
                          active
                            ? "bg-brand-50 text-brand-800 shadow-[inset_3px_0_0_#1f6bb8]"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        } ${collapsed ? "justify-center" : ""}`}
                      >
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center ${
                            active ? "text-brand-700" : "text-slate-500"
                          }`}
                        >
                          <Icon name={item.icon || "circle"} size={18} />
                        </span>
                        {!collapsed ? (
                          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                            <span className="truncate">{item.label}</span>
                            {badge != null && badge > 0 ? (
                              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
                                {badge.toLocaleString("en-US")}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
