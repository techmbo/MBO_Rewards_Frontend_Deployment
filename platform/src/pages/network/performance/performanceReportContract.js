import { pickFields } from "../networkAccountContract.js";

/**
 * Network Operations → Performance Reports: frontend contract.
 *
 *   GET /ops/admin/performance?grain=network        performance:read
 *       controller: adminContract.controller#adminListPerformanceHandler
 *       service:    AdminContractService.listPerformance → NetworkPortalService.listNetworkPerformance
 *       rows:       NetworkPerformanceFact, one per network × account × day × supplier campaign ×
 *                   coupon × currency × country, shaped by toNetworkPerformanceResponseRow
 *                   (backend production 8896b2c)
 *       envelope:   { ok, data[], pagination, includeFinancial, kpis, contract, grainNote, ... }
 *       paging:     page, pageSize (backend max 100)
 *
 * Not used for this page: the default (client) grain, /reports/campaign and
 * /ops/admin/reporting-overview.
 *
 * Rules this file encodes:
 *   - Only the keys listed below are read off a row. Raw supplier references are never read, even
 *     if a backend version sends them.
 *   - Whether money is visible comes from the backend's own `financial.state`. Nothing here looks
 *     at the user's role or permissions.
 *   - Amounts stay in the row's own currency. Nothing is converted, and amounts in different
 *     currencies are never added together. Backend money KPIs are filter-wide sums that can mix
 *     currencies, so they are never treated as displayable.
 *   - Statuses are passed through as returned. Nothing is normalised again here.
 *
 * Pure data and pure functions only: no request is made from this file.
 */

export const PERFORMANCE_REPORT_PATH = "/ops/admin/performance";
export const PERFORMANCE_REPORT_GRAIN = "network";

// ── Fields ───────────────────────────────────────────────────────────────────

export const IDENTITY_FIELDS = Object.freeze([
  "id",
  "reportId",
  "network",
  "networkSource",
  "networkAccount",
  "reportDate",
  "date",
  "month",
  "year",
  "campaignSourceId",
  "supplierCampaignId",
  "brandName",
  "campaignName",
  "category",
  "country",
  "currency",
]);

export const CHANNEL_FIELDS = Object.freeze(["campaignTypeCommercial", "campaignChannelType", "campaignType"]);

export const COUPON_FIELDS = Object.freeze(["couponCode", "couponSource", "couponScope", "couponSourceScope"]);

export const CLICK_FIELDS = Object.freeze(["impressions", "networkClicks", "linkClicks", "mboLinkClicks", "uniqueClicks"]);

export const ORDER_COUNT_FIELDS = Object.freeze([
  "grossOrders",
  "pendingOrders",
  "confirmedOrders",
  "cancelledOrders",
  "rejectedOrders",
  "paidOrders",
  "netOrders",
]);

/** Sales amounts. The backend sends these with performance:read; no frontend gate is added. */
export const ORDER_VALUE_FIELDS = Object.freeze([
  "grossOrderValue",
  "pendingOrderValue",
  "confirmedOrderValue",
  "cancelledOrderValue",
  "rejectedOrderValue",
  "paidOrderValue",
  "netOrderValue",
]);

/** Commission and receivable amounts. The backend nulls these when `financial.state` is REDACTED. */
export const COMMISSION_FIELDS = Object.freeze([
  "grossCommission",
  "pendingCommission",
  "confirmedCommission",
  "cancelledCommission",
  "rejectedCommission",
  "payableCommission",
  "paidCommission",
  "netCommission",
  "mboReceivable",
  "mboActuallyReceived",
]);

/** Per-row ratios. `epc` is commission-derived and redacted with the commission fields. */
export const RATIO_FIELDS = Object.freeze(["conversionRate", "aov", "epc"]);

export const STATUS_FIELDS = Object.freeze(["attributionStatus", "reconciliationStatus", "rawStatus", "mboStandardStatus"]);

export const OTHER_FIELDS = Object.freeze([
  "discountPercent",
  "customerType",
  "devicePlatform",
  "reportGranularity",
  "lastSyncedAt",
  "lastUpdatedAt",
]);

