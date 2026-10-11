import { pickFields } from "../networkAccountContract.js";

/**
 * Supplier Commission Rules (Phase 4) — frontend view of the backend contract,
 * production commit 15298635.
 *
 *   GET /ops/admin/supplier-commission-rules  commission:read
 *       controller: networkPortal.controller#supplierCommissionRulesHandler
 *       service:    networkPortal.service#listSupplierCommissionRules
 *       row DTO:    supplierCommissionListing#toListingDto
 *                   (= commercial/supplierCommissionRule.contract#toSupplierCommissionRuleDto
 *                      + displayLabel, persistedCommissionSequence, sourceAccountLabel, reviewReasons)
 *       envelope:   core/pagination#toStandardPagedResponse → { ok, data[], pagination, meta }
 *       server params: network (alias supplier), q (alias search), page, pageSize (max 100)
 *
 *   GET /ops/admin/commission-vocabulary     commission:read
 *       adminContract.service#getCommissionRuleVocabulary — CLIENT rule-type vocabulary
 *       (supportedClientTypes / legacy / notImplemented / guidance). It is NOT a supplier
 *       commission-rule vocabulary, so it is shown as reference only and never used to
 *       label, map or filter supplier rules.
 *
 * A SupplierCommissionRule is the supplier's advertised commercial rule. It is never the
 * commission MBO earned, never a client payable amount and never an MBO margin.
 *
 * Every record is reduced to an explicit allowlist before it enters React state.
 * `conditions[].sourceConditionValue` is deliberately NOT copied: it is arbitrary supplier
 * JSON that the backend does not run through its secret scrubber on this contract.
 */

export const COMMISSION_RULE_FIELDS = Object.freeze([
  "id",
  "networkSource",
  "sourceAccountLabel",
  "brandName",
  "campaignName",
  // Identity trio — see the Phase 3 lesson: a supplier-side campaign id is not unique.
  "supplierCampaignId", // MBO SupplierCampaign row id
  "sourceCampaignId", // supplier-side campaign id string
  "campaignSourceId",
  // Display sequencing (backend-assigned; never recomputed here)
  "displayLabel",
  "commissionSequence",
  "persistedCommissionSequence",
  "outcomeKey",
  "outcomeSlot",
  // Commercial outcome
  "commissionType",
  "basis",
  "commissionValue",
  "ratePercent",
  "fixedAmount",
  "currency",
  // Rule-scoped dimensions
  "customerType",
  "country",
  "categoryProductGoal",
  "couponOrTier",
  "conditions",
  // Campaign context (never an implied rule restriction)
  "campaignCountries",
  "campaignCategory",
  // Lifecycle
  "effectiveFrom",
  "effectiveUntil",
  "ruleStatus",
  "ruleVersion",
  "projected",
  "projectionNote",
  "lastModifiedAt",
  // Source lineage
  "supplierCommissionRuleId",
  "sourceRuleId",
  "sourceRuleName",
  "sourceGroupId",
  "sourceGroupName",
  "sourceObject",
  "sourcePath",
  "sourceFieldPath",
  // Mapping / review
  "mappingStatus",
  "fieldMappingOutcome",
  "reviewReasons",
  "note",
]);

/** Scalar condition fields only. Raw supplier condition JSON is never copied into state. */
export const CONDITION_FIELDS = Object.freeze([
  "id",
  "conditionType",
  "operator",
  "value",
  "sourceConditionType",
]);

/**
 * Fields the backend does not expose on this contract. Listed so the UI can say so instead
 * of deriving them. Verified against production commit 15298635.
 */
export const BACKEND_UNAVAILABLE_FIELDS = Object.freeze([
  "financeReady", // the backend keeps its readiness decision in rule metadata and never copies it into this DTO
  "canonicalCampaignId", // no canonical campaign id on the rule row
  "rawPayloadId", // the column exists on the model but is not in the DTO
  "networkAccountId", // only the sourceAccountLabel string is returned
  "createdAt", // only lastModifiedAt is returned
  "mapperVersion", // only ruleVersion is returned
]);

export function toConditionView(dto) {
  return pickFields(dto, CONDITION_FIELDS);
}

