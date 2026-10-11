import { pickFields } from "../networkAccountContract.js";

/**
 * Network Product Feeds (Phase 7A) — frontend view of the backend contract,
 * production commit 15298635.
 *
 *   GET /ops/admin/product-feeds   products:read
 *       controller: adminContract.controller#adminListProductFeedsHandler
 *       service:    ops/adminContract.service#listProductFeeds  (productFeed.findMany + count)
 *       row DTO:    ops/adminContract.dto#toAdminProductFeedDto
 *       envelope:   core/pagination#toStandardPagedResponse → { ok, data[], pagination, contract }
 *       server params: page, pageSize (max 100, default 25). No filters, no sort.
 *       alias:      GET /ops/admin/feeds resolves to the same handler.
 *
 * Two sibling endpoints are deliberately NOT used:
 *
 *   GET /ops/products — listProducts() calls promotion.promoteBatch() before returning, which
 *   creates and updates Product and ProductSource rows and sets RawPayload.processingStatus to
 *   PROMOTED. It writes to production during a GET, so this admin UI never calls it, and the
 *   Products tab says so rather than showing data obtained that way.
 *
 *   GET /ops/product-feeds — returns raw Prisma rows with no DTO, exposing feedUrl, metadata,
 *   compressedLocation and aid, and reports `total: rows.length` (the page length, not a total).
 *   The admin variant above is the only feed source used.
 */

/** Exactly the keys toAdminProductFeedDto returns. Nothing else is read off a row. */
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
]);

/**
 * Fields an operator would expect that this contract does not return. Verified absent from
 * toAdminProductFeedDto at production commit 15298635. They are named, never faked.
 */
export const BACKEND_UNAVAILABLE_FIELDS = Object.freeze([
  "Feed format / type",
  "Source account label",
  "Feed URL (presence or value)",
  "Mapping version",
  "Created at",
  "Updated at",
  "Raw payload reference",
]);

export const NO_RAW_REFERENCE = "No raw payload reference is returned by this contract.";

/**
 * Projects a row to the contract's own keys.
 *
 * The error signal is read from whichever contract the backend is serving. The newer backend
 * reduces the failure to `hasError` plus a `safeErrorCode` from a closed set and stops returning
 * `lastError` at all; the backend in production still returns the raw `lastError` text. Preferring
 * the boolean and falling back to presence keeps this page truthful against both, which matters
 * because reading only one of them would silently report "no error" for every failing feed during
 * the window where the two are out of step.
 *
 * Neither branch copies the raw text onto the view: `lastError` is never part of the projection.
 */
export function toProductFeedView(dto) {
  const view = pickFields(dto, PRODUCT_FEED_FIELDS);
  if (!view) return null;
  view.hasError = typeof dto?.hasError === "boolean" ? dto.hasError : hasErrorText(dto?.lastError);
  view.safeErrorCode = knownErrorCode(dto?.safeErrorCode);
  return view;
}

// ── Error state ──────────────────────────────────────────────────────────────

export const ERROR_STATE = Object.freeze({
  NONE: "NONE",
  PRESENT: "PRESENT",
});

export const ERROR_LABELS = Object.freeze({
  NONE: "No error reported",
  PRESENT: "Error present",
});

export const ERROR_SUPPRESSED_NOTE =
  "Error detail suppressed because this contract returns raw backend error text.";

function hasErrorText(value) {
  return value != null && String(value).trim() !== "";
}

/**
 * Error codes this UI will display, and the wording for each.
 *
 * A code is rendered only if it is one of these. Anything else — including a code a future
 * backend adds, or arbitrary text in that field — falls back to the generic label, so no
 * server-supplied string is ever printed.
 */
export const ERROR_CODE_LABELS = Object.freeze({
  AUTH_FAILED: "Authentication failed",
  NOT_FOUND: "Feed not found",
  TIMEOUT: "Timed out",
  NETWORK_UNREACHABLE: "Network unreachable",
  PARSE_FAILED: "Feed could not be parsed",
  MAPPING_FAILED: "Mapping failed",
  UPSTREAM_ERROR: "Upstream error",
  UNCLASSIFIED: "Unclassified error",
});

