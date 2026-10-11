import { pickFields } from "../networkAccountContract";

/**
 * Network Campaigns — frontend view of the backend admin contracts.
 *
 *   GET /ops/admin/campaigns          catalog:read   toAdminCampaignListDto  (contract v15-03G-admin-campaign-tab)
 *   GET /ops/admin/campaigns/:id      catalog:read   toAdminCampaignDetailDto (list DTO + sources, assignments, feeds)
 *   GET /ops/admin/supplier-commission-rules  commission:read  toListingDto (SupplierCommissionRule, Commission N)
 *   GET /supplier-coupons             coupons:read   toSupplierCouponDto (SupplierCoupon)
 *   GET /ops/admin/tracking-links     tracking:read  toAdminTrackingLinkDto (supplier links, MBO links separate)
 *   GET /ops/raw-payloads             ops:read       toRawPayloadListDto (references only, no body)
 *
 * The backend normalizes every network's values to the MBO standard at one boundary
 * (ops/v15FieldContract) before they reach this contract, so React never normalizes: canonical
 * fields are displayed as returned, and the vocabularies below only drive filters and colour.
 *
 * The `id` in /network/campaigns/:id is the CanonicalCampaign id used by the admin endpoints.
 * Every record is reduced to an explicit allowlist before it enters React state. Raw / normalized
 * payload JSON blobs carried by some DTOs are never copied.
 *
 * INTERNAL ADMIN CONTRACT. Supplier / source diagnostic fields are allowed here; none of this is a
 * client-safe contract.
 */

/**
 * The campaign row. A campaign summarizes its related records; it is not where they are stored.
 * Coupon / voucher records (codes, expiry, description) come from GET /supplier-coupons and
 * tracking-link records (supplier and MBO URLs) from GET /ops/admin/tracking-links, so the
 * backend's campaign-level couponCode / couponExpiry / couponDescription / campaignTrackingLink /
 * mboTrackingLink are deliberately NOT allowed through.
 */
export const CAMPAIGN_FIELDS = Object.freeze([
  // Canonical campaign fields (MBO standard, normalized by the backend).
  "id",
  "networkSource",
  "brandName",
  "brandWebsiteLink",
  "brandLogoLink",
  "campaignName",
  "primaryCategory",
  "secondaryCategory",
  "country",
  "currency",
  "campaignType",
  "campaignDescription",
  "campaignTermsAndCondition",
  "campaignCommission",
  "campaignStartDate",
  "campaignEndDate",
  "campaignStatus",
  "campaignPromotionDescription",
  "discountPercent",
  "relationshipStatus",
  "isAssignable",
  "linkSupport",
  "couponSupport",
  "deeplinkSupport",
  "commissionRuleCount",
  "mappingStatus",
  "lastSyncedAt",

  // Source / original values (admin diagnostics; network-native strings, never validated).
  "originalCurrency",
  "sourceCampaignStatus",
  "sourceRelationshipStatus",
  "sourceCampaignType",

  // Source identity and keys used to load related records.
  "supplierCampaignId",
  "supplierCampaignRowId", // GET /supplier-coupons?supplierCampaignId=
  "campaignSourceId",
  "networkAccount",
  "merchantId",
  "rawPayloadId",
  "rawPayloadLink",

  // Readiness / operational state.
  "mboReady",
  "campaignChannelType",
  "brandMappingComplete",
  "mappingCertificationStatus",
  "eligibilityState",
  "catalogStatus",
  "visibility",
  "assignmentCount",
  "conversionCount",
  "orderCount",
  "openExceptionCount",
  "productFeedAvailability",
  "operationalWarnings",
  "updatedAt",

  // Supplier commission summary (display only; the rules themselves are SupplierCommissionRule).
  "commissionDisplayEstimate",
  "commissionDisplayNote",
  "supplierCommissionRules",

  // Detail-only related collections (each reduced by its own allowlist in toCampaignView).
  "sources",
  "clientAssignments",
  "tracking",
  "commissionRules",
  "productFeeds",
  "exceptions",
  "health",
]);

/**
 * Source / original values: network-native diagnostic strings shown as returned. They are never
 * checked against the canonical vocabularies below.
 */
export const CAMPAIGN_SOURCE_DIAGNOSTIC_FIELDS = Object.freeze([
  "originalCurrency",
  "sourceCampaignStatus",
  "sourceRelationshipStatus",
  "sourceCampaignType",
]);

// Fields the backend declares unavailable in its own `unavailableFields` list for this contract.
export const BACKEND_UNAVAILABLE_FIELDS = Object.freeze([
  "secondaryCategory",
  "campaignTermsAndCondition",
  "campaignPromotionDescription",
  "campaignEndDate",
]);

