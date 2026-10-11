import { isUrlLike } from "../couponsVouchers/couponCodeSafety.js";

/**
 * Network Operations → Orders / Conversions: frontend contract (first release: Orders only).
 *
 *   GET /ops/admin/orders                          conversions:read
 *       controller: adminContract.controller#adminListOrdersHandler
 *       service:    AdminContractService.listOrders → Order + latest conversion / click
 *       rows:       one per Order, shaped by toAdminOrderDto (backend production 3d0e572)
 *       envelope:   { ok, data[], pagination{ page, pageSize, total, totalPages, hasMore },
 *                     includeFinancial, contract: "v15-07E-admin-orders" }
 *       paging:     page, pageSize (backend default 25, max 100)
 *       sort:       orderDate descending, fixed server-side (orders with no date come first)
 *
 * Not used for this page: GET /api/conversions, GET /api/clicks and
 * GET /ops/admin/client-confirmed-orders.
 *
 * Rules this file encodes:
 *   - Only the keys listed below are read off a row. Raw attribution references (tracking URLs,
 *     click ids, sub ids, raw payload id) and supplier coupon URLs are never read, even if a
 *     backend version sends them. Any URL-shaped string on an allowed key is dropped too.
 *   - Whether money is visible comes from the backend's own row `financial` object. Nothing here
 *     looks at the user's role or permissions, and a null amount is never read as "redacted".
 *   - Order lifecycle, validation, supplier payment, client payment, attribution and
 *     reconciliation statuses stay separate and are passed through as returned. Nothing is
 *     normalised again here.
 *   - Amounts stay in their own currency (order value in `currency`, commission in
 *     `commissionCurrency`). Nothing is converted and different currencies are never added.
 *     Summaries cover the loaded rows only.
 *
 * Pure data and pure functions only: no request is made from this file.
 */

export const ORDERS_PATH = "/ops/admin/orders";
export const ORDERS_CONTRACT = "v15-07E-admin-orders";

// ── Fields ───────────────────────────────────────────────────────────────────

export const IDENTITY_FIELDS = Object.freeze([
  "orderId",
  "supplierOrderId",
  "networkConversionId",
  "network",
  "networkAccount",
  "clientId",
  "clientName",
]);

export const ORDER_FIELDS = Object.freeze([
  "brandName",
  "campaignName",
  "campaignType",
  "orderValue",
  "currency",
  "orderDate",
  "confirmedDate",
  "paymentConfirmedDate",
]);

/** Each status is its own concept. None is derived from another here. */
export const STATUS_FIELDS = Object.freeze([
  "networkRawStatus",
  "orderStatus",
  "validationStatus",
  "supplierPaymentStatus",
  "clientPaymentStatus",
  "paymentStatus",
  "attributionStatus",
  "attributionReviewReason",
  "attributionReviewReasonLabel",
  "reconciliationStatus",
  "clientPayableEligible",
  "exceptionCount",
]);

/** Currency of the commission amounts. May differ from the order's `currency`. Not gated. */
export const COMMISSION_CURRENCY_FIELD = "commissionCurrency";

/** The 07E split. Returned only when the backend includes financial data for the caller. */
export const COMMISSION_FIELDS = Object.freeze([
  "supplierActualCommission",
  "clientCommission",
  "mboCommissionMargin",
  "clientSharePercent",
  "mboSharePercent",
]);

/** MBO bank receipt evidence. Returned only when the backend includes financial data. */
export const RECEIPT_FIELDS = Object.freeze(["mboReceivedAmount", "bankReceivedAt", "mboReceivedDateTime"]);

/** Code only. `couponLink` is not read; `couponType` is source metadata, not proof a link exists. */
export const COUPON_FIELDS = Object.freeze(["couponCode", "couponCodeOrLink", "couponType"]);

export const PROVENANCE_FIELDS = Object.freeze([
  "campaignSourceId",
  "supplierCampaignId",
  "trackingLinkId",
  "attributionEvidence",
  "attributionEvidenceLabel",
  "networkPaymentEvidence",
  "lastSyncedAt",
]);

/** Fields visible only when the row's financial state is INCLUDED. */
export const FINANCIAL_GATED_FIELDS = Object.freeze([...COMMISSION_FIELDS, ...RECEIPT_FIELDS]);

/** Every key read off a row. `financial` is read separately and reduced (see toFinancialView). */
export const ORDER_FIELDS_ALLOWLIST = Object.freeze([
  ...IDENTITY_FIELDS,
  ...ORDER_FIELDS,
  ...STATUS_FIELDS,
  COMMISSION_CURRENCY_FIELD,
  ...COMMISSION_FIELDS,
  ...RECEIPT_FIELDS,
  ...COUPON_FIELDS,
  ...PROVENANCE_FIELDS,
]);