/** Returns the code only when it is one this UI knows how to label; otherwise null. */
export function knownErrorCode(code) {
  if (typeof code !== "string") return null;
  if (code === "NONE") return null;
  return Object.prototype.hasOwnProperty.call(ERROR_CODE_LABELS, code) ? code : null;
}

/** Fixed wording for a known code, or null. Never the server's own string. */
export function errorCodeLabel(code) {
  const known = knownErrorCode(code);
  return known ? ERROR_CODE_LABELS[known] : null;
}

/**
 * The only thing the UI learns about a failure is that there is one, plus a code from a closed set.
 *
 * This is not a sanitizer and not a recogniser: no backend text is inspected, filtered or
 * transformed, so there is no pattern for a message to slip past. A boolean and a known-code
 * lookup cannot carry a Prisma invocation, a stack frame or a credential.
 */
export function feedErrorState(feed) {
  if (feed?.hasError === true) return ERROR_STATE.PRESENT;
  if (feed?.hasError === false) return ERROR_STATE.NONE;
  return hasErrorText(feed?.lastError) ? ERROR_STATE.PRESENT : ERROR_STATE.NONE;
}

// ── Counts ───────────────────────────────────────────────────────────────────

/**
 * The five counts stay five separate numbers. `errorCount` and `exceptionCount` in particular are
 * never summed and neither is called "failed products": the contract defines neither term.
 */
export const COUNT_FIELDS = Object.freeze([
  { key: "itemCount", label: "Item count", help: "Feed rows recorded for this feed (ProductFeedItem)." },
  { key: "productCount", label: "Product count", help: "Canonical Product rows linked to this feed." },
  { key: "assignmentCount", label: "Assignment count", help: "Returned by the contract; it is not a client publication state." },
  { key: "errorCount", label: "Error count", help: "Returned as stored on the feed. Not combined with the exception count." },
  { key: "exceptionCount", label: "Exception count", help: "Returned as stored on the feed. Not combined with the error count." },
]);

// ── Paths ────────────────────────────────────────────────────────────────────

export const PRODUCT_FEEDS_PATH = "/ops/admin/product-feeds";

/** Endpoints this page must never call, kept here so a test can assert on the list. */
export const FORBIDDEN_PATHS = Object.freeze(["/ops/products", "/ops/product-feeds"]);

// ── Products blocker ─────────────────────────────────────────────────────────

export const PRODUCTS_BLOCKED_SUMMARY =
  "Products cannot be loaded safely with the current backend contract because GET /ops/products performs catalog promotion writes before returning results.";

export const PRODUCTS_BLOCKED_DETAIL =
  "Products are temporarily unavailable in Network Operations because the current backend list endpoint performs catalog promotion writes during a GET request. The admin UI will not call that endpoint until it becomes a pure read.";

export const PRODUCTS_BACKEND_GAPS = Object.freeze([
  "A pure-read product list endpoint is required.",
  "Sale price is not returned by the product DTO.",
  "Category is not returned by the product DTO.",
  "Last updated is not returned.",
  "Raw payload reference is not returned.",
  "Mapper version is not returned.",
  "Supplier campaign ID is not returned.",
  "The list falls back to staged raw entities, mixing canonical products with unpromoted source rows.",
]);

// ── Operational warnings (only from facts the contract proves) ────────────────

export function feedWarnings(feed) {
  const warnings = [];
  if (!feed) return warnings;
  if (feedErrorState(feed) === ERROR_STATE.PRESENT) {
    warnings.push("The feed reports an error. The detail is not displayed because it is raw backend text.");
  }
  if (Number(feed.errorCount) > 0) warnings.push(`Error count is ${Number(feed.errorCount)}`);
  if (Number(feed.exceptionCount) > 0) warnings.push(`Exception count is ${Number(feed.exceptionCount)}`);
  if (!feed.lastSyncAt) warnings.push("No last sync timestamp is recorded for this feed");
  if (!feed.campaignSourceId) warnings.push("This feed is not linked to a campaign source");
  if (Number(feed.itemCount) > 0 && Number(feed.productCount) === 0) {
    warnings.push("Feed items exist but no canonical product is linked to this feed");
  }
  return warnings;
}