export function toCommissionRuleView(dto) {
  const view = pickFields(dto, COMMISSION_RULE_FIELDS);
  if (!view) return null;
  view.conditions = Array.isArray(dto.conditions) ? dto.conditions.map(toConditionView).filter(Boolean) : [];
  view.campaignCountries = Array.isArray(dto.campaignCountries) ? dto.campaignCountries : [];
  view.reviewReasons = Array.isArray(dto.reviewReasons) ? dto.reviewReasons : [];
  view.projected = dto.projected === true;
  return view;
}

// ── Paths ────────────────────────────────────────────────────────────────────
export const COMMISSION_RULES_PATH = "/ops/admin/supplier-commission-rules";
export const COMMISSION_VOCABULARY_PATH = "/ops/admin/commission-vocabulary";
export const CAMPAIGNS_PATH = "/ops/admin/campaigns";

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

/**
 * Server-side filter vocabulary. The endpoint reads ONLY `network` and `q`; everything else
 * a commission audit would want is a backend gap and must not be faked from a loaded page.
 */
export const SERVER_FILTERS = Object.freeze(["network", "q"]);

export const BACKEND_FILTER_GAPS = Object.freeze([
  "network account / source account label",
  "supplier campaign id (exact, not contains)",
  "rule type and payout basis",
  "currency",
  "country (exact)",
  "rule status / effective date range",
  "finance readiness and review-required",
  "persisted vs projected",
  "source group",
  "sort order",
]);

/** Maps UI filter state to GET /ops/admin/supplier-commission-rules query params. */
export function buildRuleListParams(filters = {}) {
  const params = {};
  if (filters.network) params.network = filters.network;
  if (filters.q) params.q = String(filters.q).trim();
  return params;
}

// ── Commercial semantics ─────────────────────────────────────────────────────

/**
 * Payout family of one rule. Percentage and fixed-amount outcomes are never comparable,
 * and two fixed amounts are comparable only in the same currency.
 */
export const RULE_FAMILY = Object.freeze({
  PERCENT: "PERCENT",
  FIXED: "FIXED",
  UNKNOWN: "UNKNOWN",
});

function numberOrNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function ruleFamily(rule) {
  const ratePercent = numberOrNull(rule?.ratePercent);
  if (ratePercent != null) return { family: RULE_FAMILY.PERCENT, currency: null, value: ratePercent };
  const fixedAmount = numberOrNull(rule?.fixedAmount);
  if (fixedAmount != null) {
    const currency = rule?.currency ? String(rule.currency).toUpperCase() : null;
    return { family: RULE_FAMILY.FIXED, currency, value: fixedAmount };
  }
  return { family: RULE_FAMILY.UNKNOWN, currency: null, value: null };
}

/** Comparable rules share a family and, for fixed amounts, a currency. */
export function familyKey(rule) {
  const info = ruleFamily(rule);
  if (info.family === RULE_FAMILY.PERCENT) return "PERCENT";
  if (info.family === RULE_FAMILY.FIXED) return info.currency ? `FIXED:${info.currency}` : null;
  return null;
}

/**
 * Display form of one rule's value. Unit semantics are never dropped: a percentage always
 * carries %, a fixed amount always carries its currency, and a fixed amount with no currency
 * is flagged rather than shown as a bare number.
 */