/** Never read, never rendered: raw attribution references and supplier URLs. */
export const BLOCKED_FIELDS = Object.freeze([
  "networkTrackingLink",
  "mboTrackingLink",
  "networkClickId",
  "mboClickId",
  "subId1",
  "subId2",
  "subId3",
  "rawPayloadId",
  "couponLink",
]);

/**
 * Returned by the backend but deliberately not read, with the reason. These are not secrets; they
 * are duplicates, mixed concepts or values that are always empty today.
 */
export const NOT_USED_FIELDS = Object.freeze({
  rawStatus: "Falls back to the conversion's own MBO status when the network status is missing, so it is not purely raw. networkRawStatus is used instead.",
  mboStatus: "Mixes payment words (PAID, PAYABLE) into order status. orderStatus and the payment statuses are used instead.",
  mboOrderStatus: "Unmapped metadata input to orderStatus. orderStatus is used instead.",
  merchantName: "Same value as brandName.",
  mboReceived: "Same receipt as mboReceivedAmount.",
  itemValidationSummary: "Items are not loaded by the list query, so the counts are always zero.",
  items: "Not loaded by the list query.",
  paymentReference: "Always null on this endpoint.",
  dedupeKey: "Internal dedupe identity; not needed on the page.",
  clientAssignmentId: "Internal id; clientName is shown instead.",
  campaignId: "Internal id; campaignName is shown instead.",
  billingMonth: "Derived from orderDate.",
  billingYear: "Derived from orderDate.",
  mboCanonicalObject: "Constant.",
});

// ── URL safety ───────────────────────────────────────────────────────────────

/**
 * True for anything that could resolve as a link: http(s), protocol-relative, www., any
 * scheme:// value, or an MBO /r/ redirect path. Such a value is never surfaced.
 */
export function isUrlShaped(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return false;
  if (isUrlLike(text)) return true;
  if (/[a-z][a-z0-9+.-]*:\/\//i.test(text)) return true;
  if (/(^|\/)r\/[^/\s]+\/[^/\s]+/i.test(text)) return true;
  return false;
}

/** A voucher code, or null. URL-shaped, blank and non-scalar values are never a code. */
export function safeCouponCode(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || isUrlShaped(text)) return null;
  return text;
}

function scalarOrNull(value) {
  if (value == null) return null;
  if (typeof value === "string") return isUrlShaped(value) ? null : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  return null;
}

// ── Financial state (from the backend, never inferred) ───────────────────────

export const FINANCIAL_STATE = Object.freeze({
  INCLUDED: "INCLUDED",
  REDACTED: "REDACTED",
  /** No recognisable shape was returned. Money is treated as unavailable. */
  UNKNOWN: "UNKNOWN",
});

/**
 * Backend 3d0e572 row shapes:
 *   redacted:  financial = { state: "REDACTED", reason: "insufficient_permission" }
 *   included:  financial = { clientPayable, supplierReceivable, mboMargin, ftStatus, source,
 *                            adjustmentCount, reversalCount, note }   (no `state` key)
 * INCLUDED is recognised only by that ledger shape. Anything else is UNKNOWN.
 */
export function financialStateOf(row) {
  const financial = row?.financial;
  if (!financial || typeof financial !== "object" || Array.isArray(financial)) return FINANCIAL_STATE.UNKNOWN;
  if (financial.state === FINANCIAL_STATE.REDACTED) return FINANCIAL_STATE.REDACTED;
  if (financial.state === FINANCIAL_STATE.INCLUDED) return FINANCIAL_STATE.INCLUDED;
  if (financial.state === undefined && typeof financial.ftStatus === "string" && "source" in financial) {
    return FINANCIAL_STATE.INCLUDED;
  }
  return FINANCIAL_STATE.UNKNOWN;
}

export function isFinancialIncluded(row) {
  return financialStateOf(row) === FINANCIAL_STATE.INCLUDED;
}

export function isFinancialRedacted(row) {
  return financialStateOf(row) === FINANCIAL_STATE.REDACTED;
}

export function isFinancialUnknown(row) {
  return financialStateOf(row) === FINANCIAL_STATE.UNKNOWN;
}

/** Where the commission split came from, as the backend reports it. */
export const COMMISSION_SOURCE_LABELS = Object.freeze({
  financial_transaction: "Ledger",
  conversion: "Conversion (rule split, no ledger)",
  none: "None",
});

/**
 * The reduced `financial` view kept on a picked row: the state plus the backend's own evidence of
 * where the amounts came from. Duplicate amounts and the backend note are not kept.
 * `reversalCount` is a count only and is never used in any sum.
 */
