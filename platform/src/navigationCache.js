/**
 * Aggressive navigation cache — preload every route chunk + list API after login
 * so page switches render instantly from memory.
 */
import { fetchApi } from "./api";
import { prefetchAllRouteChunks, prefetchAllRouteData } from "./routes/routePrefetch";

let warmedForSession = false;

const STAFF_API_WARMUP = [
  () => fetchApi("/suppliers", {}),
  () => fetchApi("/ops/network/dashboard").catch(() => null),
  () => fetchApi("/reports/daily", { page: 1, pageSize: 30 }).catch(() => null),
  () => fetchApi("/master/catalog-summary"),
  () => fetchApi("/clients", { page: 1, pageSize: 25 }),
  () => fetchApi("/ops/imported-records", { entityType: "campaign", page: 1, pageSize: 25 }),
  () => fetchApi("/ops/imported-records", { recordType: "campaign", page: 1, pageSize: 25 }),
  () => fetchApi("/ops/imported-records/summary", { recordType: "campaign" }),
  () => fetchApi("/ops/admin/orders", { page: 1, pageSize: 25 }),
  () => fetchApi("/supplier-campaigns", { page: 1, pageSize: 25 }),
  () => fetchApi("/supplier-campaigns", { page: 1, pageSize: 50 }),
  () => fetchApi("/supplier-campaigns/brands", { page: 1, pageSize: 25 }),
  () => fetchApi("/client-assignments", { page: 1, pageSize: 25 }),
  () => fetchApi("/entities", { type: "performance", page: 1, pageSize: 25 }),
  () => fetchApi("/conversions", { page: 1, pageSize: 25 }),
  () => fetchApi("/marketplace/accounts"),
  () => fetchApi("/ops/metrics").catch(() => null),
  () => fetchApi("/logs/access", { page: 1, pageSize: 8 }).catch(() => null),
];

const PORTAL_API_WARMUP = [
  () => fetchApi("/portal/v1/me"),
  () => fetchApi("/portal/v1/notifications"),
  () => fetchApi("/portal/v1/dashboard-summary").catch(() => fetchApi("/portal/v1/overview")),
  () => fetchApi("/portal/v1/campaigns", { page: 1, pageSize: 25 }),
];

/** Preload all JS chunks + API responses once per session. */
export function warmNavigationCache({ isPortal = false } = {}) {
  if (warmedForSession) return;
  warmedForSession = true;

  prefetchAllRouteChunks();
  prefetchAllRouteData();

  const apiJobs = isPortal ? PORTAL_API_WARMUP : STAFF_API_WARMUP;
  for (const job of apiJobs) {
    Promise.resolve(job()).catch(() => {});
  }
}

export function resetNavigationCacheWarmup() {
  warmedForSession = false;
}