export function formatRuleValue(rule) {
  const info = ruleFamily(rule);
  if (info.family === RULE_FAMILY.PERCENT) {
    return { text: `${info.value}%`, family: info.family, currencyMissing: false, available: true };
  }
  if (info.family === RULE_FAMILY.FIXED) {
    if (!info.currency) {
      return { text: String(info.value), family: info.family, currencyMissing: true, available: true };
    }
    return { text: `${info.currency} ${info.value}`, family: info.family, currencyMissing: false, available: true };
  }
  return { text: null, family: info.family, currencyMissing: false, available: false };
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const LIFECYCLE = Object.freeze({
  CURRENT: "CURRENT",
  SCHEDULED: "SCHEDULED",
  EXPIRED: "EXPIRED",
  UNKNOWN: "UNKNOWN",
});

/**
 * Refines — never contradicts — the backend `ruleStatus`.
 *
 * The backend derives ACTIVE / EXPIRED from effectiveUntil alone, so a rule whose window has
 * not opened yet is still reported ACTIVE. Effective dates separate those two cases here.
 * The backend status is always shown alongside, verbatim.
 *
 * The contract carries no "superseded" or "inactive" state: closing a rule sets effectiveUntil,
 * which the backend reports as EXPIRED. Those states are therefore not derived.
 */
export function ruleLifecycle(rule, now = Date.now()) {
  const status = rule?.ruleStatus ? String(rule.ruleStatus).toUpperCase() : null;
  if (status === "EXPIRED") return LIFECYCLE.EXPIRED;
  const from = rule?.effectiveFrom ? new Date(rule.effectiveFrom).getTime() : null;
  if (status === "ACTIVE") {
    if (from != null && Number.isFinite(from) && from > now) return LIFECYCLE.SCHEDULED;
    return LIFECYCLE.CURRENT;
  }
  return LIFECYCLE.UNKNOWN;
}

export const LIFECYCLE_LABELS = Object.freeze({
  CURRENT: "Current",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
  UNKNOWN: "Unknown",
});

// ── Finance readiness ────────────────────────────────────────────────────────

/**
 * Finance readiness is its own business concept and this contract does not carry it.
 * `SupplierCommissionRule` holds the backend's readiness decision in rule metadata, but
 * `toSupplierCommissionRuleDto` never copies it, so no value for it exists here.
 *
 * It is therefore reported as unavailable and is NEVER inferred from `fieldMappingOutcome`,
 * `mappingStatus`, `reviewReasons`, the persisted/projected flag, the rule status or any
 * combination of them. Those are separate states and stay separately visible.
 */
export const FINANCE_READY_UNAVAILABLE = "Not available (backend)";

export const REVIEW_STATE = Object.freeze({
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  NO_REVIEW_FLAGGED: "NO_REVIEW_FLAGGED",
  UNKNOWN: "UNKNOWN",
});

/**
 * Review state exactly as the backend reports it: the rule is flagged when the contract returns
 * `fieldMappingOutcome: REVIEW_REQUIRED` or any review reason. This says nothing about whether
 * finance may use the rule.
 */
export function reviewState(rule) {
  const outcome = rule?.fieldMappingOutcome ? String(rule.fieldMappingOutcome).toUpperCase() : null;
  const reasons = Array.isArray(rule?.reviewReasons) ? rule.reviewReasons : [];
  if (outcome === "REVIEW_REQUIRED" || reasons.length > 0) return REVIEW_STATE.REVIEW_REQUIRED;
  if (outcome === "MAPPED") return REVIEW_STATE.NO_REVIEW_FLAGGED;
  return REVIEW_STATE.UNKNOWN;
}

export function needsReview(rule) {
  return reviewState(rule) === REVIEW_STATE.REVIEW_REQUIRED;
}

// ── Operational warnings (only from facts the contract proves) ────────────────

export function ruleWarnings(rule) {
  const warnings = [];
  if (!rule) return warnings;
  if (!rule.campaignSourceId) warnings.push("No campaign source linkage on this rule");
  if (!rule.supplierCampaignId) warnings.push("No SupplierCampaign row linkage on this rule");
  const value = formatRuleValue(rule);
  if (value.currencyMissing) warnings.push("Fixed payout has no currency");
  if (!value.available) warnings.push("No numeric commission outcome");
  if (rule.projected) warnings.push("Projected outcome, not a persisted canonical rule");
  if (needsReview(rule)) warnings.push("Flagged for review by the backend");
  if (ruleLifecycle(rule) === LIFECYCLE.EXPIRED) warnings.push("Historical rule, no longer in effect");
  if (String(rule.mappingStatus || "").toUpperCase() === "UNMAPPED") warnings.push("Source mapping incomplete");
  return warnings;
}

/** Human label for a backend review-reason token, without inventing meaning. */
export function reviewReasonLabel(reason) {
  if (!reason) return "";
  return String(reason).replace(/_/g, " ").replace(/:/g, ": ");
}

// ── Group identity ───────────────────────────────────────────────────────────

/**
 * The unambiguous grouping the backend orders by: one MBO SupplierCampaign row. The
 * supplier-side campaign id is never used, since the same string can exist on several rows.
 */
export function ruleGroupKey(rule) {
  if (rule?.supplierCampaignId) return `row:${rule.supplierCampaignId}`;
  if (rule?.campaignSourceId) return `source:${rule.campaignSourceId}`;
  return null;
}
