/**
 * Coupon code / URL display safety (Phase 5 hotfix).
 *
 * A live OPTIMISE record (Atlys, supplier coupon 257864) carries a merchant redeem URL in
 * `couponCode`, so the coupon-code column rendered a full URL including a `token` query
 * parameter, and the drawer used that URL as its title.
 *
 * The backend mapper at production commit 15298635 can no longer produce this: every source it
 * reads for a code is guarded by `isCouponUrlValue` (modules/coupons/codeType.js). The stored
 * row predates that guard. This module is the frontend's own boundary, so the UI stays correct
 * for any row still carrying such a value, whatever the backend later does with it.
 *
 * Nothing here rewrites data. The stored value is not moved into another field, not "repaired",
 * and not presented as a corrected code — it is simply not rendered as a coupon code.
 */

/** True when a value would resolve as a web URL and therefore must never be shown as a code. */
export function isUrlLike(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^\/\//.test(text)) return true; // protocol-relative
  if (/^www\./i.test(text)) return true;
  return false;
}

/**
 * Query parameters whose VALUE is never rendered. Matching ignores case and the separators a
 * network may use, so `access_token`, `accessToken` and `ACCESS-TOKEN` are all covered.
 */
const SENSITIVE_PARAMS = Object.freeze([
  "token",
  "auth",
  "key",
  "signature",
  "sig",
  "secret",
  "accesstoken",
  "apikey",
]);

export const REDACTED = "[redacted]";

function normalizeParamName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** True when this parameter name carries credential-like or grant-like material. */
export function isSensitiveParam(name) {
  const normalized = normalizeParamName(name);
  if (!normalized) return false;
  return SENSITIVE_PARAMS.includes(normalized);
}

/**
 * Returns the URL with sensitive parameter VALUES replaced by a fixed marker, leaving ordinary
 * parameters (`partner=assembly`, `campaign=spring`) readable so the link stays recognisable.
 *
 * Parsing is done by hand rather than with `URL` so that the original spelling, ordering and
 * encoding of everything else survives untouched, and so a value that does not parse as a URL
 * still gets its query string redacted rather than being passed through whole.
 */
export function redactUrlSecrets(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const [base, ...queryParts] = text.split("?");
  if (!queryParts.length) return redactFragment(base);
  const query = queryParts.join("?");
  const [rawQuery, ...hashParts] = query.split("#");
  const redactedQuery = rawQuery
    .split("&")
    .map((pair) => {
      if (!pair) return pair;
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      return isSensitiveParam(name) ? `${name}=${REDACTED}` : pair;
    })
    .join("&");
  const hash = hashParts.length ? `#${hashParts.join("#")}` : "";
  return `${base}?${redactedQuery}${redactFragment(hash)}`;
}

/** A fragment can carry token material too (`#access_token=...`), so it gets the same treatment. */
function redactFragment(part) {
  const text = String(part ?? "");
  if (!text.includes("=")) return text;
  return text
    .split(/([#&])/)
    .map((piece) => {
      const eq = piece.indexOf("=");
      if (eq === -1) return piece;
      const name = piece.slice(0, eq);
      return isSensitiveParam(name) ? `${name}=${REDACTED}` : piece;
    })
    .join("");
}

/** True when any parameter of this URL had to be redacted. */
export function hasSensitiveParams(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return redactUrlSecrets(text) !== text;
}

// ── Coupon code state ────────────────────────────────────────────────────────

export const CODE_STATE = Object.freeze({
  CODE: "CODE",
  URL_SUPPLIED: "URL_SUPPLIED",
  NONE: "NONE",
});

export const URL_AS_CODE_LABEL = "URL supplied instead of code";
export const URL_AS_CODE_REVIEW = "Needs review";
export const URL_AS_CODE_HELP =
  "The network stored a URL in this record's coupon code field. It is not a redeemable code, so it is not shown here and not copied into another field. The record needs a source-data review.";

/**
 * Classifies `couponCode` for display. The raw value is returned so a caller can reason about it,
 * but no renderer puts it on screen in the URL case.
 */
export function couponCodeState(coupon) {
  const raw = coupon?.couponCode;
  if (raw == null || String(raw).trim() === "") return { state: CODE_STATE.NONE, raw: null };
  const text = String(raw).trim();
  if (isUrlLike(text)) return { state: CODE_STATE.URL_SUPPLIED, raw: text };
  return { state: CODE_STATE.CODE, raw: text };
}

/**
 * A drawer title that is always safe to render. A URL is never used, because the title is the
 * most prominent text on the panel and would otherwise show the full query string.
 */
export function safeCouponTitle(coupon) {
  if (!coupon) return "Supplier coupon";
  const { state, raw } = couponCodeState(coupon);
  if (state === CODE_STATE.CODE) return raw;

  const title = coupon.title && !isUrlLike(coupon.title) ? String(coupon.title).trim() : null;
  if (title) return title;

  const supplierCouponId = coupon.supplierCouponId ? String(coupon.supplierCouponId).trim() : null;
  if (supplierCouponId) return `Coupon ${supplierCouponId}`;

  const brand = coupon.brandName ? String(coupon.brandName).trim() : null;
  if (brand) return `${brand} — Coupon`;

  return "Supplier coupon";
}