function toFinancialView(row) {
  const state = financialStateOf(row);
  const financial = row?.financial;
  if (state === FINANCIAL_STATE.REDACTED) {
    return { state, reason: typeof financial.reason === "string" ? financial.reason : null };
  }
  if (state !== FINANCIAL_STATE.INCLUDED) return { state, reason: null };
  const count = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
  return {
    state,
    reason: null,
    source: typeof financial.source === "string" ? financial.source : null,
    ledgerStatus: typeof financial.ftStatus === "string" ? financial.ftStatus : null,
    adjustmentCount: count(financial.adjustmentCount),
    reversalCount: count(financial.reversalCount),
  };
}

/**
 * Financial state for a whole loaded page. Rows decide when there are any; a mix of states is
 * UNKNOWN, and so is a disagreement with the response's own `includeFinancial` flag. With no rows,
 * only that flag is used.
 */
export function responseFinancialState({ rows = [], includeFinancial } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length) {
    const states = new Set(list.map(financialStateOf));
    if (states.size !== 1) return FINANCIAL_STATE.UNKNOWN;
    const [state] = states;
    if (state === FINANCIAL_STATE.INCLUDED && includeFinancial === false) return FINANCIAL_STATE.UNKNOWN;
    if (state === FINANCIAL_STATE.REDACTED && includeFinancial === true) return FINANCIAL_STATE.UNKNOWN;
    return state;
  }
  if (includeFinancial === true) return FINANCIAL_STATE.INCLUDED;
  if (includeFinancial === false) return FINANCIAL_STATE.REDACTED;
  return FINANCIAL_STATE.UNKNOWN;
}

// ── Row projection ───────────────────────────────────────────────────────────

/**
 * Projects one response row onto the allowlist. Anything else on the row is dropped, objects and
 * URL-shaped strings on allowed keys become null, coupon fields keep a code only, and the
 * financially gated fields are null unless the row's financial state is INCLUDED.
 */
export function pickOrderFields(row) {
  if (!row || typeof row !== "object") return null;
  const view = {};
  for (const key of ORDER_FIELDS_ALLOWLIST) view[key] = scalarOrNull(row[key]);

  view.couponCode = safeCouponCode(row.couponCode);
  view.couponCodeOrLink = safeCouponCode(row.couponCodeOrLink) ?? view.couponCode;

  view.financial = toFinancialView(row);
  if (view.financial.state !== FINANCIAL_STATE.INCLUDED) {
    for (const key of FINANCIAL_GATED_FIELDS) view[key] = null;
  }
  return view;
}

export function pickOrderRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(pickOrderFields).filter(Boolean);
}

/** Orders with no supplier order id are stored under a synthetic `conv:{conversionId}` id. */
export function isSyntheticOrderId(supplierOrderId) {
  return typeof supplierOrderId === "string" && supplierOrderId.startsWith("conv:");
}

// ── Statuses (labels only; values are never rewritten) ───────────────────────

