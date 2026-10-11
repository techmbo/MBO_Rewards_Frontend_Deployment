import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATTRIBUTION_UNAVAILABLE,
  BACKEND_UNAVAILABLE_FIELDS,
  COUPON_LIFECYCLE,
  DISCOUNT_KIND,
  buildCouponListParams,
  couponLifecycle,
  couponReadableText,
  couponWarnings,
  formatDiscount,
  lifecycleConflict,
  toCouponView,
} from "./couponContract.js";

const NOW = Date.parse("2026-09-11T00:00:00.000Z");
const PAST = "2026-01-01T00:00:00.000Z";
const GONE = "2026-06-01T00:00:00.000Z";
const FUTURE = "2027-01-01T00:00:00.000Z";

const coupon = (extra = {}) => ({
  id: "sc-1",
  couponCode: "SAVE10",
  couponStatus: "ACTIVE",
  couponStartDate: PAST,
  couponEndDate: null,
  discountValue: "10%",
  discountType: "PERCENT",
  campaign: { id: "row-1", supplierCampaignId: "56577" },
  rawPayloadId: "rp-1",
  mappingStatus: "MAPPED",
  ...extra,
});

describe("formatDiscount", () => {
  it("keeps a percentage as a percentage", () => {
    const d = formatDiscount(coupon({ discountValue: "10%" }));
    assert.equal(d.kind, DISCOUNT_KIND.PERCENT);
    assert.equal(d.text, "10%");
    assert.equal(d.unitKnown, true);
  });

  it("keeps a currency amount as an amount and never as a rate", () => {
    for (const value of ["USD 5", "5 USD", "AED 25"]) {
      const d = formatDiscount(coupon({ discountValue: value, discountType: "FIXED" }));
      assert.equal(d.kind, DISCOUNT_KIND.AMOUNT, value);
      assert.equal(d.text, value);
      assert.ok(!d.text.includes("%"), `${value} gained a percent sign`);
    }
  });

  it("never converts a fixed amount into a percentage", () => {
    const d = formatDiscount(coupon({ discountValue: "USD 10", discountType: "FIXED" }));
    assert.equal(d.text, "USD 10");
    assert.notEqual(d.text, "10%");
    assert.notEqual(d.kind, DISCOUNT_KIND.PERCENT);
  });

  it("passes promotional text through untouched", () => {
    for (const value of ["Free Shipping", "Up to 20%", "Buy one get one", "Extra 15% on sale items"]) {
      const d = formatDiscount(coupon({ discountValue: value }));
      assert.equal(d.kind, DISCOUNT_KIND.TEXT);
      assert.equal(d.text, value);
    }
  });

  it("flags a bare number rather than assuming a percentage", () => {
    const d = formatDiscount(coupon({ discountValue: "15", discountType: "UNKNOWN" }));
    assert.equal(d.unitKnown, false);
    assert.equal(d.text, "15");
    assert.ok(!d.text.includes("%"));
  });

  it("reports a missing discount as none, never as zero", () => {
    for (const value of [null, undefined, "", "   "]) {
      const d = formatDiscount(coupon({ discountValue: value }));
      assert.equal(d.kind, DISCOUNT_KIND.NONE);
      assert.equal(d.text, null);
    }
  });
});

