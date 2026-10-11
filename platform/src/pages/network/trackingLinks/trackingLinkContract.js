import { pickFields } from "../networkAccountContract.js";

/**
 * Network Tracking Links (Phase 5) — frontend view of the backend contracts,
 * production commit 15298635.
 *
 *   GET /ops/admin/tracking-links   tracking:read
 *       controller: networkPortal.controller#networkTrackingLinksHandler
 *       service:    ops/trackingLinksOps.service#listTrackingLinks
 *       row DTO:    ops/trackingLinksOps.service#toAdminTrackingLinkDto
 *       envelope:   core/pagination#toStandardPagedResponse → { ok, data[], pagination, contract }
 *       server params: network (alias supplier), q (alias search), page, pageSize
 *
 *   GET /tracking-links             tracking:read
 *       controller: commercial.controller#listTrackingLinksHandler
 *       row DTO:    commercial/dto/commercial.dto#toTrackingLinkDto
 *       server params: assignmentId, clientId, canonicalCampaignId, status, search, isPrimary
 *       These are the REAL ClientCampaignAssignment tracking links. They are a different
 *       canonical object from the registry rows and are never merged with them.
 *
 * Registry rows are SupplierCampaign records, not TrackingLink records: the registry lists one row
 * per supplier campaign that carries any link. `id` is therefore the MBO SupplierCampaign ROW id
 * and `supplierLinkId` is the supplier-side campaign id string, which is not unique across rows.
 *
 * URL semantics, which the DTO resolves with fallbacks and which must never be flattened:
 *   supplierTrackingLink = trackingUrl ?? destinationUrl       → "Supplier link (tracking or destination)"
 *   landingPageUrl       = destinationUrl ?? merchant.website  → "Destination / landing URL"
 *   supplierDeeplinkUrl  = deepLinkingEnabled ? supplierTrackingLink : null
 *                          → NOT a distinct deeplink URL; the same resolved link, gated on a flag
 *   deeplinkSupported    = the flag itself, which never proves a deeplink URL exists
 *   mboTrackingLink      = SupplierCampaign.mboTrackingUrl, a SUPPLIER-LEVEL slug generated at
 *                          sync time. It is not a client assignment.
 */

export const TRACKING_LINK_FIELDS = Object.freeze([
  "id", // MBO SupplierCampaign ROW id
  "networkSource",
  "networkSourceLabel",
  "supplier",
  "brandName",
  "campaignName",
  "supplierLinkId", // supplier-side campaign id string
  "linkType",
  // URLs — each kept under its own name
  "supplierTrackingLink", // resolved: tracking URL or destination URL
  "landingPageUrl", // resolved: destination URL or merchant website
  "supplierDeeplinkUrl", // the resolved link again when the deeplink flag is set
  "mboTrackingLink", // supplier-level MBO slug URL
  "deeplinkSupported",
  "linkKind",
  // State
  "linkStatus",
  "mappingStatus",
  "campaignStatus",
  "mboAssignmentStatus", // supplier-level slug presence only
  // Attribution
  "attributionParameter",
  "attributionParamSummary",
  "redirectChainSummary",
  "sourceFieldPath",
  "linksIndependent",
  "note",
  "updatedAt",
  "trackingLinkId",
]);

/** Client-assignment tracking links. A different object; never merged with a registry row. */
export const CLIENT_LINK_FIELDS = Object.freeze([
  "id",
  "assignmentId",
  "campaignSourceId",
  "slug",
  "supplierTrackingUrl",
  "mboTrackingUrl",
  "deeplinkTemplate",
  "trackingType",
  "status",
  "isPrimary",
  "expiresAt",
  "createdAt",
  "updatedAt",
  "clickCount",
  "supplier",
  "brand",
  "assignmentStatus",
  "assignmentPublished",
]);

/**
 * Fields the Sheet defines for links that the registry contract does not return.
 * Verified absent from toAdminTrackingLinkDto at production commit 15298635.
 */
export const BACKEND_UNAVAILABLE_FIELDS = Object.freeze([
  "campaignSourceId",
  "canonicalCampaignId",
  "networkAccountLabel",
  "supplierDeeplinkTrackingUrl",
  "mobileTrackingUrl",
  "localizedDestinations",
  "clientAssignmentCount",
  "clientMboLinkCount",
  "rawPayloadId",
  "lastSyncedAt",
]);

export function toTrackingLinkView(dto) {
  return pickFields(dto, TRACKING_LINK_FIELDS);
}

/**
 * Client link projection. `subId` / `token` are deliberately not copied: the token already
 * travels inside mboTrackingUrl, and there is no reason to surface it as a standalone value.
 */
export function toClientLinkView(dto) {
  const view = pickFields(dto, CLIENT_LINK_FIELDS);
  if (!view) return null;
  view.clientName = dto?.client?.name ?? null;
  view.clientId = dto?.client?.id ?? null;
  view.campaignId = dto?.campaign?.id ?? null;
  view.campaignDisplayName = dto?.campaign?.displayName ?? null;
  return view;
}

// ── Paths ────────────────────────────────────────────────────────────────────
export const TRACKING_REGISTRY_PATH = "/ops/admin/tracking-links";
export const CLIENT_TRACKING_LINKS_PATH = "/tracking-links";
export const CAMPAIGNS_PATH = "/ops/admin/campaigns";
export const SUPPLIER_COUPONS_PATH = "/supplier-coupons";

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
 * `linkStatus` IS accepted by the endpoint, but the service applies it in memory AFTER the page
 * has been sliced and then reports the filtered page length as the total. Offering it as a global
 * filter would misstate both the result set and the count, so it is not offered at all.
 */
