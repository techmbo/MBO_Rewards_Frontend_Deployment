import { pickFields } from "../networkAccountContract.js";
import { htmlToReadableText } from "../campaigns/campaignText.js";
import { CODE_STATE, couponCodeState } from "./couponCodeSafety.js";

/**
 * Supplier Coupons / Vouchers (Phase 5) — frontend view of the backend contract,
 * production commit 15298635.
 *
 *   GET /supplier-coupons   coupons:read
 *       controller: supplierCoupons.controller#listSupplierCouponsHandler
 *       service:    supplier/services/query/supplierCouponQuery.service#list
 *       row DTO:    supplier/dto/supplierCoupon.dto#toSupplierCouponDto
 *                   (= coupons/couponVoucher.contract#toCouponVoucherDto + couponType, supplier,
 *                      brandName, campaignName, payloads, firstSeenAt/createdAt/updatedAt,
 *                      supplierCampaign summary)
 *       access:     auth/supplierDataAccess#applySupplierCouponAccess strips rawPayload and
 *                   normalizedPayload unless system:read + includePayloads, and strips entityId
 *                   and mapperVersion unless integrations:read or system:read.
 *       envelope:   core/pagination#toStandardPagedResponse → { ok, data[], pagination }
 *       server params: supplierCampaignId (exact, the MBO SupplierCampaign ROW id), couponType,
 *                      couponStatus, networkSource (contains), search (contains), page,
 *                      pageSize (max 200), cursor, includePayloads
 *
 * A SupplierCoupon is the network's own coupon record. It is NOT a client coupon assignment and
 * NOT the Coupon CMS: ClientCouponAssignment and CouponCodeMaster are separate canonical objects
 * and none of their fields belong here.
 *
 * Identity, per the Phase 3 lesson: `supplierCampaignId` on this DTO is the MBO SupplierCampaign
 * ROW id, while `campaign.supplierCampaignId` is the supplier-side id string, which is NOT unique
 * across rows. The two are always kept apart.
 *
 * `includePayloads` is never requested: payload bodies are not rendered anywhere.
 */

export const COUPON_FIELDS = Object.freeze([
  "id",
  "network",
  "networkSource",
  "supplier",
  "brandName",
  "campaignName",
  // Identity — the supplier-side id lives on `campaign`, never confused with the row id.
  "supplierCampaignId", // MBO SupplierCampaign ROW id
  "supplierCouponId", // supplier-side coupon id
  // Coupon
  "couponCode",
  "couponType",
  "title",
  "couponDescription",
  "promotionDescription",
  "discountValue",
  "discountType",
  "couponIsExclusive",
  "customerType",
  "country",
  "couponLink",
  // Lifecycle
  "couponStartDate",
  "couponEndDate",
  "couponStatus",
  "firstSeenAt",
  "lastSyncedAt",
  "createdAt",
  "updatedAt",
  // Mapping / lineage
  "sourceObject",
  "sourcePath",
  "mappingStatus",
  "fieldMappingOutcome",
  "mappingVersion",
  "mapperVersion",
  "rawPayloadId",
  "entityId",
]);

export const COUPON_CAMPAIGN_FIELDS = Object.freeze([
  "id", // MBO SupplierCampaign row id
  "supplierCampaignId", // supplier-side id string
  "campaignName",
  "supplier",
  "supplierRegion",
  "merchantNameRaw",
  "campaignStatus",
]);

/**
 * Fields the Sheet defines for supplier coupons that this contract does not return.
 * Verified absent from toSupplierCouponDto at production commit 15298635.
 */
export const BACKEND_UNAVAILABLE_FIELDS = Object.freeze([
  "campaignSourceId",
  "canonicalCampaignId",
  "couponTerms",
  "couponCategory",
  "affiliateSpecific",
  "supplierDeeplinkUrl",
  "supplierDeeplinkTrackingUrl",
  "commissionGroupIds",
  "attributionConfirmation",
  "networkAccountLabel",
]);

export function toCouponView(dto) {
  const view = pickFields(dto, COUPON_FIELDS);
  if (!view) return null;
  // The DTO nests the campaign summary twice; `campaign` is the lean one and is the only
  // place the supplier-side campaign id is exposed.
  const campaign = dto.campaign || dto.supplierCampaign || null;
  view.campaign = campaign ? pickFields(campaign, COUPON_CAMPAIGN_FIELDS) : null;
  return view;
}

