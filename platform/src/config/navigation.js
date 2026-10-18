import { PERMISSIONS } from "../auth/permissions";

/**
 * Staff + portal information architecture.
 * Business-friendly labels only — no epic codes, schema names, or engineering jargon.
 */
export const NAV_SECTIONS = [
  {
    id: "portal",
    label: "Client Portal",
    items: [
      { path: "/portal", label: "Dashboard", permissions: [PERMISSIONS.PORTAL_CAMPAIGNS_READ], icon: "overview" },
      {
        path: "/portal/campaigns",
        label: "Campaigns",
        permissions: [PERMISSIONS.PORTAL_CAMPAIGNS_READ],
        icon: "campaigns",
      },
      {
        path: "/portal/performance",
        label: "Performance",
        permissions: [PERMISSIONS.PORTAL_PERFORMANCE_READ],
        icon: "performance",
      },
      {
        path: "/portal/payable-statements",
        label: "Payable Statements",
        permissions: [PERMISSIONS.PORTAL_PAYMENTS_READ],
        icon: "payments",
      },
      {
        path: "/portal/withdrawal-requests",
        label: "Withdrawal Requests",
        permissions: [PERMISSIONS.PORTAL_PAYMENTS_READ],
        icon: "withdrawals",
      },
      {
        path: "/portal/payments",
        label: "Payments",
        permissions: [PERMISSIONS.PORTAL_PAYMENTS_READ],
        icon: "finance",
      },
      {
        path: "/portal/settings",
        label: "Profile",
        permissions: [PERMISSIONS.PORTAL_SETTINGS_READ],
        icon: "settings",
      },
    ],
  },
  {
    id: "network-ops",
    label: "Network Operations",
    items: [
      { path: "/", label: "Dashboard", permissions: [], staffOnly: true, icon: "overview", exact: true },
      {
        path: "/network/accounts",
        label: "Network Accounts",
        permissions: [PERMISSIONS.CAMPAIGNS_READ],
        icon: "networks",
      },
      {
        path: "/network/data",
        label: "All Network Data",
        permissions: [PERMISSIONS.CAMPAIGNS_READ],
        icon: "data",
      },
      {
        path: "/network/campaigns",
        label: "Campaigns",
        permissions: [PERMISSIONS.CATALOG_READ],
        icon: "campaigns",
      },
      {
        path: "/network/commission-rules",
        label: "Supplier Commission Rules",
        permissions: [PERMISSIONS.COMMISSION_READ],
        icon: "finance",
      },
      {
        path: "/network/coupons",
        label: "Coupons / Vouchers",
        permissions: [PERMISSIONS.COUPONS_READ],
        icon: "coupons",
      },
      {
        path: "/network/tracking-links",
        label: "Tracking Links",
        permissions: [PERMISSIONS.TRACKING_READ],
        icon: "links",
      },
      {
        path: "/network/supplier-tracking-links",
        label: "Supplier Tracking Links",
        permissions: [PERMISSIONS.TRACKING_READ],
        icon: "links",
      },
      {
        path: "/ops/network/offers",
        label: "Offers / Promotions",
        permissions: [PERMISSIONS.COUPONS_READ],
        icon: "coupons",
      },
      {
        path: "/network/performance",
        label: "Performance Reports",
        permissions: [PERMISSIONS.PERFORMANCE_READ],
        icon: "performance",
      },
      {
        path: "/network/orders",
        label: "Orders / Conversions",
        permissions: [PERMISSIONS.CONVERSIONS_READ],
        icon: "orders",
      },
      {
        path: "/network/products",
        label: "Products / Feeds",
        permissions: [PERMISSIONS.PRODUCTS_READ],
        icon: "products",
      },
    ],
  },
  {
    id: "network-finance",
    label: "Finance",
    items: [
      {
        path: "/ops/admin/payment-status",
        label: "Payment Status",
        permissions: [PERMISSIONS.FINANCE_OPS_READ],
        icon: "payments",
      },
      {
        path: "/ops/admin/network-billing",
        label: "Network Invoices",
        permissions: [PERMISSIONS.FINANCE_OPS_READ],
        icon: "finance",
      },
      {
        path: "/ops/admin/network-payments-received",
        label: "Network Payments",
        permissions: [PERMISSIONS.FINANCE_OPS_READ],
        icon: "payments",
      },
      {
        path: "/ops/admin/mbo-receipts",
        label: "MBO Receipts",
        permissions: [PERMISSIONS.FINANCE_OPS_READ],
        icon: "finance",
      },
      {
        path: "/ops/reconciliation",
        label: "Reconciliation",
        permissions: [PERMISSIONS.FINANCE_OPS_READ],
        icon: "finance",
      },
    ],
  },
  {
    id: "network-integrity",
    label: "Data Integrity",
    items: [
      {
        path: "/ops/exceptions",
        label: "Exceptions",
        permissions: [PERMISSIONS.EXCEPTIONS_READ],
        icon: "issues",
      },
      {
        path: "/ops/sync-runs",
        label: "Sync Run History",
        permissions: [PERMISSIONS.OPS_READ],
        icon: "sync",
      },
      {
        path: "/ops/network/raw-payload",
        label: "Full Raw Payload",
        permissions: [PERMISSIONS.OPS_READ],
        icon: "sync",
      },
      {
        path: "/ops/network/source-schema",
        label: "Source Schema",
        permissions: [PERMISSIONS.OPS_READ],
        icon: "data",
      },
      {
        path: "/ops/network/mapping-rules",
        label: "Mapping Rules",
        permissions: [PERMISSIONS.OPS_READ],
        icon: "sync",
      },
      {
        path: "/ops/network/naming-standard",
        label: "MBO Naming Standard",
        permissions: [PERMISSIONS.OPS_READ],
        icon: "description",
      },
      {
        path: "/integrity/api-credentials",
        label: "API Credentials",
        permissions: [PERMISSIONS.INTEGRATIONS_READ],
        icon: "integrations",
      },
      {
        path: "/integrations",
        label: "Network Integrations",
        permissions: [PERMISSIONS.INTEGRATIONS_READ],
        icon: "integrations",
      },
      {
        path: "/ops/network/guide",
        label: "Tech Guide",
        permissions: [PERMISSIONS.CAMPAIGNS_READ],
        icon: "description",
      },
    ],
  },
  {
    id: "master",
    label: "Master Catalog",
    items: [
      { path: "/master/dashboard", label: "Dashboard", permissions: [PERMISSIONS.CAMPAIGNS_READ], icon: "overview" },
      {
        path: "/master/brands",
        label: "Brands",
        permissions: [PERMISSIONS.CAMPAIGNS_READ],
        icon: "brands",
        badgeKey: "brands",
      },
      {
        path: "/master/campaigns",
        label: "Master Campaigns",
        permissions: [PERMISSIONS.CAMPAIGNS_READ],
        icon: "campaigns",
        badgeKey: "masterCampaigns",
      },
      {
        path: "/master/assign",
        label: "Assign Campaigns",
        permissions: [PERMISSIONS.CLIENTS_READ],
        icon: "assignments",
      },
      {
        path: "/master/review",
        label: "Assignment Review",
        permissions: [PERMISSIONS.CLIENTS_READ],
        icon: "review",
        badgeKey: "assignmentReview",
      },
      {
        path: "/master/code-alerts",
        label: "New Code Alerts",
        permissions: [PERMISSIONS.COUPONS_READ],
        icon: "alerts",
        badgeKey: "newCodeAlerts",
      },
    ],
  },
  {
    id: "master-reading",
    label: "Reading & Implementation",
    items: [
      {
        path: "/master/guide",
        label: "Guide / Tech Notes",
        permissions: [PERMISSIONS.CAMPAIGNS_READ],
        icon: "description",
      },
    ],
  },
  {
    id: "client-ops",
    label: "Client Operations",
    items: [
      { path: "/clients", label: "Clients", permissions: [PERMISSIONS.CLIENTS_READ], icon: "clients", badgeKey: "clients" },
      { path: "/assignments", label: "Assignments", permissions: [PERMISSIONS.CLIENTS_READ], icon: "assignments" },
      { path: "/tracking-links", label: "Client Tracking Links", permissions: [PERMISSIONS.TRACKING_READ], icon: "links" },
      { path: "/reports/clients", label: "Client Reports", permissions: [PERMISSIONS.PERFORMANCE_READ], icon: "reports" },
      { path: "/reports/campaigns", label: "Campaign Reports", permissions: [PERMISSIONS.PERFORMANCE_READ], icon: "reports" },
      { path: "/clicks", label: "Clicks", permissions: [PERMISSIONS.TRACKING_READ], icon: "performance" },
      { path: "/conversions", label: "Conversions", permissions: [PERMISSIONS.CONVERSIONS_READ], icon: "orders" },
    ],
  },
  {
    id: "client-and-reporting",
    label: "Client and Reporting",
    items: [
      {
        path: "/ops/admin/reporting-overview",
        label: "Reporting Overview",
        permissions: [PERMISSIONS.PERFORMANCE_READ],
        icon: "reports",
      },
      {
        path: "/ops/admin/client-raw-performance",
        label: "Raw Performance",
        permissions: [PERMISSIONS.PERFORMANCE_READ],
        icon: "performance",
      },
      {
        path: "/ops/admin/confirmed-orders",
        label: "Confirmed Orders",
        permissions: [PERMISSIONS.CONVERSIONS_READ],
        icon: "orders",
      },
      {
        path: "/ops/admin/client-overview",
        label: "Client Overview",
        permissions: [PERMISSIONS.PERFORMANCE_READ],
        icon: "reports",
      },
      {
        path: "/ops/admin/client-performance",
        label: "Client Performance",
        permissions: [PERMISSIONS.PERFORMANCE_READ],
        icon: "performance",
      },
      {
        path: "/ops/admin/client-confirmed-orders",
        label: "Client Confirmed Orders",
        permissions: [PERMISSIONS.CONVERSIONS_READ],
        icon: "orders",
      },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      {
        path: "/commission-rules",
        label: "Commission Rules",
        permissions: [PERMISSIONS.COMMISSION_MANAGE],
        icon: "rules",
      },
      {
        path: "/admin/coupons",
        label: "Coupon Admin",
        permissions: [PERMISSIONS.COUPONS_WRITE],
        icon: "coupons",
      },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    items: [
      { path: "/users", label: "Users", permissions: [PERMISSIONS.USERS_MANAGE], icon: "users" },
      { path: "/platform/logs", label: "Access Logs", permissions: [PERMISSIONS.LOGS_READ], icon: "logs" },
    ],
  },
];

const PORTAL_PERMS = new Set([
  PERMISSIONS.PORTAL_CAMPAIGNS_READ,
  PERMISSIONS.PORTAL_PERFORMANCE_READ,
  PERMISSIONS.PORTAL_PAYMENTS_READ,
  PERMISSIONS.PORTAL_PAYMENTS_MANAGE,
  PERMISSIONS.PORTAL_SETTINGS_READ,
  PERMISSIONS.PORTAL_SUPPORT,
]);

export function getVisibleNav(user) {
  const isClient = user?.role === "CLIENT";
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (isClient) {
        return (item.permissions || []).some((p) => PORTAL_PERMS.has(p));
      }
      if ((item.permissions || []).some((p) => PORTAL_PERMS.has(p)) && section.id === "portal") {
        return false;
      }
      if (item.staffOnly && isClient) return false;
      if (!item.permissions?.length) return !isClient;
      return item.permissions.some((p) => user?.permissions?.includes(p));
    }),
  })).filter((section) => section.items.length > 0);
}

export function isNavItemActive(item, pathname) {
  if (item.path === pathname) return true;
  if (item.exact || item.path === "/") return false;
  return pathname.startsWith(`${item.path}/`);
}

export function findNavItem(pathname) {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((entry) => entry.path === pathname);
    if (item) return { section, item };
  }
  // Prefix match for nested paths
  let best = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.path !== "/" && pathname.startsWith(item.path)) {
        if (!best || item.path.length > best.item.path.length) {
          best = { section, item };
        }
      }
    }
  }
  return best;
}

export const PORTAL_NAV = NAV_SECTIONS.find((s) => s.id === "portal")?.items || [];
