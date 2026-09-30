/** After login, prefetch list APIs in the background so first clicks render from cache. */
import { fetchApi } from "../api";

const dataPrefetched = new Set();

/** Primary list/summary requests each route makes on first paint. */
const ROUTE_DATA_PREFETCH = {
  "/": () =>
    Promise.allSettled([
      fetchApi("/ops/network/dashboard").catch(() => null),
      fetchApi("/reports/daily", { page: 1, pageSize: 30 }).catch(() => null),
    ]),
  "/suppliers": () => fetchApi("/suppliers", {}),
  "/clients": () => fetchApi("/clients", { page: 1, pageSize: 25 }),
  "/ops/network/all-data": () =>
    fetchApi("/ops/imported-records", { entityType: "campaign", page: 1, pageSize: 25 }),
  "/ops/admin/orders": () => fetchApi("/ops/admin/orders", { page: 1, pageSize: 25 }),
  "/data/entities": () =>
    Promise.allSettled([
      fetchApi("/ops/imported-records", { recordType: "campaign", page: 1, pageSize: 25 }),
      fetchApi("/ops/imported-records/summary", { recordType: "campaign" }),
    ]),
  "/integrations": () => fetchApi("/marketplace/accounts"),
  "/master/campaigns": () => fetchApi("/supplier-campaigns", { page: 1, pageSize: 25 }),
  "/master/brands": () => fetchApi("/supplier-campaigns/brands", { page: 1, pageSize: 25 }),
  "/master/dashboard": () => fetchApi("/master/catalog-summary"),
  "/assignments": () => fetchApi("/client-assignments", { page: 1, pageSize: 25 }),
  "/ops/admin/performance": () => fetchApi("/entities", { type: "performance", page: 1, pageSize: 25 }),
  "/portal": () => fetchApi("/portal/v1/dashboard-summary").catch(() => fetchApi("/portal/v1/overview")),
  "/portal/campaigns": () =>
    Promise.allSettled([
      fetchApi("/portal/v1/campaigns", { page: 1, pageSize: 25 }),
    ]),
};

const PRIORITY_STAFF = [
  "/suppliers",
  "/clients",
  "/data/entities",
  "/ops/network/all-data",
  "/ops/admin/orders",
  "/integrations",
];
const PRIORITY_PORTAL = ["/portal/campaigns", "/portal/performance", "/portal/payments"];

function resolvePrefetchPath(pathname) {
  if (ROUTE_DATA_PREFETCH[pathname]) return pathname;
  if (pathname.startsWith("/clients/")) return "/clients";
  const match = Object.keys(ROUTE_DATA_PREFETCH)
    .filter((path) => path !== "/" && pathname.startsWith(path))
    .sort((a, b) => b.length - a.length)[0];
  return match ?? null;
}

export function prefetchRouteData(pathname) {
  const path = resolvePrefetchPath(pathname);
  if (!path || dataPrefetched.has(path)) return;
  const loader = ROUTE_DATA_PREFETCH[path];
  if (!loader) return;
  dataPrefetched.add(path);
  Promise.resolve(loader()).catch(() => {
    dataPrefetched.delete(path);
  });
}

/** Warm API cache — call on hover or mousedown before navigation. */
export function warmRoute(pathname) {
  prefetchRouteData(pathname);
}

export function prefetchAllRouteChunks() {
  // Pages are eager-loaded in AppRoutes; nothing to prefetch.
}

export function prefetchAllRouteData() {
  for (const loader of Object.values(ROUTE_DATA_PREFETCH)) {
    Promise.resolve(loader()).catch(() => {});
  }
}

export function prefetchOnIntent(pathname) {
  warmRoute(pathname);
}

/** @deprecated Pages are eager-loaded; only API warmup runs. */
export function scheduleNavigationWarmup(paths) {
  prefetchAllRouteData();
  const unique = [...new Set(paths.filter(Boolean))];
  unique.forEach((path) => warmRoute(path));
}
