import { isUrlLike } from "../couponsVouchers/couponCodeSafety.js";

/**
 * Network Operations → All Network Data: frontend contract.
 *
 *   GET /ops/imported-records?recordType=<type>      campaigns:read, then the type's own permission
 *       controller: importedRecords.controller#listImportedRecordsHandler (backend production f18eb1f)
 *       rows:       one staged SOURCE record (Entity) per row, one record type per response,
 *                   projected server-side to a fixed allowlist (no raw payload, URL, click / order /
 *                   conversion id, raw payload id, mapper error text or money)
 *       envelope:   { ok, data[], pagination{ page, pageSize, total, totalPages, hasMore } }
 *       paging:     page, pageSize (backend default 25, max 100); sort fixed (last updated first)
 *
 * The page is an inventory of what came in from each network and how far each record got through
 * mapping — the SOURCE layer. It is not the canonical Campaigns registry, not Finance, not a raw
 * payload viewer, not a mapping editor, not Exceptions and not Orders / Performance.
 *
 * Rules this file encodes:
 *   - Every request carries an explicit, supported record type. Types never mix.
 *   - Only the keys listed below are read off a row. Raw, URL, id and money fields are never read,
 *     even if a backend version sends them, and any URL-shaped string on an allowed key is dropped.
 *   - No money: there are no amounts here at all. `currency` is campaign metadata only.
 *   - Statuses are passed through as returned, each kind on its own. Labels only; nothing is
 *     re-mapped.
 *   - The only record count is the list's pagination total. /summary is not used (see
 *     SUMMARY_LIMITATIONS).
 *
 * Pure data and pure functions only: no request is made from this file.
 */

export const IMPORTED_RECORDS_PATH = "/ops/imported-records";

/** Endpoint metadata. Only the list endpoint is used by the first release. */
export const IMPORTED_RECORDS_ENDPOINTS = Object.freeze({
  list: { path: IMPORTED_RECORDS_PATH, usedInFirstRelease: true },
  detail: { path: `${IMPORTED_RECORDS_PATH}/:id`, usedInFirstRelease: false, note: "Same safe boundary as the list, plus linked-record counts and pipeline stages." },
  columns: { path: `${IMPORTED_RECORDS_PATH}/columns`, usedInFirstRelease: false, note: "Server column names are never rendered without this contract's allowlist." },
  summary: { path: `${IMPORTED_RECORDS_PATH}/summary`, usedInFirstRelease: false, note: "See SUMMARY_LIMITATIONS." },
  facets: { path: `${IMPORTED_RECORDS_PATH}/facets`, usedInFirstRelease: false, note: "Campaign filter values only; not required." },
});

// ── Record types ─────────────────────────────────────────────────────────────

/** The backend's exact entity-type strings. Any other type is rejected server-side. */
export const RECORD_TYPES = Object.freeze(["campaign", "coupon", "commission_rule", "commission_group"]);
export const DEFAULT_RECORD_TYPE = "campaign";

/** Display metadata. `permissionHint` is documentation only; the backend authorizes. */
export const RECORD_TYPE_META = Object.freeze({
  campaign: {
    key: "campaign",
    label: "Campaigns",
    description: "Staged campaign records from each network, with their promotion and mapping state.",
    permissionHint: "campaigns:read",
  },
  coupon: {
    key: "coupon",
    label: "Coupons / Vouchers",
    description: "Staged coupon / voucher records. The code is shown; coupon links never are.",
    permissionHint: "coupons:read",
  },
  commission_rule: {
    key: "commission_rule",
    label: "Commission Rules",
    description: "Staged supplier commission rule records. No amounts or rates are shown here.",
    permissionHint: "commission:read",
  },
  commission_group: {
    key: "commission_group",
    label: "Commission Groups",
    description: "Staged supplier commission group records. No amounts or rates are shown here.",
    permissionHint: "commission:read",
  },
});

export function normalizeRecordType(type) {
  const t = type == null ? "" : String(type).trim().toLowerCase();
  return RECORD_TYPES.includes(t) ? t : DEFAULT_RECORD_TYPE;
}

// ── Fields ───────────────────────────────────────────────────────────────────

export const IDENTITY_FIELDS = Object.freeze([
  "id",
  "network",
  "networkSource",
  "networkAccount",
  "recordType",
  "entityType",
  "sourceRecordId",
  "supplierCampaignId",
  "supplierCampaignExtId",
  "networkCampaignId",
  "campaignSourceId",
  "canonicalCampaignId",
  "merchantId",
]);

export const DISPLAY_FIELDS = Object.freeze([
  "brand",
  "sourceAdvertiserName",
  "campaign",
  "category",
  "secondaryCategory",
  "country",
  "currency",
  "campaignType",
  "commercialType",
  "channelType",
  "campaignStatus",
  "relationshipStatus",
]);