/** Every key read off a row. `financial` is read separately and reduced to its state. */
export const PERFORMANCE_REPORT_FIELDS = Object.freeze([
  ...IDENTITY_FIELDS,
  ...CHANNEL_FIELDS,
  ...COUPON_FIELDS,
  ...CLICK_FIELDS,
  ...ORDER_COUNT_FIELDS,
  ...ORDER_VALUE_FIELDS,
  ...COMMISSION_FIELDS,
  ...RATIO_FIELDS,
  ...STATUS_FIELDS,
  ...OTHER_FIELDS,
]);

/** Never read, never rendered: raw supplier references and the unmapped source payload. */
export const BLOCKED_FIELDS = Object.freeze([
  "networkTrackingLink",
  "networkClickId",
  "mboClickId",
  "subId1",
  "subId2",
  "subId3",
  "subIds",
  "rawPayloadId",
  "sourceOnlyFields",
  "sourceOnlyFieldNames",
]);

// ── Financial state (from the backend, never inferred) ───────────────────────

export const FINANCIAL_STATE = Object.freeze({
  INCLUDED: "INCLUDED",
  REDACTED: "REDACTED",
  /** No recognisable state was returned. Money is treated as unavailable. */
  UNKNOWN: "UNKNOWN",
});

function toFinancialState(financial) {
  const state = financial && typeof financial === "object" ? financial.state : null;
  if (state === FINANCIAL_STATE.INCLUDED) return { state: FINANCIAL_STATE.INCLUDED, reason: null };
  if (state === FINANCIAL_STATE.REDACTED) {
    return { state: FINANCIAL_STATE.REDACTED, reason: typeof financial.reason === "string" ? financial.reason : null };
  }
  return { state: FINANCIAL_STATE.UNKNOWN, reason: null };
}

/** Projects one response row onto the allowlist. Anything else on the row is dropped. */
export function pickPerformanceReportFields(row) {
  const view = pickFields(row, PERFORMANCE_REPORT_FIELDS);
  if (!view) return null;
  view.financial = toFinancialState(row.financial);
  return view;
}

export function financialStateOf(row) {
  return row?.financial?.state === FINANCIAL_STATE.INCLUDED || row?.financial?.state === FINANCIAL_STATE.REDACTED
    ? row.financial.state
    : FINANCIAL_STATE.UNKNOWN;
}

export function isFinancialIncluded(row) {
  return financialStateOf(row) === FINANCIAL_STATE.INCLUDED;
}

export function isFinancialRedacted(row) {
  return financialStateOf(row) === FINANCIAL_STATE.REDACTED;
}

/**
 * Financial state for a whole loaded page. Rows decide when there are any. Otherwise only the
 * response's own `includeFinancial` flag is used. A mix of states, or nothing to go on, is UNKNOWN.
 */
export function responseFinancialState({ rows = [], includeFinancial } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length) {
    const states = new Set(list.map(financialStateOf));
    return states.size === 1 ? [...states][0] : FINANCIAL_STATE.UNKNOWN;
  }
  if (includeFinancial === true) return FINANCIAL_STATE.INCLUDED;
  if (includeFinancial === false) return FINANCIAL_STATE.REDACTED;
  return FINANCIAL_STATE.UNKNOWN;
}

// ── Currency and money summaries ─────────────────────────────────────────────

export const MONEY_SUMMARY_STATE = Object.freeze({
  /** One currency and the values are visible: a summary may be shown in that currency. */
  AVAILABLE: "AVAILABLE",
  /** The backend withheld the amounts for this caller. */
  REDACTED: "REDACTED",
  /** More than one currency: no combined amount is produced. */
  MIXED_CURRENCIES: "MIXED_CURRENCIES",
  /** Some row carries an amount with no currency: it cannot be added to anything. */
  UNKNOWN_CURRENCY: "UNKNOWN_CURRENCY",
  /** No row carries a value for these fields. */
  NO_DATA: "NO_DATA",
  /** Financial state unknown: amounts are not shown. */
  UNAVAILABLE: "UNAVAILABLE",
});

