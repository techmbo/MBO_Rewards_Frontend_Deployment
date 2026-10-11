import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BACKEND_UNAVAILABLE_FIELDS,
  CLIENT_LINK_FIELDS,
  SLUG_DISCLAIMER,
  SLUG_STATE,
  URL_LABELS,
  attributionParameter,
  attributionSummary,
  buildRegistryParams,
  deeplinkSupport,
  supplierSlugState,
  toClientLinkView,
  toTrackingLinkView,
  trackingWarnings,
} from "./trackingLinkContract.js";

const row = (extra = {}) => ({
  id: "row-A",
  networkSource: "OPTIMISE",
  supplier: "OPTIMISE",
  brandName: "Ferns N Petals",
  campaignName: "Link Tracking (SG)",
  supplierLinkId: "56577",
  linkType: "Deeplink",
  supplierTrackingLink: "https://track.example.test/click?c=1",
  landingPageUrl: "https://brand.example.test/",
  supplierDeeplinkUrl: "https://track.example.test/click?c=1",
  mboTrackingLink: "https://mbo.example.test/r/ferns/abc",
  deeplinkSupported: "YES",
  mboAssignmentStatus: "ASSIGNED",
  linkStatus: "ACTIVE",
  mappingStatus: "MAPPED",
  attributionParameter: "UID",
  attributionParamSummary: "UID=client",
  ...extra,
});

describe("supplier URL semantics", () => {
  it("labels the resolved supplier link as tracking or destination", () => {
    assert.equal(URL_LABELS.supplierTrackingLink, "Supplier link (tracking or destination)");
    assert.equal(URL_LABELS.landingPageUrl, "Destination / landing URL");
    assert.notEqual(URL_LABELS.supplierTrackingLink, "Supplier Tracking URL");
  });

  it("keeps every URL under its own key", () => {
    const view = toTrackingLinkView(row());
    assert.equal(view.supplierTrackingLink, "https://track.example.test/click?c=1");
    assert.equal(view.landingPageUrl, "https://brand.example.test/");
    assert.equal(view.mboTrackingLink, "https://mbo.example.test/r/ferns/abc");
    assert.notEqual(view.supplierTrackingLink, view.landingPageUrl);
  });

  it("names the deeplink tracking URL as a contract gap rather than inventing one", () => {
    assert.ok(BACKEND_UNAVAILABLE_FIELDS.includes("supplierDeeplinkTrackingUrl"));
    assert.ok(BACKEND_UNAVAILABLE_FIELDS.includes("campaignSourceId"));
    assert.ok(BACKEND_UNAVAILABLE_FIELDS.includes("canonicalCampaignId"));
  });
});

describe("deeplink support", () => {
  it("treats support and a deeplink URL as separate facts", () => {
    assert.deepEqual(deeplinkSupport(row({ deeplinkSupported: "YES" })), { supported: true, label: "Yes" });
    assert.deepEqual(deeplinkSupport(row({ deeplinkSupported: "NO" })), { supported: false, label: "No" });
    assert.deepEqual(deeplinkSupport(row({ deeplinkSupported: null })), { supported: null, label: "Not stated" });
  });

  it("warns when deeplinking is supported but no deeplink URL is returned", () => {
    const warnings = trackingWarnings(row({ deeplinkSupported: "YES", supplierDeeplinkUrl: null }));
    assert.ok(warnings.includes("Deeplink is supported but no deeplink URL is returned"));
  });
});

describe("supplier-level MBO slug", () => {
  it("reports slug generation, never assignment", () => {
    assert.equal(supplierSlugState(row()), SLUG_STATE.GENERATED);
    assert.equal(supplierSlugState(row({ mboTrackingLink: null, mboAssignmentStatus: "UNASSIGNED" })), SLUG_STATE.NOT_GENERATED);
    assert.equal(supplierSlugState({ mboAssignmentStatus: null, mboTrackingLink: null }), SLUG_STATE.UNKNOWN);
  });

  it("carries a disclaimer that no client assignment is implied", () => {
    assert.equal(SLUG_DISCLAIMER, "This does not mean a client campaign assignment exists.");
  });
});

describe("attribution", () => {
  it("shows a confirmed parameter name only", () => {
    assert.deepEqual(attributionParameter(row()), { name: "UID", confirmed: true });
    assert.equal(attributionSummary(row()), "UID=client");
  });

  it("never invents a parameter for an unconfirmed network", () => {
    const unconfirmed = row({ attributionParameter: "VERIFY_LIVE", attributionParamSummary: "VERIFY_LIVE" });
    assert.deepEqual(attributionParameter(unconfirmed), { name: null, confirmed: false });
    assert.equal(attributionSummary(unconfirmed), null);
    assert.ok(trackingWarnings(unconfirmed).includes("Attribution parameter is unconfirmed for this network"));
  });
});

describe("registry params and client links", () => {
  it("sends only the two server-applied params", () => {
    const params = buildRegistryParams({ network: "OPTIMISE", q: " 56577 ", linkStatus: "ACTIVE", linkType: "Deeplink" });
    assert.deepEqual(params, { network: "OPTIMISE", q: "56577" });
  });

  it("keeps client links a separate object and drops the raw token", () => {
    const view = toClientLinkView({
      id: "tl-1",
      assignmentId: "as-1",
      campaignSourceId: "cs-1",
      slug: "ferns-client",
      subId: "SECRETTOKEN",
      token: "SECRETTOKEN",
      mboTrackingUrl: "https://mbo.example.test/r/ferns-client/xyz",
      supplierTrackingUrl: "https://track.example.test/click?c=1",
      status: "ACTIVE",
      isPrimary: true,
      client: { id: "cl-1", name: "Client One" },
      campaign: { id: "cc-1", displayName: "Link Tracking (SG)" },
    });
    assert.equal(view.subId, undefined);
    assert.equal(view.token, undefined);
    assert.equal(view.clientName, "Client One");
    assert.equal(view.campaignId, "cc-1");
    assert.ok(CLIENT_LINK_FIELDS.includes("mboTrackingUrl"));
    assert.ok(!CLIENT_LINK_FIELDS.includes("subId"));
  });
});