export const CAPABILITY_FIELDS = Object.freeze([
  "mboReady",
  "isAssignable",
  "linkSupport",
  "couponSupport",
  "deeplinkSupport",
  "feedSupport",
  "linkSupportState",
  "couponSupportState",
  "deeplinkSupportState",
  "feedSupportState",
  "commissionRulesState",
]);

export const COUNT_FIELDS = Object.freeze(["couponCount", "commissionRuleCount"]);

export const QUALITY_FIELDS = Object.freeze([
  "sourceStatus",
  "mappingStatus",
  "certificationStatus",
  "issue",
  "issueCode",
  "hasMapperError",
  "importedAt",
  "lastUpdated",
  "lastSyncedAt",
]);

/** Returned on coupon rows only (the coupon type already requires coupons:read). */
export const COUPON_ONLY_FIELDS = Object.freeze(["couponCode", "couponStatus"]);

/** Every key read off a row (backend f18eb1f list allowlist). */
export const IMPORTED_RECORD_FIELDS = Object.freeze([
  ...IDENTITY_FIELDS,
  ...DISPLAY_FIELDS,
  ...CAPABILITY_FIELDS,
  ...COUNT_FIELDS,
  ...QUALITY_FIELDS,
]);

/** Never read, never rendered — raw data, URLs, transaction ids, error text and money. */
export const BLOCKED_FIELDS = Object.freeze([
  "sourceFields",
  "sourceData",
  "rawPayload",
  "rawPayloadId",
  "rawPayloadReference",
  "detected",
  "normalized",
  "tracking",
  "commercial",
  "supplierTrackingLink",
  "networkTrackingLink",
  "trackingUrl",
  "landingPageUrl",
  "deeplinkUrl",
  "couponLink",
  "mboTrackingLink",
  "brandLogoLink",
  "brandWebsiteLink",
  "redirectChain",
  "networkClickId",
  "mboClickId",
  "subId1",
  "subId2",
  "subId3",
  "networkOrderId",
  "networkConversionId",
  "supplierConversionId",
  "openMapperErrorId",
  "mapperError",
  "paymentReference",
  "commission",
  "commissions",
  "commissionAmount",
  "commissionType",
  "commissionDisplay",
  "commissionCurrency",
  "grossCommission",
  "grossOrderValue",
  "orderValue",
  "revenue",
  "payout",
  "clientCommission",
  "mboMargin",
]);

const COUNT_SET = new Set(COUNT_FIELDS);
const BOOLEAN_SET = new Set(["mboReady", "isAssignable", "linkSupport", "couponSupport", "deeplinkSupport", "feedSupport", "hasMapperError"]);
const ARRAY_SET = new Set(["country"]);

// ── URL safety ───────────────────────────────────────────────────────────────

/**
 * True for anything that could resolve as a link: http(s), protocol-relative, www., any
 * scheme:// value, or an MBO /r/<slug>/<token> redirect path. Same rule as the backend boundary.
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

function safeValue(key, value) {
  if (value == null) return null;
  if (BOOLEAN_SET.has(key)) return typeof value === "boolean" ? value : null;
  if (COUNT_SET.has(key)) return typeof value === "number" && Number.isFinite(value) ? value : null;
  if (ARRAY_SET.has(key)) {
    const list = Array.isArray(value) ? value : [value];
    const safe = list.filter((v) => typeof v === "string" && v.trim() && !isUrlShaped(v));
    return safe.length ? safe : null;
  }
  if (typeof value === "string") return isUrlShaped(value) ? null : value;
  return null;
}

/**
 * Projects one list row onto the allowlist. Anything else is dropped; non-matching types, objects,
 * money and URL-shaped strings become null. Sparse rows stay sparse — nothing is filled in.
 */
export function pickImportedRecordFields(row) {
  if (!row || typeof row !== "object") return null;
  const view = {};
  for (const key of IMPORTED_RECORD_FIELDS) view[key] = safeValue(key, row[key]);
  if (view.entityType === "coupon") {
    for (const key of COUPON_ONLY_FIELDS) view[key] = safeValue(key, row[key]);
  }
  return view;
}

/**
 * Projects a page of rows. When `recordType` is given, rows of any other type are dropped, so a
 * table never mixes types even if a response did.
 */
export function pickImportedRecordRows(rows, recordType) {
  const type = recordType ? normalizeRecordType(recordType) : null;
  return (Array.isArray(rows) ? rows : [])
    .map(pickImportedRecordFields)
    .filter((row) => row && (!type || row.entityType === type));
}

// ── Statuses (labels only; values are never rewritten) ───────────────────────

export const STATUS_KIND = Object.freeze({
  SOURCE: "SOURCE",
  MAPPING: "MAPPING",
  CERTIFICATION: "CERTIFICATION",
  CAMPAIGN: "CAMPAIGN",
  RELATIONSHIP: "RELATIONSHIP",
  COUPON: "COUPON",
  CAPABILITY: "CAPABILITY",
  CHANNEL: "CHANNEL",
});