function hasNumber(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

function currencyCode(row) {
  const code = row?.currency == null ? "" : String(row.currency).trim().toUpperCase();
  return code || null;
}

/** Currencies of the rows that carry at least one of `fields` (all amount fields by default). */
export function currenciesInRows(rows, fields = [...ORDER_VALUE_FIELDS, ...COMMISSION_FIELDS]) {
  const set = new Set();
  let unknown = false;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!fields.some((f) => hasNumber(row?.[f]))) continue;
    const code = currencyCode(row);
    if (code) set.add(code);
    else unknown = true;
  }
  return { currencies: [...set].sort(), hasUnknownCurrency: unknown };
}

export function isSingleCurrency(rows, fields) {
  const { currencies, hasUnknownCurrency } = currenciesInRows(rows, fields);
  return currencies.length === 1 && !hasUnknownCurrency;
}

function isCommissionGroup(fields) {
  return fields.some((f) => COMMISSION_FIELDS.includes(f) || f === "epc");
}

/**
 * Whether a money summary over the LOADED rows can be shown for `fields`. Commission fields also
 * need the backend's INCLUDED state; order values do not, because the backend sends them with
 * performance:read.
 */
export function moneySummaryState(rows, fields = ORDER_VALUE_FIELDS, { financialState } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (isCommissionGroup(fields)) {
    const state = financialState ?? responseFinancialState({ rows: list });
    if (state === FINANCIAL_STATE.REDACTED) return { state: MONEY_SUMMARY_STATE.REDACTED, currency: null, currencies: [] };
    if (state !== FINANCIAL_STATE.INCLUDED) return { state: MONEY_SUMMARY_STATE.UNAVAILABLE, currency: null, currencies: [] };
  }
  const { currencies, hasUnknownCurrency } = currenciesInRows(list, fields);
  if (!currencies.length && !hasUnknownCurrency) return { state: MONEY_SUMMARY_STATE.NO_DATA, currency: null, currencies };
  if (hasUnknownCurrency) return { state: MONEY_SUMMARY_STATE.UNKNOWN_CURRENCY, currency: null, currencies };
  if (currencies.length > 1) return { state: MONEY_SUMMARY_STATE.MIXED_CURRENCIES, currency: null, currencies };
  return { state: MONEY_SUMMARY_STATE.AVAILABLE, currency: currencies[0], currencies };
}

/**
 * Sums `fields` over the LOADED rows only when moneySummaryState is AVAILABLE. Otherwise `totals`
 * is null. A field with no value on any row stays null and is never shown as 0. The result is
 * page-scoped; it is never a filter-wide total.
 */
export function summarizeLoadedMoney(rows, fields = ORDER_VALUE_FIELDS, options = {}) {
  const status = moneySummaryState(rows, fields, options);
  if (status.state !== MONEY_SUMMARY_STATE.AVAILABLE) return { ...status, scope: "LOADED_ROWS", totals: null };
  const totals = {};
  for (const field of fields) {
    let sum = null;
    for (const row of rows) {
      if (!hasNumber(row?.[field])) continue;
      sum = (sum ?? 0) + Number(row[field]);
    }
    totals[field] = sum == null ? null : Number(sum.toFixed(4));
  }
  return { ...status, scope: "LOADED_ROWS", totals };
}

// ── Backend KPIs ─────────────────────────────────────────────────────────────

/** Filter-wide count KPIs from the backend. These are the only KPIs treated as displayable. */
export const COUNT_KPI_KEYS = Object.freeze([
  "networkClicks",
  "linkClicks",
  "mboLinkClicks",
  "grossOrders",
  "confirmedOrders",
  "netOrders",
]);

/**
 * Money KPIs the backend returns. They are summed across every currency in the filter, and this
 * endpoint has no currency filter, so they are never shown.
 */
export const UNSAFE_MONEY_KPI_KEYS = Object.freeze(["grossCommission", "confirmedCommission", "netCommission", "mboReceivable"]);

/** Count KPIs only. A missing or non-numeric value stays null and is never shown as 0. */
export function safeCountKpis(kpis) {
  const out = {};
  for (const key of COUNT_KPI_KEYS) {
    const value = kpis && typeof kpis === "object" ? kpis[key] : null;
    out[key] = hasNumber(value) ? Number(value) : null;
  }
  return out;
}

// ── Filters and paging ───────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function normalizePageSize(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, n);
}