// ── Paths ────────────────────────────────────────────────────────────────────
export const SUPPLIER_COUPONS_PATH = "/supplier-coupons";
export const CAMPAIGNS_PATH = "/ops/admin/campaigns";
export const TRACKING_LINKS_PATH = "/ops/admin/tracking-links";
export const COMMISSION_RULES_PATH = "/ops/admin/supplier-commission-rules";

export const NETWORK_SOURCE_OPTIONS = Object.freeze([
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

/** Prisma CouponStatus / CouponType enums as the query schema validates them. */
export const COUPON_STATUS_OPTIONS = Object.freeze(["ACTIVE", "EXPIRED", "PAUSED", "UNKNOWN"]);
export const COUPON_TYPE_OPTIONS = Object.freeze(["CODE", "LINK", "DEAL", "UNKNOWN"]);

/** Filters a coupon audit wants that the endpoint cannot apply. Named, never faked. */
export const BACKEND_FILTER_GAPS = Object.freeze([
  "active on a given date / effective range",
  "exclusive flag",
  "affiliate-specific flag",
  "country or geo",
  "campaign source",
  "coupon code exact match (search is a contains match)",
  "sort order",
]);

/** Maps UI filter state to GET /supplier-coupons query params. Server-applied only. */
export function buildCouponListParams(filters = {}) {
  const params = {};
  if (filters.search) params.search = String(filters.search).trim();
  if (filters.networkSource) params.networkSource = filters.networkSource;
  if (filters.couponStatus) params.couponStatus = filters.couponStatus;
  if (filters.couponType) params.couponType = filters.couponType;
  if (filters.supplierCampaignId) params.supplierCampaignId = String(filters.supplierCampaignId).trim();
  return params;
}

// ── Discount ─────────────────────────────────────────────────────────────────

export const DISCOUNT_KIND = Object.freeze({
  PERCENT: "PERCENT",
  AMOUNT: "AMOUNT",
  TEXT: "TEXT",
  NONE: "NONE",
});

const PERCENT_ONLY = /^\s*-?\d+(?:\.\d+)?\s*%\s*$/;
const BARE_NUMBER = /^\s*-?\d+(?:\.\d+)?\s*$/;
const CURRENCY_AMOUNT = /^\s*([A-Z]{3})\s*-?\d+(?:\.\d+)?\s*$|^\s*-?\d+(?:\.\d+)?\s*([A-Z]{3})\s*$/;

/**
 * Presents `discountValue` without inventing semantics.
 *
 * The backend stores the supplier's discount as free text (`discountValue: String?`) beside an
 * equally free-text `discountType`. A bare number is therefore NOT a percentage: it is a number
 * whose unit the contract does not state. Only text that already carries its own unit is shown
 * with that unit, and everything else is shown verbatim.
 *
 * A currency amount is never re-expressed as a percentage, and promotional wording such as
 * "Up to 20%" or "Free Shipping" is passed through untouched.
 */
export function formatDiscount(coupon) {
  const raw = coupon?.discountValue;
  if (raw == null || String(raw).trim() === "") {
    return { kind: DISCOUNT_KIND.NONE, text: null, unitKnown: false, sourceType: coupon?.discountType ?? null };
  }
  const text = String(raw).trim();
  const sourceType = coupon?.discountType ? String(coupon.discountType).trim() : null;

  if (PERCENT_ONLY.test(text)) {
    return { kind: DISCOUNT_KIND.PERCENT, text, unitKnown: true, sourceType };
  }
  if (CURRENCY_AMOUNT.test(text)) {
    return { kind: DISCOUNT_KIND.AMOUNT, text, unitKnown: true, sourceType };
  }
  if (BARE_NUMBER.test(text)) {
    // A number with no unit. The discount type string is shown beside it as the only hint the
    // contract gives, and it is never turned into a percent sign.
    return { kind: DISCOUNT_KIND.TEXT, text, unitKnown: false, sourceType };
  }
  return { kind: DISCOUNT_KIND.TEXT, text, unitKnown: true, sourceType };
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const COUPON_LIFECYCLE = Object.freeze({
  CURRENT: "CURRENT",
  SCHEDULED: "SCHEDULED",
  EXPIRED: "EXPIRED",
  UNKNOWN: "UNKNOWN",
});

export const COUPON_LIFECYCLE_LABELS = Object.freeze({
  CURRENT: "Current",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
  UNKNOWN: "No dates",
});

/**
 * Date-derived lifecycle. It NEVER overwrites `couponStatus`: both are displayed, and when they
 * disagree the UI says so rather than silently resolving the conflict in either direction.
 */
export function couponLifecycle(coupon, now = Date.now()) {
  const from = coupon?.couponStartDate ? new Date(coupon.couponStartDate).getTime() : null;
  const until = coupon?.couponEndDate ? new Date(coupon.couponEndDate).getTime() : null;
  const hasFrom = from != null && Number.isFinite(from);
  const hasUntil = until != null && Number.isFinite(until);
  if (!hasFrom && !hasUntil) return COUPON_LIFECYCLE.UNKNOWN;
  if (hasUntil && until < now) return COUPON_LIFECYCLE.EXPIRED;
  if (hasFrom && from > now) return COUPON_LIFECYCLE.SCHEDULED;
  return COUPON_LIFECYCLE.CURRENT;
}

/** True when the supplier's own status and the dates tell different stories. */
export function lifecycleConflict(coupon, now = Date.now()) {
  const status = coupon?.couponStatus ? String(coupon.couponStatus).toUpperCase() : null;
  const life = couponLifecycle(coupon, now);
  if (!status || life === COUPON_LIFECYCLE.UNKNOWN) return null;
  if (status === "ACTIVE" && life === COUPON_LIFECYCLE.EXPIRED) {
    return "The network reports this coupon ACTIVE while its end date has passed.";
  }
  if (status === "ACTIVE" && life === COUPON_LIFECYCLE.SCHEDULED) {
    return "The network reports this coupon ACTIVE while its start date is still in the future.";
  }
  if (status === "EXPIRED" && life === COUPON_LIFECYCLE.CURRENT) {
    return "The network reports this coupon EXPIRED while its dates are still current.";
  }
  return null;
}

// ── Attribution ──────────────────────────────────────────────────────────────

/**
 * Tab 08C: a coupon-only campaign is not automatically attributable or payable, and attribution
 * confirmation is a backend decision. This contract returns no attribution evidence for a
 * supplier coupon, so the state is reported as unavailable and is NEVER inferred from the mere
 * presence of a coupon code.
 */
export const ATTRIBUTION_UNAVAILABLE = "Not available (backend)";

// ── Readable text ────────────────────────────────────────────────────────────

/** Supplier descriptions arrive as basic HTML; reuse the Phase 3 readable-text conversion. */
export function couponReadableText(value) {
  return htmlToReadableText(value);
}

// ── Operational warnings (only from facts the contract proves) ────────────────

export function couponWarnings(coupon, now = Date.now()) {
  const warnings = [];
  if (!coupon) return warnings;
  if (!coupon.campaign?.id) warnings.push("No SupplierCampaign linkage on this coupon");
  const codeState = couponCodeState(coupon).state;
  if (codeState === CODE_STATE.URL_SUPPLIED) {
    // Truthful about what is stored; it does not claim a corrected code exists.
    warnings.push("A URL is stored in the coupon code field, so this record has no usable coupon code");
  }
  if (codeState === CODE_STATE.NONE && !coupon.couponLink) {
    warnings.push("Neither a coupon code nor a coupon link is recorded");
  }
  if (formatDiscount(coupon).kind === DISCOUNT_KIND.NONE) warnings.push("No discount value recorded");
  const conflict = lifecycleConflict(coupon, now);
  if (conflict) warnings.push(conflict);
  if (couponLifecycle(coupon, now) === COUPON_LIFECYCLE.EXPIRED) warnings.push("Coupon end date has passed");
  if (String(coupon.mappingStatus || "").toUpperCase() === "UNMAPPED") warnings.push("Source mapping incomplete");
  if (!coupon.rawPayloadId) warnings.push("No raw payload reference on this record");
  return warnings;
}
