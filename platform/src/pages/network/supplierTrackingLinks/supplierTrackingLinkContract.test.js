import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DESTINATION_REFERENCE_HELP,
  OPERATOR_SETTABLE_STATES,
  PARTNERIZE_GENERATION_STEPS,
  PARTNERIZE_TRACKING_HOSTS,
  SUPPLIER_TRACKING_QUEUE_PATH,
  TRACKING_LINK_STATE,
  describeProvenance,
  describeState,
  preValidateTrackingUrl,
  safeHost,
  stateTone,
  supplierTrackingLinkPath,
  supplierTrackingLinkStatePath,
  toQueueRow,
} from "./supplierTrackingLinkContract.js";

const LINK = "https://prf.hn/click/camref:1101lAbCd";
const DESTINATION = "https://www.merchant-example.com/spring";

describe("supplier tracking link contract", () => {
  it("mirrors the backend paths without inventing one", () => {
    assert.equal(SUPPLIER_TRACKING_QUEUE_PATH, "/supplier-campaigns/tracking-links/queue");
    assert.equal(supplierTrackingLinkPath("abc"), "/supplier-campaigns/abc/tracking-link");
    assert.equal(supplierTrackingLinkStatePath("abc"), "/supplier-campaigns/abc/tracking-link/state");
  });

  it("encodes the campaign id into the path", () => {
    assert.equal(supplierTrackingLinkPath("a/b?c"), "/supplier-campaigns/a%2Fb%3Fc/tracking-link");
  });

  it("carries all four states with distinct labels", () => {
    const states = Object.values(TRACKING_LINK_STATE);
    assert.equal(states.length, 4);
    const labels = new Set(states.map(describeState));
    assert.equal(labels.size, 4);
    assert.equal(describeState(TRACKING_LINK_STATE.NOT_GENERATED), "Tracking link not generated");
  });

  it("gives the not-generated state a visible work-queue tone", () => {
    assert.equal(stateTone(TRACKING_LINK_STATE.NOT_GENERATED), "warn");
    assert.equal(stateTone(TRACKING_LINK_STATE.AVAILABLE), "ok");
    assert.equal(stateTone(TRACKING_LINK_STATE.REVOKED), "bad");
    assert.equal(stateTone("SOMETHING_ELSE"), "muted");
  });

  it("does not offer AVAILABLE as an operator-settable state", () => {
    assert.deepEqual([...OPERATOR_SETTABLE_STATES], [
      TRACKING_LINK_STATE.NEEDS_REVIEW,
      TRACKING_LINK_STATE.REVOKED,
    ]);
    assert.ok(!OPERATOR_SETTABLE_STATES.includes(TRACKING_LINK_STATE.AVAILABLE));
  });

  it("labels provenance and never implies an API link source is in use", () => {
    assert.equal(describeProvenance("MANUAL_ADMIN"), "Manual (admin)");
    assert.equal(describeProvenance(null), "—");
  });
});

describe("paste validation", () => {
  it("accepts an evidenced supplier tracking link", () => {
    assert.equal(preValidateTrackingUrl(LINK), null);
    assert.equal(preValidateTrackingUrl(`  ${LINK}  `), null);
    assert.equal(preValidateTrackingUrl("https://uk.prf.hn/click/camref:1"), null);
  });

  it("rejects the destination URL with an explanation naming the real fix", () => {
    const message = preValidateTrackingUrl(DESTINATION, { destinationUrl: DESTINATION });
    assert.match(message, /advertiser landing page/i);
    assert.match(message, /generate a tracking link/i);
  });

  it("rejects non-https schemes", () => {
    for (const value of ["http://prf.hn/click", "javascript:alert(1)", "data:text/html,x", "ftp://prf.hn/x"]) {
      assert.ok(preValidateTrackingUrl(value), value);
    }
  });

  it("rejects a host that only looks like the tracking host", () => {
    for (const value of ["https://prf.hn.evil.com/click", "https://notprf.hn/click", "https://evilprf.hn/x"]) {
      assert.ok(preValidateTrackingUrl(value), value);
    }
  });

  it("rejects embedded credentials and empty input", () => {
    assert.ok(preValidateTrackingUrl("https://u:p@prf.hn/click"));
    assert.ok(preValidateTrackingUrl(""));
    assert.ok(preValidateTrackingUrl("   "));
    assert.ok(preValidateTrackingUrl("prf.hn/click"));
  });

  it("only mirrors the backend allowlist, never widens it", () => {
    assert.deepEqual([...PARTNERIZE_TRACKING_HOSTS], ["prf.hn"]);
  });

  it("safeHost never throws on junk", () => {
    assert.equal(safeHost("nonsense"), null);
    assert.equal(safeHost(null), null);
    assert.equal(safeHost(LINK), "prf.hn");
  });
});