/** SupplierKey values the fact table stores. Any other value fails server-side, so none is sent. */
export const NETWORK_FILTER_OPTIONS = Object.freeze([
  "BOOSTINY",
  "OPTIMISE",
  "TRACKIER",
  "PARTNERIZE",
  "IMPACT",
  "AWIN",
  "ADMITAD",
  "CJ",
  "RAKUTEN",
]);

/**
 * Networks whose sync code writes performance facts (read from the backend sync jobs, not proven
 * in production data). Filtering on another network returns an empty page.
 */
export const FACT_INGESTING_NETWORKS = Object.freeze(["BOOSTINY", "OPTIMISE", "TRACKIER", "PARTNERIZE", "IMPACT", "AWIN"]);

/** CampaignChannelType values the server's channel filter accepts (UNKNOWN is ignored there). */
export const CHANNEL_FILTER_OPTIONS = Object.freeze([
  { value: "AFFILIATE_LINK_ONLY", label: "Link" },
  { value: "COUPON_CODE_ONLY", label: "Coupon" },
  { value: "COUPON_AND_LINK", label: "Link + Coupon" },
  { value: "DEEPLINK", label: "Deeplink" },
]);

/**
 * Filters the network-grain query applies server-side. Paging (page, pageSize) is passed
 * separately.
 */
export const SUPPORTED_FILTERS = Object.freeze([
  { key: "from", param: "from", help: "reportDate on or after (YYYY-MM-DD)." },
  { key: "to", param: "to", help: "reportDate on or before (YYYY-MM-DD)." },
  { key: "date", param: "date", help: "A single reportDate. When set, the backend ignores from / to." },
  { key: "network", param: "network", help: "Exact network (SupplierKey)." },
  { key: "brand", param: "brand", help: "Brand name contains (case-insensitive)." },
  { key: "channel", param: "campaignType", help: "Campaign channel type (Link / Coupon / Link + Coupon / Deeplink)." },
  {
    key: "q",
    param: "q",
    help: "Contains search over brand, campaign, coupon, report id, supplier campaign id and campaign source id. The server also matches click ids.",
  },
  {
    key: "status",
    param: "status",
    help: "Exact attribution status or reconciliation status (case-insensitive). This is NOT an order status.",
  },
]);

/** Accepted by the controller but ignored on the network grain, or not accepted at all. Never offered. */
export const UNSUPPORTED_FILTERS = Object.freeze([
  { key: "country", reason: "Accepted by the controller but ignored on the network grain." },
  { key: "currency", reason: "Accepted by the controller but ignored on the network grain." },
  { key: "campaign", reason: "No campaign id filter on the network grain." },
  { key: "client", reason: "Performance facts carry no client." },
  { key: "merchant", reason: "Accepted by the controller but ignored on the network grain." },
  { key: "orderStatus", reason: "`status` filters attribution / reconciliation status, not order status." },
]);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(value) {
  const text = value == null ? "" : String(value).trim().slice(0, 10);
  return ISO_DAY.test(text) && !Number.isNaN(new Date(`${text}T00:00:00.000Z`).getTime()) ? text : null;
}

function text(value) {
  const t = value == null ? "" : String(value).trim();
  return t || null;
}

/**
 * Query params for GET /ops/admin/performance (without page / pageSize). Always network grain.
 * Unsupported keys are dropped, and so are network or channel values the server would reject or
 * ignore. A single `date` replaces from / to, as the backend does.
 */
export function buildPerformanceReportParams(filters = {}) {
  const params = { grain: PERFORMANCE_REPORT_GRAIN };
  const single = day(filters.date);
  if (single) {
    params.date = single;
  } else {
    const from = day(filters.from);
    const to = day(filters.to);
    if (from) params.from = from;
    if (to) params.to = to;
  }
  const network = text(filters.network)?.toUpperCase();
  if (network && NETWORK_FILTER_OPTIONS.includes(network)) params.network = network;
  const brand = text(filters.brand);
  if (brand) params.brand = brand;
  const channel = text(filters.channel);
  if (channel && CHANNEL_FILTER_OPTIONS.some((o) => o.value === channel)) params.campaignType = channel;
  const q = text(filters.q);
  if (q) params.q = q;
  const status = text(filters.status);
  if (status) params.status = status;
  return params;
}