/** The field each status kind is read from. Kinds are never merged. */
export const STATUS_FIELD_BY_KIND = Object.freeze({
  [STATUS_KIND.SOURCE]: "sourceStatus",
  [STATUS_KIND.MAPPING]: "mappingStatus",
  [STATUS_KIND.CERTIFICATION]: "certificationStatus",
  [STATUS_KIND.CAMPAIGN]: "campaignStatus",
  [STATUS_KIND.RELATIONSHIP]: "relationshipStatus",
  [STATUS_KIND.COUPON]: "couponStatus",
  [STATUS_KIND.CHANNEL]: "channelType",
});

export const SOURCE_STATUS_LABELS = Object.freeze({
  IMPORTED: "Imported",
  PROCESSED: "Processed",
  FAILED: "Failed",
  SKIPPED: "Skipped",
});

/** Mapping state — the core concept of this page. */
export const MAPPING_STATUS_LABELS = Object.freeze({
  MAPPED: "Mapped",
  NEEDS_REVIEW: "Needs review",
  ERROR: "Error",
  NOT_AVAILABLE: "Not available",
});

export const MAPPING_STATUS_DESCRIPTIONS = Object.freeze({
  MAPPED: "Promoted into the MBO model (supplier campaign with an active campaign source, or a supplier coupon).",
  NEEDS_REVIEW: "Imported but not yet fully promoted or linked.",
  ERROR: "An open mapper error blocks this record. Details belong to Exceptions.",
  NOT_AVAILABLE: "This record type is not promoted by campaign normalization.",
});

export const CERTIFICATION_STATUS_LABELS = Object.freeze({
  PENDING: "Certification pending",
  CERTIFIED: "Certified",
  REVOKED: "Certification revoked",
});

export const CAMPAIGN_STATUS_LABELS = Object.freeze({
  ACTIVE: "Active",
  PAUSED: "Paused",
  EXPIRED: "Expired",
  INACTIVE: "Inactive",
  NOTAPPLIED: "Not applied",
  UNKNOWN: "Unknown",
});

export const RELATIONSHIP_STATUS_LABELS = Object.freeze({
  JOINED: "Joined",
  APPROVED: "Approved",
  NOT_APPLIED: "Not applied",
  PENDING: "Pending",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
  UNKNOWN: "Unknown",
});

export const COUPON_STATUS_LABELS = Object.freeze({
  ACTIVE: "Active",
  EXPIRED: "Expired",
  SCHEDULED: "Scheduled",
  DISABLED: "Disabled",
  UNKNOWN: "Unknown",
});

/** Capability states (link / coupon / deeplink / feed support, commission rules). */
export const CAPABILITY_STATE_LABELS = Object.freeze({
  SUPPORTED: "Supported",
  SUPPORTED_DATA_NOT_SYNCED: "Supported, data not synced",
  NOT_SUPPORTED: "Not supported",
  UNKNOWN: "Unknown",
});

export const CHANNEL_TYPE_LABELS = Object.freeze({
  AFFILIATE_LINK_ONLY: "Link",
  COUPON_CODE_ONLY: "Coupon",
  COUPON_AND_LINK: "Link + Coupon",
  DEEPLINK: "Deeplink",
  UNKNOWN: "Unknown",
});

const LABELS_BY_KIND = Object.freeze({
  [STATUS_KIND.SOURCE]: SOURCE_STATUS_LABELS,
  [STATUS_KIND.MAPPING]: MAPPING_STATUS_LABELS,
  [STATUS_KIND.CERTIFICATION]: CERTIFICATION_STATUS_LABELS,
  [STATUS_KIND.CAMPAIGN]: CAMPAIGN_STATUS_LABELS,
  [STATUS_KIND.RELATIONSHIP]: RELATIONSHIP_STATUS_LABELS,
  [STATUS_KIND.COUPON]: COUPON_STATUS_LABELS,
  [STATUS_KIND.CAPABILITY]: CAPABILITY_STATE_LABELS,
  [STATUS_KIND.CHANNEL]: CHANNEL_TYPE_LABELS,
});