export const COMMISSION_RULE_FIELDS = Object.freeze([
  "id",
  "displayLabel",
  "commissionSequence",
  "persistedCommissionSequence",
  "networkSource",
  "brandName",
  "campaignName",
  "supplierCampaignId",
  "sourceCampaignId",
  "campaignSourceId",
  "sourceAccountLabel",
  "sourceRuleId",
  "sourceRuleName",
  "sourceGroupId",
  "sourceGroupName",
  "outcomeKey",
  "commissionType",
  "rawCommissionType",
  "basis",
  "commissionValue",
  "ratePercent",
  "fixedAmount",
  "currency",
  "customerType",
  "country",
  "categoryProductGoal",
  "couponOrTier",
  "conditions",
  "campaignCountries",
  "effectiveFrom",
  "effectiveUntil",
  "mappingStatus",
  "fieldMappingOutcome",
  "ruleVersion",
  "ruleStatus",
  "financeReady",
  "reviewReasons",
  "projected",
  "projectionNote",
  "lastModifiedAt",
]);

// Detail endpoint embeds a reduced rule subset (campaign:read only). Kept separate on purpose.
export const EMBEDDED_RULE_FIELDS = Object.freeze([
  "id",
  "commissionType",
  "basis",
  "supplierRuleType",
  "ratePercent",
  "fixedAmount",
  "currency",
  "conditions",
  "effectiveFrom",
  "effectiveUntil",
]);

export const COUPON_FIELDS = Object.freeze([
  "id",
  "network",
  "networkSource",
  "supplierCampaignId",
  "supplierCouponId",
  "couponType",
  "couponCode",
  "couponLink",
  "title",
  "couponDescription",
  "promotionDescription",
  "discountValue",
  "discountType",
  "couponStartDate",
  "couponEndDate",
  "couponStatus",
  "couponIsExclusive",
  "customerType",
  "country",
  "sourceObject",
  "sourcePath",
  "mappingStatus",
  "fieldMappingOutcome",
  "mappingVersion",
  "rawPayloadId",
  "firstSeenAt",
  "lastSyncedAt",
]);

export const TRACKING_LINK_FIELDS = Object.freeze([
  "id",
  "networkSource",
  "networkSourceLabel",
  "brandName",
  "campaignName",
  "supplierLinkId",
  "linkType",
  "supplierTrackingLink",
  "supplierDeeplinkUrl",
  "landingPageUrl",
  "mboTrackingLink",
  "mboAssignmentStatus",
  "linkStatus",
  "mappingStatus",
  "deeplinkSupported",
  "attributionParameter",
  "attributionParamSummary",
  "redirectChainSummary",
  "sourceFieldPath",
  "campaignStatus",
  "updatedAt",
]);

export const RAW_PAYLOAD_FIELDS = Object.freeze([
  "rawPayloadId",
  "network",
  "networkAccountId",
  "sourceObject",
  "endpointOrReport",
  "apiVersion",
  "syncRunId",
  "fetchedAt",
  "receivedAt",
  "httpStatus",
  "payloadHash",
  "bodyKind",
  "supplier",
  "sourceAccountLabel",
  "resourceKey",
  "entityType",
  "externalId",
  "mapperVersion",
  "processingStatus",
  "immutable",
]);

export const PRODUCT_FEED_FIELDS = Object.freeze([
  "id",
  "supplier",
  "feedName",
  "feedExternalId",
  "status",
  "lastSyncAt",
  "campaignSourceId",
  "itemCount",
  "productCount",
  "assignmentCount",
  "errorCount",
  "exceptionCount",
  "lastError",
]);

export const SOURCE_FIELDS = Object.freeze([
  "id",
  "networkSource",
  "relationshipStatus",
  "sourceRelationshipStatus",
  "isPrimary",
  "isActive",
  "linkSupport",
  "couponSupport",
  "deeplinkSupport",
  "supplierCampaignId",
  "campaignTrackingLink",
  "campaignStatus",
  "sourceCampaignStatus",
  "campaignType",
  "currency",
  "originalCurrency",
  "lastSyncedAt",
  "grossCommissionEstimate",
  "estimateOnly",
]);

export const ASSIGNMENT_FIELDS = Object.freeze([
  "id",
  "clientId",
  "clientName",
  "status",
  "published",
  "campaignSourceId",
  "mboTrackingUrl",
]);

export function toCampaignView(dto) {
  const view = pickFields(dto, CAMPAIGN_FIELDS);
  if (!view) return null;
  view.sources = Array.isArray(dto.sources) ? dto.sources.map((s) => pickFields(s, SOURCE_FIELDS)).filter(Boolean) : [];
  view.clientAssignments = Array.isArray(dto.clientAssignments)
    ? dto.clientAssignments.map((a) => pickFields(a, ASSIGNMENT_FIELDS)).filter(Boolean)
    : [];
  view.productFeeds = Array.isArray(dto.productFeeds) ? dto.productFeeds.map((f) => pickFields(f, PRODUCT_FEED_FIELDS)).filter(Boolean) : [];
  view.supplierCommissionRules = Array.isArray(dto.supplierCommissionRules)
    ? dto.supplierCommissionRules.map((r) => pickFields(r, EMBEDDED_RULE_FIELDS)).filter(Boolean)
    : [];
  view.operationalWarnings = Array.isArray(dto.operationalWarnings) ? dto.operationalWarnings : [];
  view.country = Array.isArray(dto.country) ? dto.country : dto.country ? [dto.country] : null;
  return view;
}