/** Canonical MBO order lifecycle returned in `orderStatus`. */
export const ORDER_STATUSES = Object.freeze(["PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "REVERSED", "UNKNOWN"]);

export const ORDER_STATUS_LABELS = Object.freeze({
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  REVERSED: "Reversed",
  UNKNOWN: "Unknown",
});

export const VALIDATION_STATUS_LABELS = Object.freeze({
  VALIDATION_PENDING: "Validation pending",
  VALIDATION_APPROVED: "Validation approved",
  VALIDATION_REJECTED: "Validation rejected",
  VALIDATION_NEEDS_REVIEW: "Needs review",
});

export const SUPPLIER_PAYMENT_STATUS_LABELS = Object.freeze({
  PAYMENT_PENDING: "Payment pending",
  PAYMENT_AWAITING_INVOICE: "Awaiting invoice",
  PAYMENT_INVOICED: "Invoiced",
  PAYMENT_PAYABLE: "Payable",
  PAYMENT_RECEIVED: "Received",
  PAYMENT_ON_HOLD: "On hold",
});

export const CLIENT_PAYMENT_STATUS_LABELS = Object.freeze({
  CLIENT_PAYMENT_NOT_READY: "Not ready",
  CLIENT_PAYMENT_PAYABLE: "Payable",
  CLIENT_PAYMENT_INVOICED: "Invoiced",
  CLIENT_PAYMENT_PROCESSING: "Processing",
  CLIENT_PAYMENT_PAID: "Paid",
  CLIENT_PAYMENT_ON_HOLD: "On hold",
});

/** `paymentStatus`: the backend's canonical payment lifecycle. Not an order status. */
export const PAYMENT_LIFECYCLE_LABELS = Object.freeze({
  PENDING: "Payment pending",
  APPROVED: "Approved, awaiting invoice",
  ADVERTISER_INVOICED: "Advertiser invoiced",
  PAYABLE: "Payable",
  PAID: "Paid",
  NOT_PAYABLE: "Not payable",
  REJECTED: "Rejected (not payable)",
  UNKNOWN: "Unknown",
});

export const ATTRIBUTION_STATUS_LABELS = Object.freeze({
  PENDING: "Attribution pending",
  ATTRIBUTED: "Attributed",
  ORPHAN: "Orphan",
  REVIEW_REQUIRED: "Review required",
  REATTRIBUTED: "Reattributed",
});

export const STATUS_KIND = Object.freeze({
  ORDER: "ORDER",
  VALIDATION: "VALIDATION",
  SUPPLIER_PAYMENT: "SUPPLIER_PAYMENT",
  CLIENT_PAYMENT: "CLIENT_PAYMENT",
  PAYMENT_LIFECYCLE: "PAYMENT_LIFECYCLE",
  ATTRIBUTION: "ATTRIBUTION",
  RAW: "RAW",
  RECONCILIATION: "RECONCILIATION",
});

const STATUS_LABELS_BY_KIND = Object.freeze({
  [STATUS_KIND.ORDER]: ORDER_STATUS_LABELS,
  [STATUS_KIND.VALIDATION]: VALIDATION_STATUS_LABELS,
  [STATUS_KIND.SUPPLIER_PAYMENT]: SUPPLIER_PAYMENT_STATUS_LABELS,
  [STATUS_KIND.CLIENT_PAYMENT]: CLIENT_PAYMENT_STATUS_LABELS,
  [STATUS_KIND.PAYMENT_LIFECYCLE]: PAYMENT_LIFECYCLE_LABELS,
  [STATUS_KIND.ATTRIBUTION]: ATTRIBUTION_STATUS_LABELS,
});

/** The status field each kind is read from. Kinds are never merged or cross-derived. */
export const STATUS_FIELD_BY_KIND = Object.freeze({
  [STATUS_KIND.ORDER]: "orderStatus",
  [STATUS_KIND.VALIDATION]: "validationStatus",
  [STATUS_KIND.SUPPLIER_PAYMENT]: "supplierPaymentStatus",
  [STATUS_KIND.CLIENT_PAYMENT]: "clientPaymentStatus",
  [STATUS_KIND.PAYMENT_LIFECYCLE]: "paymentStatus",
  [STATUS_KIND.ATTRIBUTION]: "attributionStatus",
  [STATUS_KIND.RAW]: "networkRawStatus",
  [STATUS_KIND.RECONCILIATION]: "reconciliationStatus",
});

/**
 * Display label for a status of the given kind. A value with no known label is returned as-is
 * (raw network and reconciliation statuses always are); null stays null. Nothing is re-mapped.
 */
export function statusLabel(kind, value) {
  if (value == null || value === "") return null;
  const labels = STATUS_LABELS_BY_KIND[kind];
  return labels && Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : String(value);
}

// ── Currency and money summaries ─────────────────────────────────────────────

export const SUMMARY_SCOPE = "LOADED_ROWS";

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

/**
 * Amount groups that may be summarised, each with the field holding its currency. The receipt
 * amount is not in any group: the row carries no currency for it.
 */
export const MONEY_GROUPS = Object.freeze({
  ORDER_VALUE: Object.freeze({ fields: Object.freeze(["orderValue"]), currencyField: "currency", gated: false }),
  COMMISSION: Object.freeze({
    fields: Object.freeze(["supplierActualCommission", "clientCommission", "mboCommissionMargin"]),
    currencyField: COMMISSION_CURRENCY_FIELD,
    gated: true,
  }),
});

export const NOT_SUMMARIZABLE_FIELDS = Object.freeze({
  mboReceivedAmount: "The row carries no currency for the receipt amount.",
  clientSharePercent: "A percentage, not an amount.",
  mboSharePercent: "A percentage, not an amount.",
});

function hasNumber(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

function resolveGroup(group) {
  if (typeof group === "string" && MONEY_GROUPS[group]) return MONEY_GROUPS[group];
  if (group && Array.isArray(group.fields) && typeof group.currencyField === "string") return group;
  return MONEY_GROUPS.ORDER_VALUE;
}

function currencyCode(row, currencyField) {
  const raw = row?.[currencyField];
  const code = raw == null ? "" : String(raw).trim().toUpperCase();
  return code || null;
}

/** Currencies of the rows that carry an amount in `group` (a MONEY_GROUPS key or definition). */
export function currenciesInRows(rows, group = "ORDER_VALUE") {
  const { fields, currencyField } = resolveGroup(group);
  const set = new Set();
  let unknown = false;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!fields.some((f) => hasNumber(row?.[f]))) continue;
    const code = currencyCode(row, currencyField);
    if (code) set.add(code);
    else unknown = true;
  }
  return { currencies: [...set].sort(), hasUnknownCurrency: unknown };
}

export function isSingleCurrency(rows, group = "ORDER_VALUE") {
  const { currencies, hasUnknownCurrency } = currenciesInRows(rows, group);
  return currencies.length === 1 && !hasUnknownCurrency;
}

/**
 * Whether a money summary over the LOADED rows can be shown for `group`. Commission also needs the
 * backend's INCLUDED state; order value does not, because the backend sends it with
 * conversions:read.
 */
export function moneySummaryState(rows, group = "ORDER_VALUE", { financialState } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const resolved = resolveGroup(group);
  const base = { scope: SUMMARY_SCOPE, currency: null, currencies: [] };
  if (resolved.gated) {
    const state = financialState ?? responseFinancialState({ rows: list });
    if (state === FINANCIAL_STATE.REDACTED) return { ...base, state: MONEY_SUMMARY_STATE.REDACTED };
    if (state !== FINANCIAL_STATE.INCLUDED) return { ...base, state: MONEY_SUMMARY_STATE.UNAVAILABLE };
  }
  const { currencies, hasUnknownCurrency } = currenciesInRows(list, resolved);
  if (!currencies.length && !hasUnknownCurrency) return { ...base, currencies, state: MONEY_SUMMARY_STATE.NO_DATA };
  if (hasUnknownCurrency) return { ...base, currencies, state: MONEY_SUMMARY_STATE.UNKNOWN_CURRENCY };
  if (currencies.length > 1) return { ...base, currencies, state: MONEY_SUMMARY_STATE.MIXED_CURRENCIES };
  return { ...base, currencies, currency: currencies[0], state: MONEY_SUMMARY_STATE.AVAILABLE };
}

/**
 * Sums `group` over the LOADED rows only when moneySummaryState is AVAILABLE; otherwise `totals` is
 * null. A field with no value on any row stays null and is never shown as 0. For commission,
 * `sources` lists where the amounts came from (ledger / conversion). Never a filter-wide total,
 * and never built from reversal counts or any other aggregate.
 */
export function summarizeLoadedMoney(rows, group = "ORDER_VALUE", options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const resolved = resolveGroup(group);
  const status = moneySummaryState(list, resolved, options);
  if (status.state !== MONEY_SUMMARY_STATE.AVAILABLE) return { ...status, rowCount: list.length, totals: null, sources: [] };
  const totals = {};
  for (const field of resolved.fields) {
    let sum = null;
    for (const row of list) {
      if (!hasNumber(row?.[field])) continue;
      sum = (sum ?? 0) + Number(row[field]);
    }
    totals[field] = sum == null ? null : Number(sum.toFixed(4));
  }
  const sources = resolved.gated
    ? [...new Set(list.map((row) => row?.financial?.source).filter((s) => typeof s === "string"))].sort()
    : [];
  return { ...status, rowCount: list.length, totals, sources };
}

/**
 * The only count the backend gives: how many order records match the filters. Not a KPI and not
 * a confirmed / paid count.
 */
export function matchingOrderCount(pagination) {
  const total = pagination && typeof pagination === "object" ? pagination.total : null;
  return { scope: "MATCHING_ORDER_RECORDS", count: hasNumber(total) ? Number(total) : null };
}

// ── Filters and paging ───────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function normalizePageSize(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, n);
}

