/**
 * Partnerize supplier tracking-link work queue — frontend view of the backend contract.
 *
 *   GET /supplier-campaigns/tracking-links/queue        tracking:read
 *   PUT /supplier-campaigns/:id/tracking-link           tracking:manage
 *   PUT /supplier-campaigns/:id/tracking-link/state     tracking:manage
 *
 * Three URL concepts stay separate here exactly as they do in the backend:
 *
 *   destinationUrl   advertiser/merchant landing page. Reference only. It is NEVER a supplier
 *                    tracking link, is never prefilled into the paste field, and is never
 *                    offered as a fallback.
 *   supplier link    the publisher-attributed link the operator generates in the supplier
 *                    portal. The queue exposes its HOST only (supplierTrackingUrlHost); the
 *                    full attributed URL is never sent to the browser.
 *   MBO/client link  a separate downstream layer that this page does not touch.
 *
 * Partnerize does not mint a tracking link when a campaign is joined or approved. The publisher
 * creates one manually: Tracking -> Create Tracking Link -> select campaign -> generate. There is
 * no evidenced Partnerize API for creating or reading tracking links, so this queue is the
 * acquisition path and every link it stores is provenance MANUAL_ADMIN.
 */

export const SUPPLIER_TRACKING_QUEUE_PATH = "/supplier-campaigns/tracking-links/queue";

export const supplierTrackingLinkPath = (id) => `/supplier-campaigns/${encodeURIComponent(id)}/tracking-link`;
export const supplierTrackingLinkStatePath = (id) => `${supplierTrackingLinkPath(id)}/state`;

export const TRACKING_LINK_STATE = Object.freeze({
  NOT_GENERATED: "TRACKING_LINK_NOT_GENERATED",
  AVAILABLE: "TRACKING_LINK_AVAILABLE",
  NEEDS_REVIEW: "TRACKING_LINK_NEEDS_REVIEW",
  REVOKED: "TRACKING_LINK_REVOKED",
});

export const TRACKING_LINK_STATE_LABELS = Object.freeze({
  TRACKING_LINK_NOT_GENERATED: "Tracking link not generated",
  TRACKING_LINK_AVAILABLE: "Tracking link available",
  TRACKING_LINK_NEEDS_REVIEW: "Needs review",
  TRACKING_LINK_REVOKED: "Revoked",
});

export const TRACKING_LINK_STATE_TONES = Object.freeze({
  TRACKING_LINK_NOT_GENERATED: "warn",
  TRACKING_LINK_AVAILABLE: "ok",
  TRACKING_LINK_NEEDS_REVIEW: "warn",
  TRACKING_LINK_REVOKED: "bad",
});

export const PROVENANCE_LABELS = Object.freeze({
  MANUAL_ADMIN: "Manual (admin)",
  SUPPLIER_API: "Supplier API",
});

/** States an operator may set directly. AVAILABLE is only reachable by storing a link. */
export const OPERATOR_SETTABLE_STATES = Object.freeze([
  TRACKING_LINK_STATE.NEEDS_REVIEW,
  TRACKING_LINK_STATE.REVOKED,
]);

export const QUEUE_STATE_OPTIONS = Object.freeze([
  { value: TRACKING_LINK_STATE.NOT_GENERATED, label: TRACKING_LINK_STATE_LABELS.TRACKING_LINK_NOT_GENERATED },
  { value: TRACKING_LINK_STATE.AVAILABLE, label: TRACKING_LINK_STATE_LABELS.TRACKING_LINK_AVAILABLE },
  { value: TRACKING_LINK_STATE.NEEDS_REVIEW, label: TRACKING_LINK_STATE_LABELS.TRACKING_LINK_NEEDS_REVIEW },
  { value: TRACKING_LINK_STATE.REVOKED, label: TRACKING_LINK_STATE_LABELS.TRACKING_LINK_REVOKED },
]);

/**
 * The operator instructions shown in the drawer. They describe the supplier portal steps, which
 * are the only way to obtain a Partnerize tracking link today.
 */
export const PARTNERIZE_GENERATION_STEPS = Object.freeze([
  "Open the Partnerize portal and go to Tracking → Create Tracking Link.",
  "Select this campaign, then generate the link.",
  "Copy the generated tracking link and paste it below.",
]);

export const DESTINATION_REFERENCE_HELP =
  "Advertiser landing page, shown for reference only. It is not a tracking link and must never be pasted below.";

/** Client-side mirror of the backend validator. The backend remains the authority. */
export const PARTNERIZE_TRACKING_HOSTS = Object.freeze(["prf.hn"]);

export function describeState(state) {
  return TRACKING_LINK_STATE_LABELS[state] ?? state ?? "Unknown";
}

export function stateTone(state) {
  return TRACKING_LINK_STATE_TONES[state] ?? "muted";
}

export function describeProvenance(provenance) {
  if (!provenance) return "—";
  return PROVENANCE_LABELS[provenance] ?? provenance;
}

/**
 * Local pre-check so an obviously wrong paste is caught before a round trip. It never widens what
 * the backend accepts: anything this passes is still validated server-side.
 *
 * @returns {string|null} an operator-facing message, or null when the value looks acceptable.
 */
export function preValidateTrackingUrl(value, { destinationUrl = null } = {}) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "Paste the tracking link generated in the supplier portal.";

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Enter a full URL, including https://";
  }
  if (parsed.protocol !== "https:") return "The tracking link must start with https://";
  if (parsed.username || parsed.password) return "The tracking link must not contain a username or password.";

  const host = parsed.hostname.toLowerCase();
  const allowed = PARTNERIZE_TRACKING_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
  if (!allowed) {
    const destinationHost = safeHost(destinationUrl);
    if (destinationHost && host === destinationHost) {
      return "That is the advertiser landing page, not a tracking link. Generate a tracking link in the supplier portal first.";
    }
    return `This does not look like a supplier tracking link. Expected a ${PARTNERIZE_TRACKING_HOSTS.join(" or ")} address.`;
  }
  return null;
}

export function safeHost(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Map the queue array to view rows.
 *
 * The backend envelope is `{ ok, data: [...], pagination }`, and usePagedQuery exposes that array
 * as `rows` — it has no `data` key of its own. Reading the wrong key yields undefined, and every
 * successful response then renders as "Nothing to action". This helper makes that path testable.
 */
export function selectQueueRows(queueRows) {
  if (!Array.isArray(queueRows)) return [];
  return queueRows.filter((row) => row && typeof row === "object").map(toQueueRow);
}

/** Normalise a queue row for display. Never invents a link the backend did not report. */
export function toQueueRow(row = {}) {
  return {
    id: row.id ?? null,
    supplier: row.supplier ?? null,
    supplierCampaignId: row.supplierCampaignId ?? null,
    campaignName: row.campaignName ?? null,
    brandName: row.merchantNameRaw ?? null,
    campaignStatus: row.campaignStatus ?? null,
    participationStatus: row.participationStatus ?? null,
    isJoined: Boolean(row.isJoined),
    destinationUrl: row.destinationUrl ?? null,
    hasSupplierTrackingUrl: Boolean(row.hasSupplierTrackingUrl),
    supplierTrackingUrlHost: row.supplierTrackingUrlHost ?? null,
    state: row.supplierTrackingLinkState ?? TRACKING_LINK_STATE.NOT_GENERATED,
    provenance: row.supplierTrackingLinkProvenance ?? null,
    updatedAt: row.supplierTrackingLinkUpdatedAt ?? row.updatedAt ?? null,
  };
}