describe("couponLifecycle", () => {
  it("classifies current, scheduled and expired from the dates", () => {
    assert.equal(couponLifecycle(coupon(), NOW), COUPON_LIFECYCLE.CURRENT);
    assert.equal(couponLifecycle(coupon({ couponStartDate: FUTURE }), NOW), COUPON_LIFECYCLE.SCHEDULED);
    assert.equal(couponLifecycle(coupon({ couponEndDate: GONE }), NOW), COUPON_LIFECYCLE.EXPIRED);
  });

  it("says so when there are no dates rather than guessing", () => {
    assert.equal(
      couponLifecycle(coupon({ couponStartDate: null, couponEndDate: null }), NOW),
      COUPON_LIFECYCLE.UNKNOWN,
    );
  });

  it("never overwrites the network status", () => {
    const row = coupon({ couponStatus: "ACTIVE", couponEndDate: GONE });
    assert.equal(row.couponStatus, "ACTIVE");
    assert.equal(couponLifecycle(row, NOW), COUPON_LIFECYCLE.EXPIRED);
  });

  it("reports a status and date disagreement instead of resolving it", () => {
    assert.match(lifecycleConflict(coupon({ couponEndDate: GONE }), NOW), /ACTIVE while its end date has passed/);
    assert.match(lifecycleConflict(coupon({ couponStartDate: FUTURE }), NOW), /start date is still in the future/);
    assert.match(
      lifecycleConflict(coupon({ couponStatus: "EXPIRED" }), NOW),
      /EXPIRED while its dates are still current/,
    );
    assert.equal(lifecycleConflict(coupon(), NOW), null);
  });
});

describe("coupon contract guards", () => {
  it("reports attribution confirmation as unavailable and never derives it", () => {
    assert.equal(ATTRIBUTION_UNAVAILABLE, "Not available (backend)");
    assert.ok(BACKEND_UNAVAILABLE_FIELDS.includes("attributionConfirmation"));
    // A coupon code alone must never appear as an attribution signal in the contract module.
    const warnings = couponWarnings(coupon(), NOW);
    assert.ok(!warnings.some((w) => /attribution/i.test(w)));
  });

  it("sends only server-supported filter params", () => {
    const params = buildCouponListParams({
      search: " SAVE ",
      networkSource: "OPTIMISE",
      couponStatus: "ACTIVE",
      couponType: "CODE",
      supplierCampaignId: "row-1",
      exclusive: "true",
      country: "AE",
    });
    assert.deepEqual(params, {
      search: "SAVE",
      networkSource: "OPTIMISE",
      couponStatus: "ACTIVE",
      couponType: "CODE",
      supplierCampaignId: "row-1",
    });
  });

  it("keeps the supplier-side id apart from the MBO row id", () => {
    const view = toCouponView({
      id: "sc-1",
      supplierCampaignId: "row-1",
      campaign: { id: "row-1", supplierCampaignId: "56577", campaignName: "Link Tracking (SG)" },
      couponCode: "SAVE10",
    });
    assert.equal(view.supplierCampaignId, "row-1");
    assert.equal(view.campaign.supplierCampaignId, "56577");
    assert.notEqual(view.supplierCampaignId, view.campaign.supplierCampaignId);
  });

  it("drops payload bodies and any field outside the allowlist", () => {
    const view = toCouponView({
      id: "sc-1",
      couponCode: "SAVE10",
      rawPayload: { token: "DECOY" },
      normalizedPayload: { apiKey: "DECOY" },
      somethingElse: "DECOY",
    });
    assert.equal(view.rawPayload, undefined);
    assert.equal(view.normalizedPayload, undefined);
    assert.equal(view.somethingElse, undefined);
  });

  it("renders supplier HTML descriptions as readable text", () => {
    assert.equal(couponReadableText("<p>Save <strong>10%</strong> today</p>"), "Save 10% today");
    assert.equal(couponReadableText("<script>alert(1)</script>"), null);
    assert.equal(couponReadableText(null), null);
  });

  it("warns only from facts the contract proves", () => {
    const bare = couponWarnings(
      { id: "x", couponCode: null, couponLink: null, discountValue: null, campaign: null, rawPayloadId: null },
      NOW,
    );
    assert.ok(bare.includes("No SupplierCampaign linkage on this coupon"));
    assert.ok(bare.includes("Neither a coupon code nor a coupon link is recorded"));
    assert.ok(bare.includes("No discount value recorded"));
    assert.ok(bare.includes("No raw payload reference on this record"));
    assert.deepEqual(couponWarnings(coupon(), NOW), []);
  });
});