// ── Labels and meanings ──────────────────────────────────────────────────────

/** Column labels for the page. Every key is in PERFORMANCE_REPORT_FIELDS. */
export const FIELD_LABELS = Object.freeze({
  networkSource: "Network",
  brandName: "Brand",
  campaignName: "Campaign",
  campaignType: "Channel",
  couponCode: "Coupon",
  impressions: "Impressions",
  linkClicks: "Link Clicks",
  mboLinkClicks: "MBO Link Clicks",
  uniqueClicks: "Unique Clicks",
  grossOrders: "Gross Orders",
  grossOrderValue: "Gross Order Value",
  grossCommission: "Gross Commission",
  confirmedOrders: "Confirmed Orders",
  confirmedOrderValue: "Confirmed Order Value",
  confirmedCommission: "Confirmed Commission",
  cancelledOrders: "Cancelled Orders",
  rejectedOrders: "Rejected Orders",
  netOrders: "Net Orders",
  netOrderValue: "Net Order Value",
  netCommission: "Net Commission",
  payableCommission: "Payable Commission",
  paidCommission: "Paid Commission",
  mboReceivable: "MBO Receivable (supplier)",
  mboActuallyReceived: "MBO Actually Received",
  country: "Country",
  currency: "Currency",
  date: "Date",
  lastSyncedAt: "Last Synced",
});

/** What each click, amount and status field means. Kept distinct; none is simply "Commission". */
export const FIELD_DESCRIPTIONS = Object.freeze({
  linkClicks: "Clicks reported by the network (network clicks). Not MBO link clicks.",
  mboLinkClicks: "Clicks on MBO tracking links for the same campaign source and day. Independent of network clicks; null when unknown.",
  netOrders: "Confirmed orders (the backend's net value).",
  netOrderValue: "Confirmed order value (the backend's net value).",
  grossCommission: "Supplier commission on all orders as reported by the network. Not final.",
  confirmedCommission: "Commission the network has approved. Closest current figure to network-approved commission; approved is not paid.",
  payableCommission: "Payable as reported by the network. Falls back to the confirmed commission when the network sends none.",
  paidCommission: "Paid commission as reported by the network.",
  netCommission: "Alias of the confirmed commission (payable when confirmed is missing). Not a separate figure.",
  mboReceivable: "Supplier commission owed to MBO. Defaults to the confirmed commission. NOT MBO margin and NOT client payable.",
  mboActuallyReceived: "Settlement / bank receipt evidence only. Null unless provided.",
  epc: "Earnings per click as reported. Commission-derived; withheld with commission.",
  aov: "Average order value as reported.",
  currency: "The row's own reporting currency. Amounts are never converted.",
  attributionStatus: "Attribution status as returned.",
  reconciliationStatus: "Reconciliation status as returned.",
  rawStatus: "The network's own status as returned.",
  mboStandardStatus: "MBO standard status mapped by the backend.",
});

/** Default and compact column sets, following the v13 Performance Reports view modes. */
export const DEFAULT_COLUMNS = Object.freeze([
  "networkSource",
  "brandName",
  "campaignName",
  "campaignType",
  "couponCode",
  "linkClicks",
  "grossOrders",
  "grossOrderValue",
  "grossCommission",
  "netOrders",
  "netOrderValue",
  "netCommission",
  "confirmedOrders",
  "currency",
  "date",
]);

export const COMPACT_COLUMNS = Object.freeze([
  "networkSource",
  "brandName",
  "linkClicks",
  "grossOrders",
  "grossOrderValue",
  "netOrders",
  "netCommission",
  "currency",
  "date",
]);

// ── Known backend gaps (stated, never faked) ─────────────────────────────────

export const BACKEND_GAPS = Object.freeze([
  "No server-side country, currency, campaign, client or order-status filter on the network grain.",
  "Money KPIs are summed across currencies; there is no per-currency total.",
  "No daily, per-network or per-country totals endpoint.",
  "No client payable commission or MBO margin at network grain.",
  "Customer type, order / confirmed / payment-confirmed dates and discount % are usually null.",
  "Admitad, CJ and Rakuten write no performance facts.",
]);