describe("queue row mapping", () => {
  it("keeps destination and supplier link strictly separate", () => {
    const row = toQueueRow({
      id: "r1",
      supplier: "PARTNERIZE",
      supplierCampaignId: "5001",
      campaignName: "Example",
      destinationUrl: DESTINATION,
      hasSupplierTrackingUrl: false,
      supplierTrackingUrlHost: null,
      supplierTrackingLinkState: TRACKING_LINK_STATE.NOT_GENERATED,
    });
    assert.equal(row.destinationUrl, DESTINATION);
    assert.equal(row.hasSupplierTrackingUrl, false);
    assert.equal(row.supplierTrackingUrlHost, null);
    // The mapper must never derive a link from the destination.
    assert.ok(!Object.values(row).includes(DESTINATION.replace("www.", "")));
  });

  it("defaults an unknown state to NOT_GENERATED rather than assuming a link exists", () => {
    assert.equal(toQueueRow({}).state, TRACKING_LINK_STATE.NOT_GENERATED);
    assert.equal(toQueueRow({}).hasSupplierTrackingUrl, false);
  });

  it("surfaces the host only, never a full attributed URL", () => {
    const row = toQueueRow({ supplierTrackingUrlHost: "prf.hn", hasSupplierTrackingUrl: true });
    assert.equal(row.supplierTrackingUrlHost, "prf.hn");
    assert.equal(row.trackingUrl, undefined);
    assert.equal(row.supplierTrackingUrl, undefined);
  });
});

describe("drawer safety", () => {
  const DRAWER = readFileSync(new URL("./SupplierTrackingLinkDrawer.jsx", import.meta.url), "utf8");

  it("never prefills the paste field with the destination URL", () => {
    assert.ok(!/setValue\(\s*row\??\.?destinationUrl/.test(DRAWER));
    assert.ok(!/value=\{[^}]*destinationUrl/.test(DRAWER));
    assert.ok(DRAWER.includes('setValue("")'), "the field must reset to empty on open");
  });

  it("shows the destination under its own reference-only label", () => {
    assert.ok(DRAWER.includes("Destination URL (reference only)"));
    assert.ok(DRAWER.includes("DESTINATION_REFERENCE_HELP"));
    assert.match(DESTINATION_REFERENCE_HELP, /not a tracking link/i);
  });

  it("shows the portal generation steps", () => {
    assert.equal(PARTNERIZE_GENERATION_STEPS.length, 3);
    assert.match(PARTNERIZE_GENERATION_STEPS[0], /Tracking → Create Tracking Link/);
  });

  it("keeps campaign identity read-only — no campaign selector is rendered", () => {
    assert.ok(!/<select/i.test(DRAWER));
    assert.ok(!/supplierCampaignId:\s*[^,\n]*state/i.test(DRAWER));
  });
});

describe("page wiring", () => {
  const PAGE = readFileSync(new URL("./SupplierTrackingLinksPage.jsx", import.meta.url), "utf8");
  const ROUTES = readFileSync(new URL("../../../routes/AppRoutes.jsx", import.meta.url), "utf8");
  const NAV = readFileSync(new URL("../../../config/navigation.js", import.meta.url), "utf8");

  it("gates the save action on tracking:manage", () => {
    assert.ok(PAGE.includes("PERMISSIONS.TRACKING_MANAGE"));
    assert.ok(PAGE.includes("canManage"));
  });

  it("defaults the queue to Partnerize campaigns needing a link", () => {
    assert.ok(PAGE.includes('supplier: "PARTNERIZE"'));
    assert.ok(PAGE.includes("TRACKING_LINK_STATE.NOT_GENERATED"));
  });

  it("renders the badge the brief requires for work-queue rows", () => {
    assert.ok(PAGE.includes("StateBadge"));
    assert.ok(PAGE.includes("Tracking → Create Tracking Link"));
  });

  it("is routed and navigable under Network Operations with tracking:read", () => {
    assert.ok(ROUTES.includes('path="network/supplier-tracking-links"'));
    assert.ok(ROUTES.includes("SupplierTrackingLinksPage"));
    assert.ok(NAV.includes('/network/supplier-tracking-links'));
    assert.ok(NAV.includes("Supplier Tracking Links"));
  });

  it("does not render the full stored tracking URL anywhere", () => {
    assert.ok(!PAGE.includes("row.trackingUrl"));
    assert.ok(!PAGE.includes("supplierTrackingUrl}"));
  });
});