export function normalizePage(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** SupplierKey values. Any other network value fails server-side, so none is sent. */
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

export const NETWORK_COVERAGE = Object.freeze({
  ACTIVE_PARTIAL: "ACTIVE_PARTIAL",
  STAGED_NOT_PROMOTED: "STAGED_NOT_PROMOTED",
  UNSUPPORTED: "UNSUPPORTED",
});

/**
 * Order ingestion coverage read from the backend code (3d0e572), not proven in production data.
 * Every network is still a valid filter value; a network without an active path returns no rows.
 */
export const NETWORK_ORDER_COVERAGE = Object.freeze({
  OPTIMISE: { coverage: NETWORK_COVERAGE.ACTIVE_PARTIAL, note: "Orders written; network status not mapped." },
  TRACKIER: { coverage: NETWORK_COVERAGE.ACTIVE_PARTIAL, note: "Orders written; network status not mapped." },
  IMPACT: { coverage: NETWORK_COVERAGE.ACTIVE_PARTIAL, note: "Orders written; order value from Amount and the promo code are not read." },
  BOOSTINY: { coverage: NETWORK_COVERAGE.ACTIVE_PARTIAL, note: "Only performance rows carrying an order id become orders." },
  AWIN: { coverage: NETWORK_COVERAGE.STAGED_NOT_PROMOTED, note: "Transactions are fetched and staged but skipped at promotion." },
  PARTNERIZE: { coverage: NETWORK_COVERAGE.STAGED_NOT_PROMOTED, note: "Transactions are fetched and staged but skipped at promotion." },
  ADMITAD: { coverage: NETWORK_COVERAGE.STAGED_NOT_PROMOTED, note: "Transactions are fetched and staged but skipped at promotion." },
  RAKUTEN: { coverage: NETWORK_COVERAGE.STAGED_NOT_PROMOTED, note: "Transactions are fetched and staged but skipped at promotion." },
  CJ: { coverage: NETWORK_COVERAGE.UNSUPPORTED, note: "Transactions are not fetched." },
});

export function networkOrderCoverage(network) {
  const key = network == null ? "" : String(network).trim().toUpperCase();
  return NETWORK_ORDER_COVERAGE[key] ?? null;
}

export const VALIDATION_STATUS_OPTIONS = Object.freeze(Object.keys(VALIDATION_STATUS_LABELS));
export const SUPPLIER_PAYMENT_STATUS_OPTIONS = Object.freeze(Object.keys(SUPPLIER_PAYMENT_STATUS_LABELS));

/** Supplier payment states the backend's `paidOnly` filter matches. */
export const PAID_ONLY_SUPPLIER_PAYMENT_STATUSES = Object.freeze(["PAYMENT_PAYABLE", "PAYMENT_RECEIVED", "PAYMENT_INVOICED"]);

/** Filters GET /ops/admin/orders applies server-side, plus paging. */
export const SUPPORTED_FILTERS = Object.freeze([
  { key: "clientId", param: "clientId", help: "Exact client id." },
  { key: "network", param: "network", help: "Exact network (SupplierKey). The backend also reads `networkSource`; this contract sends `network`." },
  { key: "validationStatus", param: "validationStatus", help: "Exact validation status. Ignored by the backend when confirmedOnly is set." },
  { key: "supplierPaymentStatus", param: "supplierPaymentStatus", help: "Exact supplier payment status. Ignored by the backend when paidOnly is set." },
  {
    key: "confirmedOnly",
    param: "confirmedOnly",
    help: "Validation approved only. Order status mapping is incomplete today, so this may return few or no rows.",
  },
  { key: "paidOnly", param: "paidOnly", help: "Supplier payment status Payable, Received or Invoiced. Not a client payment filter." },
  { key: "from", param: "from", help: "Order date on or after (YYYY-MM-DD). Orders with no order date match on their validation change date." },
  { key: "to", param: "to", help: "Order date on or before (YYYY-MM-DD, whole day). Same fallback as from." },
  { key: "q", param: "q", help: "Contains search over supplier order id, brand (merchant) and campaign." },
  { key: "page", param: "page", help: "Page number, from 1." },
  { key: "pageSize", param: "pageSize", help: `Rows per page, default ${DEFAULT_PAGE_SIZE}, max ${MAX_PAGE_SIZE}.` },
]);

/** Not accepted by GET /ops/admin/orders. Never offered. */
export const UNSUPPORTED_FILTERS = Object.freeze([
  { key: "currency", reason: "No currency filter on this endpoint." },
  { key: "country", reason: "No country filter on this endpoint." },
  { key: "coupon", reason: "No coupon filter; q does not search coupon codes." },
  { key: "clickId", reason: "No click id filter." },
  { key: "conversionId", reason: "No conversion id filter; q searches the supplier order id only." },
  { key: "attributionStatus", reason: "No attribution status filter." },
  { key: "reconciliationStatus", reason: "No reconciliation status filter." },
  { key: "orderStatus", reason: "No canonical order status filter; validationStatus / confirmedOnly filter validation." },
  { key: "sort", reason: "Sort is fixed server-side (order date, newest first)." },
]);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(value) {
  const t = value == null ? "" : String(value).trim().slice(0, 10);
  return ISO_DAY.test(t) && !Number.isNaN(new Date(`${t}T00:00:00.000Z`).getTime()) ? t : null;
}

function text(value) {
  const t = value == null ? "" : String(value).trim();
  return t || null;
}

function isOn(value) {
  return value === true || value === "true";
}

/**
 * Query params for GET /ops/admin/orders, paging included. Unsupported keys are dropped, and so
 * are enum values the server would reject. When confirmedOnly / paidOnly is set, the exact status
 * it overrides server-side is not sent, so the request never looks like it applies both.
 */
export function buildOrdersParams(filters = {}) {
  const params = {
    page: normalizePage(filters.page),
    pageSize: normalizePageSize(filters.pageSize),
  };
  const clientId = text(filters.clientId);
  if (clientId) params.clientId = clientId;
  const network = text(filters.network ?? filters.networkSource)?.toUpperCase();
  if (network && NETWORK_FILTER_OPTIONS.includes(network)) params.network = network;

  if (isOn(filters.confirmedOnly ?? filters.confirmed)) {
    params.confirmedOnly = "true";
  } else {
    const validation = text(filters.validationStatus)?.toUpperCase();
    if (validation && VALIDATION_STATUS_OPTIONS.includes(validation)) params.validationStatus = validation;
  }
  if (isOn(filters.paidOnly ?? filters.paid)) {
    params.paidOnly = "true";
  } else {
    const payment = text(filters.supplierPaymentStatus)?.toUpperCase();
    if (payment && SUPPLIER_PAYMENT_STATUS_OPTIONS.includes(payment)) params.supplierPaymentStatus = payment;
  }

  const from = day(filters.from);
  const to = day(filters.to);
  if (from) params.from = from;
  if (to) params.to = to;
  const q = text(filters.q);
  if (q) params.q = q;
  return params;
}

// ── Labels and meanings ──────────────────────────────────────────────────────

/** Column labels for the page. Every key is in ORDER_FIELDS_ALLOWLIST. */
export const FIELD_LABELS = Object.freeze({
  network: "Network",
  networkAccount: "Network Account",
  supplierOrderId: "Order ID",
  networkConversionId: "Network Conversion ID",
  clientName: "Client",
  brandName: "Brand",
  campaignName: "Campaign",
  campaignType: "Campaign Type",
  orderValue: "Order Value",
  currency: "Currency",
  orderDate: "Order Date",
  confirmedDate: "Confirmed Date",
  paymentConfirmedDate: "Payment Confirmed Date",
  networkRawStatus: "Raw Status",
  orderStatus: "MBO Order Status",
  validationStatus: "Validation Status",
  supplierPaymentStatus: "Supplier Payment Status",
  clientPaymentStatus: "Client Payment Status",
  paymentStatus: "Payment Lifecycle",
  attributionStatus: "Attribution Status",
  attributionReviewReasonLabel: "Attribution Review Reason",
  reconciliationStatus: "Reconciliation Status",
  clientPayableEligible: "Client Payable Eligible",
  exceptionCount: "Exceptions",
  commissionCurrency: "Commission Currency",
  supplierActualCommission: "Supplier Actual Commission",
  clientCommission: "Client Commission",
  mboCommissionMargin: "MBO Margin",
  clientSharePercent: "Client Share %",
  mboSharePercent: "MBO Share %",
  mboReceivedAmount: "MBO Received Amount",
  bankReceivedAt: "Bank Received At",
  mboReceivedDateTime: "MBO Received Date / Time",
  couponCode: "Coupon Code",
  couponType: "Coupon Type",
  trackingLinkId: "Tracking Link Record",
  attributionEvidenceLabel: "Attribution Evidence",
  networkPaymentEvidence: "Network Payment Evidence",
  lastSyncedAt: "Last Synced",
});

/** What each field means. Commission, receipt and status fields are kept distinct. */
export const FIELD_DESCRIPTIONS = Object.freeze({
  supplierOrderId: "The network's order id. `conv:…` means the network sent no order id and the conversion id is used.",
  orderValue: "Order value in the order's currency.",
  currency: "The order's own currency. Amounts are never converted.",
  commissionCurrency: "Currency of the commission amounts. May differ from the order currency.",
  networkRawStatus: "The network's own status, as sent. Not mapped.",
  orderStatus: "MBO order lifecycle from the backend. Network statuses are not mapped yet, so many orders are Unknown.",
  validationStatus: "MBO validation state. Needs review is shown as returned; it is never read as confirmed or pending.",
  supplierPaymentStatus: "Payment from the network to MBO. Separate from the order lifecycle.",
  clientPaymentStatus: "Payment from MBO to the client. Separate from supplier payment.",
  paymentStatus: "The backend's combined payment lifecycle (from supplier payment, client payment and validation). Not an order status.",
  attributionStatus: "Whether the order is attributed to a client, as returned.",
  reconciliationStatus: "Reconciliation state as returned. Not populated on this endpoint today.",
  clientPayableEligible: "Backend eligibility flag for client payout.",
  confirmedDate: "When validation last changed, or the conversion's approved date, as the backend resolves it.",
  paymentConfirmedDate: "Only set when the network provides it.",
  supplierActualCommission: "Supplier / network side commission: the ledger sum when ledger rows exist, otherwise the conversion's approved or reported commission. NOT client payable.",
  clientCommission: "Client payable commission: the ledger when present, otherwise the conversion's rule-derived split.",
  mboCommissionMargin: "MBO margin from the ledger, otherwise the conversion's rule-derived split. NOT the supplier receivable.",
  clientSharePercent: "Client share of the supplier commission. May be the client's default share rather than the actual split.",
  mboSharePercent: "MBO share of the supplier commission, as the backend resolves it.",
  mboReceivedAmount: "Bank / reconciliation receipt evidence only. Never derived from payment status. No currency is returned for it.",
  bankReceivedAt: "When the bank receipt was recorded, from reconciliation evidence only.",
  mboReceivedDateTime: "Bank receipt date and time as formatted by the backend.",
  couponCode: "Voucher code only. Coupon links are never shown.",
  couponType: "Source metadata (Code / Link). Link does not mean a usable link is available here.",
  trackingLinkId: "Internal tracking link record id. Not a URL.",
  attributionEvidenceLabel: "What the attribution was based on (e.g. MBO click, unique coupon).",
  networkPaymentEvidence: "Network-reported payment state, as stored. Evidence only.",
  lastSyncedAt: "Last update of the order record.",
});

/** Column presets. Gated columns are dropped by columnsForFinancialState when not INCLUDED. */
export const COMPACT_COLUMNS = Object.freeze([
  "network",
  "supplierOrderId",
  "brandName",
  "orderValue",
  "currency",
  "orderStatus",
  "supplierPaymentStatus",
  "orderDate",
]);

export const STANDARD_COLUMNS = Object.freeze([
  "network",
  "supplierOrderId",
  "clientName",
  "brandName",
  "campaignName",
  "orderValue",
  "currency",
  "networkRawStatus",
  "orderStatus",
  "validationStatus",
  "supplierPaymentStatus",
  "supplierActualCommission",
  "clientCommission",
  "mboCommissionMargin",
  "couponCode",
  "orderDate",
  "lastSyncedAt",
]);

export const FULL_COLUMNS = Object.freeze([
  "network",
  "networkAccount",
  "supplierOrderId",
  "networkConversionId",
  "clientName",
  "brandName",
  "campaignName",
  "campaignType",
  "orderValue",
  "currency",
  "networkRawStatus",
  "orderStatus",
  "validationStatus",
  "supplierPaymentStatus",
  "clientPaymentStatus",
  "paymentStatus",
  "attributionStatus",
  "attributionEvidenceLabel",
  "reconciliationStatus",
  "commissionCurrency",
  "supplierActualCommission",
  "clientCommission",
  "mboCommissionMargin",
  "clientSharePercent",
  "mboSharePercent",
  "mboReceivedAmount",
  "bankReceivedAt",
  "couponCode",
  "couponType",
  "exceptionCount",
  "orderDate",
  "confirmedDate",
  "lastSyncedAt",
]);

export const COLUMN_PRESETS = Object.freeze({
  COMPACT: COMPACT_COLUMNS,
  STANDARD: STANDARD_COLUMNS,
  FULL: FULL_COLUMNS,
});

/** A preset without the financially gated columns unless the backend state is INCLUDED. */
export function columnsForFinancialState(columns, financialState) {
  const list = Array.isArray(columns) ? columns : [];
  const allowed = list.filter((key) => ORDER_FIELDS_ALLOWLIST.includes(key));
  return financialState === FINANCIAL_STATE.INCLUDED ? allowed : allowed.filter((key) => !FINANCIAL_GATED_FIELDS.includes(key));
}

// ── Known backend gaps (stated, never faked) ─────────────────────────────────

export const BACKEND_GAPS = Object.freeze([
  "Order status mapping is incomplete: no network's raw status is mapped, so orders with a network status become Unknown / Needs review.",
  "No producer sets REVERSED.",
  "Supplier payment status is almost always PAYMENT_PENDING; sync does not advance it.",
  "Reconciliation status is not populated on this endpoint.",
  "No order rows today for Awin, Partnerize, Admitad and Rakuten (staged, not promoted) or CJ (not fetched).",
  "No server-side money totals; only the matching record count is returned.",
  "No admin conversions endpoint; the legacy /api/conversions accepts only three networks.",
  "Client-confirmed orders are derived, not permission-gated for money and paginated in memory; unsuitable for this page.",
  "A reversal double-count exists in upstream finance totals (payment status and network finance); nothing here builds on reversal aggregates.",
]);