export const toCommissionRuleView = (dto) => pickFields(dto, COMMISSION_RULE_FIELDS);
export const toCouponView = (dto) => pickFields(dto, COUPON_FIELDS);
export const toTrackingLinkView = (dto) => pickFields(dto, TRACKING_LINK_FIELDS);
export const toRawPayloadView = (dto) => pickFields(dto, RAW_PAYLOAD_FIELDS);

// ── Paths ────────────────────────────────────────────────────────────────────
export const CAMPAIGNS_PATH = "/ops/admin/campaigns";
export const campaignDetailPath = (id) => `/ops/admin/campaigns/${encodeURIComponent(id)}`;
export const COMMISSION_RULES_PATH = "/ops/admin/supplier-commission-rules";
export const SUPPLIER_COUPONS_PATH = "/supplier-coupons";
export const TRACKING_LINKS_PATH = "/ops/admin/tracking-links";
export const RAW_PAYLOADS_PATH = "/ops/raw-payloads";

// ── Server-side filter vocabulary (values are the backend enums / query params) ──
export const NETWORK_SOURCE_OPTIONS = ["BOOSTINY", "OPTIMISE", "TRACKIER", "PARTNERIZE", "IMPACT", "AWIN", "ADMITAD", "CJ", "RAKUTEN"];
/*
 * MBO canonical vocabularies — exactly what the production backend returns (ops/v15FieldContract).
 * The backend still accepts the old stored values (PENDING, NOT_JOINED, REQUIRES_APPROVAL) as filter
 * input, but never returns them, so they are not offered here.
 */
export const CAMPAIGN_STATUS_OPTIONS = Object.freeze(["ACTIVE", "PAUSED", "EXPIRED", "INACTIVE", "UNKNOWN"]);
export const RELATIONSHIP_STATUS_OPTIONS = Object.freeze([
  "JOINED",
  "APPROVED",
  "NOT_APPLIED",
  "PENDING",
  "REJECTED",
  "SUSPENDED",
  "UNKNOWN",
]);
/**
 * Canonical campaign type. TIERED is a commission structure (commission type TIER on the rule), not a
 * campaign model; the backend resolves the underlying model instead. A value outside this list can
 * only come from an older cached response: it is rendered verbatim with a "non-standard" marker and
 * never remapped.
 */
export const SHEET_CAMPAIGN_TYPES = Object.freeze(["CPS", "CPA", "CPL", "CPI", "CPC", "HYBRID", "UNKNOWN"]);
export const CAMPAIGN_TYPE_OPTIONS = SHEET_CAMPAIGN_TYPES;
/** Canonical supplier commission type on SupplierCommissionRule (network wording: rawCommissionType). */
export const COMMISSION_TYPE_OPTIONS = Object.freeze(["PERCENT", "FIXED", "CPC", "CPA", "CPS", "CPL", "TIER", "HYBRID", "OTHER"]);

export function classifyCampaignType(value) {
  if (value == null || value === "") return { value: null, standard: false, missing: true };
  const text = String(value);
  return { value: text, standard: SHEET_CAMPAIGN_TYPES.includes(text.toUpperCase()), missing: false };
}
// Backend only supports ERROR and NEEDS_REVIEW as server filters (MAPPED is not filterable).
export const MAPPING_STATUS_FILTER_OPTIONS = ["NEEDS_REVIEW", "ERROR"];

/**
 * Maps UI filter state to GET /ops/admin/campaigns query params. Only params the backend reads.
 * Unsupported on the server (deliberately absent): category, currency, brand-only search,
 * date range, MAPPED mapping filter, supplier-campaign-id search.
 */
export function buildCampaignListParams(filters = {}) {
  const params = {};
  if (filters.q) params.q = filters.q;
  if (filters.networkSource) params.networkSource = filters.networkSource;
  if (filters.campaignStatus) params.campaignStatus = filters.campaignStatus;
  if (filters.relationshipStatus) params.relationshipStatus = filters.relationshipStatus;
  if (filters.campaignType) params.campaignType = filters.campaignType;
  if (filters.country) params.country = String(filters.country).trim().toUpperCase();
  if (filters.isAssignable === "true" || filters.isAssignable === "false") params.isAssignable = filters.isAssignable;
  if (filters.linkSupport === "true") params.linkSupport = "true";
  if (filters.couponSupport === "true") params.couponSupport = "true";
  if (filters.mappingStatus) params.mappingStatus = filters.mappingStatus;
  return params;
}