function humanize(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Display label for a status of the given kind. A value with no known label is shown as a
 * readable form of the stored value; null stays null. The stored value itself is never changed.
 */
export function statusLabel(kind, value) {
  if (value == null || value === "") return null;
  const labels = LABELS_BY_KIND[kind];
  if (labels && Object.prototype.hasOwnProperty.call(labels, value)) return labels[value];
  return humanize(value);
}

/** Issue codes the backend derives (mapper errors add their own codes). Labels only. */
export const ISSUE_CODE_LABELS = Object.freeze({
  CAMPAIGN_NOT_PROMOTED: "Campaign not yet promoted",
  CAMPAIGN_SOURCE_MISSING: "Campaign source missing",
  MISSING_MERCHANT_IDENTIFIER: "Missing merchant identifier",
  COUPON_NOT_PROMOTED: "Coupon not yet promoted",
  RECORD_TYPE_NOT_PROMOTED: "Record type not promoted",
  PROMOTION_FAILED: "Campaign promotion failed",
  PARENT_CAMPAIGN_NOT_FOUND: "Parent campaign missing",
  MAPPER_ERROR: "Mapper error",
});

export function issueLabel(issueCode) {
  if (issueCode == null || issueCode === "") return null;
  return Object.prototype.hasOwnProperty.call(ISSUE_CODE_LABELS, issueCode) ? ISSUE_CODE_LABELS[issueCode] : humanize(issueCode);
}

// ── Networks ─────────────────────────────────────────────────────────────────

/**
 * Filter values the backend matches (stored networkSource, lowercase; `optimise` matches by
 * prefix, everything else exactly). Rows show `network` as the backend's display name.
 */
export const NETWORK_FILTER_OPTIONS = Object.freeze([
  { value: "optimise", label: "Optimise" },
  { value: "trackier", label: "Trackier", note: "Rows stored as vCommission are not matched by this filter (backend gap)." },
  { value: "boostiny", label: "Boostiny" },
  { value: "partnerize", label: "Partnerize" },
  { value: "impact", label: "Impact" },
  { value: "admitad", label: "Admitad" },
  { value: "awin", label: "Awin" },
  { value: "cj", label: "CJ" },
  { value: "rakuten", label: "Rakuten" },
]);

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

const ALL_TYPES = RECORD_TYPES;
const CAMPAIGN_AND_COUPON = Object.freeze(["campaign", "coupon"]);
const CAMPAIGN_ONLY = Object.freeze(["campaign"]);

/**
 * Mapping-status / source-status / preset values and the record types each actually works for.
 * The backend's status predicates only recognise campaign and coupon rows, so for commission
 * rows every value except the mapper-error ones matches nothing.
 */
export const MAPPING_STATUS_FILTER_OPTIONS = Object.freeze([
  { value: "MAPPED", label: MAPPING_STATUS_LABELS.MAPPED, types: CAMPAIGN_AND_COUPON },
  { value: "NEEDS_REVIEW", label: MAPPING_STATUS_LABELS.NEEDS_REVIEW, types: CAMPAIGN_AND_COUPON },
  { value: "ERROR", label: MAPPING_STATUS_LABELS.ERROR, types: ALL_TYPES },
]);

export const SOURCE_STATUS_FILTER_OPTIONS = Object.freeze([
  { value: "IMPORTED", label: SOURCE_STATUS_LABELS.IMPORTED, types: CAMPAIGN_AND_COUPON },
  { value: "PROCESSED", label: SOURCE_STATUS_LABELS.PROCESSED, types: CAMPAIGN_AND_COUPON },
  { value: "FAILED", label: SOURCE_STATUS_LABELS.FAILED, types: ALL_TYPES },
]);

export const PRESET_OPTIONS = Object.freeze([
  { value: "recently_imported", label: "Imported in the last 7 days", types: ALL_TYPES, mappingPreset: false },
  { value: "mapping_errors", label: "Mapping errors", types: ALL_TYPES, mappingPreset: true },
  { value: "normalized", label: "Normalized", types: CAMPAIGN_AND_COUPON, mappingPreset: true },
  { value: "needs_review", label: "Needs review", types: CAMPAIGN_AND_COUPON, mappingPreset: true },
  { value: "imported_not_normalized", label: "Imported, not normalized", types: CAMPAIGN_AND_COUPON, mappingPreset: true },
]);

/** The only issue codes the backend's `issue` filter applies (campaign records). */
export const ISSUE_FILTER_OPTIONS = Object.freeze([
  { value: "CAMPAIGN_NOT_PROMOTED", label: ISSUE_CODE_LABELS.CAMPAIGN_NOT_PROMOTED, types: CAMPAIGN_ONLY },
  { value: "CAMPAIGN_SOURCE_MISSING", label: ISSUE_CODE_LABELS.CAMPAIGN_SOURCE_MISSING, types: CAMPAIGN_ONLY },
  { value: "MISSING_MERCHANT_IDENTIFIER", label: ISSUE_CODE_LABELS.MISSING_MERCHANT_IDENTIFIER, types: CAMPAIGN_ONLY },
]);

/** Campaign status / relationship values the backend's campaign filters accept. */
export const CAMPAIGN_STATUS_FILTER_OPTIONS = Object.freeze(["ACTIVE", "PAUSED", "EXPIRED", "INACTIVE"].map((value) => ({ value, label: CAMPAIGN_STATUS_LABELS[value] })));
export const RELATIONSHIP_STATUS_FILTER_OPTIONS = Object.freeze(
  ["JOINED", "APPROVED", "PENDING", "NOT_APPLIED", "REJECTED", "SUSPENDED"].map((value) => ({ value, label: RELATIONSHIP_STATUS_LABELS[value] })),
);

/**
 * Filters GET /ops/imported-records applies, with the record types each one works for. `param` is
 * the exact query parameter this contract sends.
 */
export const SUPPORTED_FILTERS = Object.freeze([
  { key: "recordType", param: "recordType", types: ALL_TYPES, help: "Required. One record type per request." },
  { key: "network", param: "network", types: ALL_TYPES, help: "Network (stored source key)." },
  { key: "q", param: "q", types: ALL_TYPES, help: "Search over safe operational fields (record ids, names, brand, campaign, supplier campaign ids, merchant, category, account, campaign source id; coupon code on coupons). A URL-shaped search returns no rows." },
  { key: "brand", param: "brand", types: ALL_TYPES, help: "Brand / advertiser name contains." },
  { key: "campaign", param: "campaign", types: ALL_TYPES, help: "Campaign name contains." },
  { key: "mappingStatus", param: "mappingStatus", types: ALL_TYPES, help: "See MAPPING_STATUS_FILTER_OPTIONS for the values that work per type." },
  { key: "sourceStatus", param: "sourceStatus", types: ALL_TYPES, help: "See SOURCE_STATUS_FILTER_OPTIONS for the values that work per type." },
  { key: "preset", param: "preset", types: ALL_TYPES, help: "See PRESET_OPTIONS. Mapping presets are dropped when a mapping status is chosen." },
  { key: "issue", param: "issue", types: CAMPAIGN_ONLY, help: "Campaign issue code." },
  { key: "from", param: "fromDate", types: ALL_TYPES, help: "Imported on or after (YYYY-MM-DD). Import time, not the network's event date." },
  { key: "to", param: "toDate", types: ALL_TYPES, help: "Imported on or before (YYYY-MM-DD, whole day)." },
  { key: "country", param: "country", types: CAMPAIGN_ONLY, help: "Two-letter country code." },
  { key: "campaignStatus", param: "campaignStatus", types: CAMPAIGN_ONLY, help: "Campaign status." },
  { key: "relationshipStatus", param: "relationshipStatus", types: CAMPAIGN_ONLY, help: "Relationship status." },
  { key: "campaignType", param: "campaignType", types: CAMPAIGN_ONLY, help: "Campaign / pricing type (e.g. CPS, CPA)." },
  { key: "category", param: "category", types: CAMPAIGN_ONLY, help: "Category contains." },
  { key: "currency", param: "currency", types: CAMPAIGN_ONLY, help: "Three-letter currency code (metadata filter, not money)." },
  { key: "page", param: "page", types: ALL_TYPES, help: "Page number, from 1." },
  { key: "pageSize", param: "pageSize", types: ALL_TYPES, help: `Rows per page, default ${DEFAULT_PAGE_SIZE}, max ${MAX_PAGE_SIZE}.` },
]);

/** Accepted by the backend (or asked for) but deliberately not offered. */
export const UNSUPPORTED_FILTERS = Object.freeze([
  { key: "mboReady", reason: "Totals are wrong and results stop at 500 rows (filtered in memory)." },
  { key: "isAssignable", reason: "Totals are wrong and results stop at 500 rows (filtered in memory)." },
  { key: "groupBy", reason: "Brand grouping is unbounded." },
  { key: "account", reason: "No network-account filter on this endpoint." },
  { key: "sort", reason: "Sort is fixed server-side (last updated first)." },
  { key: "sourceStatus=SKIPPED", reason: "Accepted but ignored by the backend." },
  { key: "mappingStatus=NOT_AVAILABLE", reason: "Only matches performance records, which this page does not serve." },
  { key: "dataQualityScore", reason: "No such value exists." },
  { key: "rawPayloadId / clickId / orderId / conversionId", reason: "Hidden identifiers are not filterable." },
  { key: "commission / money", reason: "This page has no money." },
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

function optionFor(options, value, type) {
  const v = text(value)?.toUpperCase();
  const hit = v ? options.find((o) => String(o.value).toUpperCase() === v) : null;
  return hit && (!hit.types || hit.types.includes(type)) ? hit.value : null;
}

/**
 * Query params for GET /ops/imported-records. The record type is always present (defaults to
 * campaign). Filters that do not apply to the chosen type, values the backend ignores or would
 * reject, and every unsupported filter are dropped. Dates are validated (an invalid date is a
 * backend 500) and `to` covers the whole day.
 */
export function buildImportedRecordsParams(filters = {}) {
  const recordType = normalizeRecordType(filters.recordType);
  const applies = (key) => SUPPORTED_FILTERS.find((f) => f.key === key)?.types.includes(recordType);
  const params = {
    recordType,
    page: normalizePage(filters.page),
    pageSize: normalizePageSize(filters.pageSize),
  };

  const network = text(filters.network)?.toLowerCase();
  if (network && NETWORK_FILTER_OPTIONS.some((o) => o.value === network)) params.network = network;
  for (const key of ["q", "brand", "campaign"]) {
    const v = text(filters[key]);
    if (v) params[key] = v;
  }

  const mappingStatus = optionFor(MAPPING_STATUS_FILTER_OPTIONS, filters.mappingStatus, recordType);
  if (mappingStatus) params.mappingStatus = mappingStatus;
  const sourceStatus = optionFor(SOURCE_STATUS_FILTER_OPTIONS, filters.sourceStatus, recordType);
  if (sourceStatus) params.sourceStatus = sourceStatus;
  const presetValue = text(filters.preset)?.toLowerCase();
  const preset = presetValue ? PRESET_OPTIONS.find((o) => o.value === presetValue && o.types.includes(recordType)) : null;
  // The backend resolves mapping status and mapping presets in one if / else chain, so both at
  // once would silently apply only one of them.
  if (preset && !(preset.mappingPreset && mappingStatus)) params.preset = preset.value;

  if (applies("issue")) {
    const issue = optionFor(ISSUE_FILTER_OPTIONS, filters.issue, recordType);
    if (issue) params.issue = issue;
  }

  const from = day(filters.from ?? filters.fromDate);
  const to = day(filters.to ?? filters.toDate);
  if (from) params.fromDate = from;
  if (to) params.toDate = `${to}T23:59:59.999Z`;

  if (recordType === "campaign") {
    const country = text(filters.country);
    if (country && /^[A-Za-z]{2}$/.test(country)) params.country = country.toUpperCase();
    const campaignStatus = optionFor(CAMPAIGN_STATUS_FILTER_OPTIONS, filters.campaignStatus, recordType);
    if (campaignStatus) params.campaignStatus = campaignStatus;
    const relationshipStatus = optionFor(RELATIONSHIP_STATUS_FILTER_OPTIONS, filters.relationshipStatus, recordType);
    if (relationshipStatus) params.relationshipStatus = relationshipStatus;
    const campaignType = text(filters.campaignType);
    if (campaignType) params.campaignType = campaignType;
    const category = text(filters.category);
    if (category) params.category = category;
    const currency = text(filters.currency);
    if (currency && /^[A-Za-z]{3}$/.test(currency)) params.currency = currency.toUpperCase();
  }
  return params;
}

/** Filters that apply to a record type (for building the filter bar). */
export function filtersForType(recordType) {
  const type = normalizeRecordType(recordType);
  return SUPPORTED_FILTERS.filter((f) => f.types.includes(type));
}

// ── Counts ───────────────────────────────────────────────────────────────────

function hasNumber(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

/**
 * The only record count on the page: the list's pagination total for the selected type and
 * filters. Nothing from /summary.
 */
export function matchingRecordCount(envelope, recordType) {
  const total = envelope?.pagination?.total;
  return {
    scope: "MATCHING_RECORDS",
    recordType: recordType ? normalizeRecordType(recordType) : null,
    count: hasNumber(total) ? Number(total) : null,
  };
}

export function paginationState(envelope, { page, pageSize } = {}) {
  const p = envelope?.pagination || {};
  const size = hasNumber(p.pageSize) ? Number(p.pageSize) : normalizePageSize(pageSize);
  const total = hasNumber(p.total) ? Number(p.total) : null;
  const currentPage = hasNumber(p.page) ? Number(p.page) : normalizePage(page);
  const totalPages = hasNumber(p.totalPages) ? Number(p.totalPages) : total != null ? Math.max(1, Math.ceil(total / size)) : null;
  return {
    page: currentPage,
    pageSize: size,
    total,
    totalPages,
    hasMore: Boolean(p.hasMore) || (totalPages != null && currentPage < totalPages),
    rowOffset: (currentPage - 1) * size,
  };
}

/** Why /summary is not used in the first release. */
export const SUMMARY_LIMITATIONS = Object.freeze([
  "summary.mappingErrors counts open mapper errors across every record type, not the selected one.",
  "summary.byNetwork is always computed over campaigns, whatever type is selected.",
  "The list's pagination total is the only count shown (Matching Records).",
]);

// ── Labels and meanings ──────────────────────────────────────────────────────

export const FIELD_LABELS = Object.freeze({
  network: "Network",
  networkSource: "Network Source Key",
  networkAccount: "Network Account",
  recordType: "Record Type",
  sourceRecordId: "Source Record ID",
  supplierCampaignId: "Supplier Campaign ID",
  supplierCampaignExtId: "Supplier Campaign External ID",
  networkCampaignId: "Network Campaign ID",
  campaignSourceId: "Campaign Source ID",
  canonicalCampaignId: "Canonical Campaign ID",
  merchantId: "Merchant ID",
  brand: "Brand",
  sourceAdvertiserName: "Source Advertiser",
  campaign: "Campaign",
  category: "Primary Category",
  secondaryCategory: "Secondary Category",
  country: "Country",
  currency: "Currency",
  campaignType: "Campaign Type",
  commercialType: "Commercial Type",
  channelType: "Channel Type",
  campaignStatus: "Campaign Status",
  relationshipStatus: "Relationship Status",
  mboReady: "MBO Ready",
  isAssignable: "Assignable",
  linkSupport: "Link Support",
  couponSupport: "Coupon Support",
  deeplinkSupport: "Deeplink Support",
  feedSupport: "Feed Support",
  linkSupportState: "Link Support State",
  couponSupportState: "Coupon Support State",
  deeplinkSupportState: "Deeplink Support State",
  feedSupportState: "Feed Support State",
  commissionRulesState: "Commission Rules State",
  couponCount: "Coupon Count",
  commissionRuleCount: "Commission Rule Count",
  sourceStatus: "Source Status",
  mappingStatus: "Mapping Status",
  certificationStatus: "Certification Status",
  issue: "Issue",
  issueCode: "Issue Code",
  hasMapperError: "Mapper Error",
  importedAt: "Imported At",
  lastUpdated: "Last Updated",
  lastSyncedAt: "Last Synced",
  couponCode: "Coupon Code",
  couponStatus: "Coupon Status",
});

export function fieldLabel(key) {
  return Object.prototype.hasOwnProperty.call(FIELD_LABELS, key) ? FIELD_LABELS[key] : null;
}

export const FIELD_DESCRIPTIONS = Object.freeze({
  network: "The backend's display name for the network.",
  sourceRecordId: "The network's own id for this staged record (may carry an account prefix).",
  currency: "Campaign currency metadata. This page shows no amounts.",
  mappingStatus: "How far the record got into the MBO model. See MAPPING_STATUS_DESCRIPTIONS.",
  sourceStatus: "Import state of the staged record.",
  hasMapperError: "An open mapper error exists. The error itself is in Exceptions.",
  couponCode: "Voucher code only. Coupon links are never shown.",
  issue: "Backend label for the blocking issue, derived from the issue code.",
});

// ── Column presets ───────────────────────────────────────────────────────────

export const COLUMN_PRESET_KEYS = Object.freeze(["COMPACT", "STANDARD", "FULL"]);

const CAMPAIGN_FULL = [
  "network",
  "networkAccount",
  "sourceRecordId",
  "supplierCampaignExtId",
  "campaignSourceId",
  "canonicalCampaignId",
  "brand",
  "sourceAdvertiserName",
  "campaign",
  "category",
  "secondaryCategory",
  "country",
  "currency",
  "campaignType",
  "commercialType",
  "channelType",
  "campaignStatus",
  "relationshipStatus",
  "mboReady",
  "isAssignable",
  "linkSupportState",
  "couponSupportState",
  "deeplinkSupportState",
  "feedSupportState",
  "commissionRulesState",
  "couponCount",
  "commissionRuleCount",
  "mappingStatus",
  "sourceStatus",
  "certificationStatus",
  "issue",
  "hasMapperError",
  "importedAt",
  "lastUpdated",
  "lastSyncedAt",
];

/**
 * Commission rows are staged records the backend does not promote through this view; brand and
 * campaign are often only the source advertiser / entity name, and the issue text is the
 * campaign rule's (see BACKEND_GAPS), so issue is left out. No money in any preset.
 */
const COMMISSION_COMPACT = ["network", "sourceRecordId", "campaign", "mappingStatus", "sourceStatus"];
const COMMISSION_STANDARD = ["network", "networkAccount", "sourceRecordId", "brand", "campaign", "mappingStatus", "sourceStatus", "hasMapperError", "importedAt", "lastUpdated"];
const COMMISSION_FULL = [
  "network",
  "networkAccount",
  "sourceRecordId",
  "supplierCampaignExtId",
  "campaignSourceId",
  "canonicalCampaignId",
  "brand",
  "sourceAdvertiserName",
  "campaign",
  "mappingStatus",
  "sourceStatus",
  "certificationStatus",
  "hasMapperError",
  "importedAt",
  "lastUpdated",
  "lastSyncedAt",
];

export const COLUMN_PRESETS = Object.freeze({
  campaign: Object.freeze({
    COMPACT: Object.freeze(["network", "brand", "campaign", "mappingStatus", "sourceStatus", "lastSyncedAt"]),
    STANDARD: Object.freeze([
      "network",
      "sourceRecordId",
      "brand",
      "campaign",
      "campaignType",
      "campaignStatus",
      "relationshipStatus",
      "country",
      "currency",
      "mappingStatus",
      "sourceStatus",
      "mboReady",
      "isAssignable",
      "lastSyncedAt",
    ]),
    FULL: Object.freeze(CAMPAIGN_FULL),
  }),
  coupon: Object.freeze({
    COMPACT: Object.freeze(["network", "campaign", "couponCode", "mappingStatus", "sourceStatus"]),
    STANDARD: Object.freeze(["network", "sourceRecordId", "brand", "campaign", "couponCode", "couponStatus", "mappingStatus", "sourceStatus", "lastSyncedAt"]),
    FULL: Object.freeze([
      "network",
      "networkAccount",
      "sourceRecordId",
      "supplierCampaignExtId",
      "campaignSourceId",
      "canonicalCampaignId",
      "brand",
      "sourceAdvertiserName",
      "campaign",
      "couponCode",
      "couponStatus",
      "country",
      "currency",
      "mappingStatus",
      "sourceStatus",
      "issue",
      "hasMapperError",
      "importedAt",
      "lastUpdated",
      "lastSyncedAt",
    ]),
  }),
  commission_rule: Object.freeze({ COMPACT: Object.freeze(COMMISSION_COMPACT), STANDARD: Object.freeze(COMMISSION_STANDARD), FULL: Object.freeze(COMMISSION_FULL) }),
  commission_group: Object.freeze({ COMPACT: Object.freeze(COMMISSION_COMPACT), STANDARD: Object.freeze(COMMISSION_STANDARD), FULL: Object.freeze(COMMISSION_FULL) }),
});

/** The preset for a type, restricted to fields this contract reads for that type. */
export function columnsForType(recordType, preset = "STANDARD") {
  const type = normalizeRecordType(recordType);
  const key = COLUMN_PRESET_KEYS.includes(String(preset).toUpperCase()) ? String(preset).toUpperCase() : "STANDARD";
  const allowed = new Set([...IMPORTED_RECORD_FIELDS, ...(type === "coupon" ? COUPON_ONLY_FIELDS : [])]);
  return COLUMN_PRESETS[type][key].filter((field) => allowed.has(field) && fieldLabel(field));
}

// ── Pipeline and page placement ──────────────────────────────────────────────

export const PIPELINE_STAGES = Object.freeze([
  { key: "RAW", label: "Raw", description: "Network API responses stored as received.", thisPage: false },
  { key: "SOURCE", label: "Source", description: "Staged records extracted from raw payloads, one per network object.", thisPage: true },
  { key: "MAPPING", label: "Mapping", description: "Promotion and mapping state of each staged record.", thisPage: true },
  { key: "CANONICAL", label: "MBO Canonical", description: "Supplier campaigns, coupons, commission rules and campaign sources in the MBO model.", thisPage: false },
  { key: "CLIENT_SAFE", label: "Client-safe", description: "What client-facing views may show.", thisPage: false },
]);

export const PAGE_PLACEMENT = Object.freeze({
  layer: "SOURCE + MAPPING",
  summary: "All Network Data is the SOURCE-layer inventory with each record's mapping state.",
  notThisPage: ["Canonical Campaigns registry", "Finance", "Raw payload viewer", "Mapping rules editor", "Exceptions", "Orders / Performance registries"],
});

/** What belongs on Data Integrity pages instead (routes verified in src/config). */
export const DATA_INTEGRITY_SEPARATION = Object.freeze([
  { topic: "Raw payload", page: "Raw Payloads", path: "/integrity/raw-payloads" },
  { topic: "Mapper error detail", page: "Exceptions", path: "/integrity/exceptions" },
  { topic: "Source paths / schema", page: "Source Schema", path: "/integrity/source-schema" },
  { topic: "Mapping rules", page: "Mapping Rules", path: "/integrity/mapping-rules" },
  { topic: "Credentials", page: "API Credentials", path: "/integrity/api-credentials" },
]);

// ── Known backend gaps (stated, never faked) ─────────────────────────────────

export const BACKEND_GAPS = Object.freeze([
  "Network filter: rows stored as vCommission are not matched by the Trackier filter value.",
  "An invalid date in fromDate / toDate produces a server error (dates are validated here).",
  "sourceStatus=SKIPPED is accepted but ignored.",
  "mboReady / isAssignable filters are applied in memory: totals are wrong and results stop at 500 rows.",
  "Brand grouping (groupBy=brand) is unbounded.",
  "summary.mappingErrors is platform-wide, not per record type.",
  "summary.byNetwork is always computed over campaigns.",
  "No network-account filter.",
  "Commission rule / group rows are sparse: brand and campaign are often only the source advertiser or entity name.",
  "Commission rule / group rows get campaign-derived statuses (Imported / Needs review / Campaign not yet promoted) unless a mapper error is open, and the mapping / source status filters only work for campaigns and coupons.",
  "No Source Field Catalog endpoint yet.",
]);