export const BACKEND_FILTER_GAPS = Object.freeze([
  "link status (accepted but applied after pagination, and it rewrites the total)",
  "mapping status",
  "link type",
  "deeplink support",
  "attribution parameter",
  "campaign source",
  "network account",
  "sort order",
]);

export function buildRegistryParams(filters = {}) {
  const params = {};
  if (filters.network) params.network = filters.network;
  if (filters.q) params.q = String(filters.q).trim();
  return params;
}

// ── URL semantics ────────────────────────────────────────────────────────────

export const URL_LABELS = Object.freeze({
  supplierTrackingLink: "Supplier link (tracking or destination)",
  landingPageUrl: "Destination / landing URL",
  supplierDeeplinkUrl: "Deeplink URL",
  mboTrackingLink: "Supplier-level MBO slug URL",
});

export const URL_HELP = Object.freeze({
  supplierTrackingLink:
    "The backend resolves this from the campaign's tracking URL and falls back to its destination URL, so this single value can be either one.",
  landingPageUrl:
    "The backend resolves this from the campaign's destination URL and falls back to the merchant website, so this single value can be either one.",
  supplierDeeplinkUrl:
    "This contract returns no distinct deeplink URL: it repeats the resolved supplier link whenever the deeplink flag is set. Deeplink support is reported separately.",
  mboTrackingLink:
    "An MBO slug generated on the supplier campaign at sync time. This does not mean a client campaign assignment exists.",
});

/** Supplier-level slug state. Never the word "assigned": that belongs to client assignments. */
export const SLUG_STATE = Object.freeze({
  GENERATED: "GENERATED",
  NOT_GENERATED: "NOT_GENERATED",
  UNKNOWN: "UNKNOWN",
});

export const SLUG_DISCLAIMER = "This does not mean a client campaign assignment exists.";

/**
 * `supplierLinkId` provenance, traced at production commit 15298635:
 *   routes/index.js       GET /ops/admin/tracking-links (tracking:read)
 *   → networkPortal.controller#networkTrackingLinksHandler
 *   → ops/trackingLinksOps.service#listTrackingLinks, which queries db.supplierCampaign.findMany
 *     with an `include` only, so each row is a full SupplierCampaign record
 *   → toAdminTrackingLinkDto line 80: `supplierLinkId: row.supplierCampaignId || null`
 *
 * The value is therefore SupplierCampaign.supplierCampaignId, the supplier-side campaign id, not
 * a link-specific identifier. The DTO key is named after links, which is why this is stated
 * rather than assumed. That column is part of the model's compound unique key
 * (supplier, supplierRegion, sourceAccountLabel, supplierCampaignId), so it is not unique alone
 * and is never treated as MBO lineage.
 */
export const SUPPLIER_LINK_ID_HELP =
  "The supplier-side campaign id (SupplierCampaign.supplierCampaignId), which the registry returns under the DTO key supplierLinkId. It is not unique across MBO rows, so it is never used to match lineage; the supplier campaign row id is.";

/**
 * Reads the registry's `mboAssignmentStatus`, which is only `mboTrackingUrl ? ASSIGNED : UNASSIGNED`
 * on the SupplierCampaign row, and reports it as slug generation rather than assignment.
 */
export function supplierSlugState(row) {
  if (row?.mboTrackingLink) return SLUG_STATE.GENERATED;
  const status = row?.mboAssignmentStatus ? String(row.mboAssignmentStatus).toUpperCase() : null;
  if (status === "ASSIGNED") return SLUG_STATE.GENERATED;
  if (status === "UNASSIGNED") return SLUG_STATE.NOT_GENERATED;
  return SLUG_STATE.UNKNOWN;
}

/** Deeplink support and a deeplink URL are separate facts; a flag never proves a URL. */
export function deeplinkSupport(row) {
  const flag = row?.deeplinkSupported ? String(row.deeplinkSupported).toUpperCase() : null;
  if (flag === "YES") return { supported: true, label: "Yes" };
  if (flag === "NO") return { supported: false, label: "No" };
  return { supported: null, label: "Not stated" };
}

/**
 * Attribution parameter NAME only. The backend returns the literal "VERIFY_LIVE" for networks
 * whose parameter is not confirmed; that is surfaced as unconfirmed rather than as a name.
 * No attribution VALUE is ever shown.
 */
export function attributionParameter(row) {
  const name = row?.attributionParameter ? String(row.attributionParameter).trim() : null;
  if (!name || name.toUpperCase() === "VERIFY_LIVE") {
    return { name: null, confirmed: false };
  }
  return { name, confirmed: true };
}

export function attributionSummary(row) {
  const summary = row?.attributionParamSummary ? String(row.attributionParamSummary).trim() : null;
  if (!summary || summary.toUpperCase() === "VERIFY_LIVE") return null;
  return summary;
}

// ── Operational warnings (only from facts the contract proves) ────────────────

export function trackingWarnings(row) {
  const warnings = [];
  if (!row) return warnings;
  if (!row.supplierTrackingLink) warnings.push("No supplier link resolved for this campaign row");
  if (!row.landingPageUrl) warnings.push("No destination or landing URL recorded");
  const deeplink = deeplinkSupport(row);
  if (deeplink.supported === true && !row.supplierDeeplinkUrl) {
    warnings.push("Deeplink is supported but no deeplink URL is returned");
  }
  if (deeplink.supported === null) warnings.push("Deeplink support is not stated by the network");
  if (!attributionParameter(row).confirmed) {
    warnings.push("Attribution parameter is unconfirmed for this network");
  }
  if (String(row.mappingStatus || "").toUpperCase() === "UNMAPPED") warnings.push("Link mapping incomplete");
  if (String(row.linkStatus || "").toUpperCase() === "VERIFY_LIVE") warnings.push("Link status needs live verification");
  return warnings;
}
