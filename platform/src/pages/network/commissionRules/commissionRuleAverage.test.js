import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AVERAGE_KIND, groupPageRules, summarizeRuleValues } from "./commissionRuleAverage.js";
import {
  FINANCE_READY_UNAVAILABLE,
  formatRuleValue,
  LIFECYCLE,
  REVIEW_STATE,
  needsReview,
  reviewState,
  ruleLifecycle,
  ruleWarnings,
} from "./commissionRuleContract.js";

const NOW = Date.parse("2026-09-11T00:00:00.000Z");
const PAST = "2026-01-01T00:00:00.000Z";
const FUTURE = "2027-01-01T00:00:00.000Z";

function percentRule(id, ratePercent, extra = {}) {
  return {
    id,
    supplierCampaignId: "sc-row-1",
    ratePercent,
    fixedAmount: null,
    currency: null,
    ruleStatus: "ACTIVE",
    effectiveFrom: PAST,
    effectiveUntil: null,
    projected: false,
    fieldMappingOutcome: "MAPPED",
    reviewReasons: [],
    ...extra,
  };
}

function fixedRule(id, fixedAmount, currency, extra = {}) {
  return {
    id,
    supplierCampaignId: "sc-row-1",
    ratePercent: null,
    fixedAmount,
    currency,
    ruleStatus: "ACTIVE",
    effectiveFrom: PAST,
    effectiveUntil: null,
    projected: false,
    fieldMappingOutcome: "MAPPED",
    reviewReasons: [],
    ...extra,
  };
}

describe("summarizeRuleValues", () => {
  it("averages percentages together", () => {
    const summary = summarizeRuleValues(
      [percentRule("a", 5), percentRule("b", 10), percentRule("c", 15)],
      { now: NOW },
    );
    assert.equal(summary.kind, AVERAGE_KIND.SINGLE);
    assert.equal(summary.text, "10%");
    assert.equal(summary.counted, 3);
  });

  it("averages fixed amounts of the same currency", () => {
    const summary = summarizeRuleValues([fixedRule("a", 5, "USD"), fixedRule("b", 15, "USD")], { now: NOW });
    assert.equal(summary.kind, AVERAGE_KIND.SINGLE);
    assert.equal(summary.text, "USD 10");
  });

  it("never averages two currencies into one number", () => {
    const summary = summarizeRuleValues([fixedRule("a", 5, "USD"), fixedRule("b", 15, "AED")], { now: NOW });
    assert.equal(summary.kind, AVERAGE_KIND.MIXED);
    assert.equal(summary.text, "Mixed / not directly comparable");
    assert.deepEqual(
      summary.families.map((f) => f.text),
      ["AED 15", "USD 5"],
    );
  });

  it("never averages a percentage with a fixed amount", () => {
    const summary = summarizeRuleValues([percentRule("a", 5), fixedRule("b", 10, "USD")], { now: NOW });
    assert.equal(summary.kind, AVERAGE_KIND.MIXED);
    assert.equal(summary.text, "Mixed / not directly comparable");
    assert.deepEqual(summary.families.map((f) => f.text).sort(), ["5%", "USD 10"]);
  });

  it("excludes expired and scheduled rules from the current average", () => {
    const summary = summarizeRuleValues(
      [
        percentRule("current", 10),
        percentRule("expired", 30, { ruleStatus: "EXPIRED", effectiveUntil: "2026-06-01T00:00:00.000Z" }),
        percentRule("scheduled", 50, { effectiveFrom: FUTURE }),
      ],
      { now: NOW },
    );
    assert.equal(summary.text, "10%");
    assert.equal(summary.counted, 1);
    assert.equal(summary.excluded.notCurrent, 2);
  });

  it("does not silently combine persisted and projected rules", () => {
    const summary = summarizeRuleValues(
      [percentRule("persisted", 10), percentRule("projected", 30, { projected: true })],
      { now: NOW },
    );
    assert.equal(summary.basis, "PERSISTED");
    assert.equal(summary.text, "10%");
    assert.equal(summary.counted, 1);
    assert.equal(summary.excluded.projected, 1);
  });

  it("falls back to projected rules only when nothing is persisted, and says so", () => {
    const summary = summarizeRuleValues([percentRule("projected", 30, { projected: true })], { now: NOW });
    assert.equal(summary.basis, "PROJECTED");
    assert.equal(summary.text, "30%");
  });

  it("returns no average rather than a fake zero", () => {
    const empty = summarizeRuleValues([], { now: NOW });
    assert.equal(empty.kind, AVERAGE_KIND.NONE);
    assert.equal(empty.text, null);

    const valueless = summarizeRuleValues(
      [percentRule("a", null, { ratePercent: null, fixedAmount: null })],
      { now: NOW },
    );
    assert.equal(valueless.kind, AVERAGE_KIND.NONE);
    assert.equal(valueless.text, null);
    assert.equal(valueless.excluded.noComparableValue, 1);
  });

  it("keeps an explicit zero percent rule as a real value", () => {
    const summary = summarizeRuleValues([percentRule("a", 0), percentRule("b", 10)], { now: NOW });
    assert.equal(summary.text, "5%");
    assert.equal(summary.counted, 2);
  });

  it("excludes a fixed amount with no currency from any average", () => {
    const summary = summarizeRuleValues([fixedRule("a", 12, null), fixedRule("b", 8, "USD")], { now: NOW });
    assert.equal(summary.kind, AVERAGE_KIND.SINGLE);
    assert.equal(summary.text, "USD 8");
    assert.equal(summary.excluded.noComparableValue, 1);
  });
});

describe("groupPageRules", () => {
  const groupA = [
    { ...percentRule("a1", 10), supplierCampaignId: "row-a" },
    { ...percentRule("a2", 20), supplierCampaignId: "row-a" },
  ];
  const groupB = [
    { ...percentRule("b1", 6), supplierCampaignId: "row-b" },
    { ...percentRule("b2", 8), supplierCampaignId: "row-b" },
  ];

  it("summarizes groups that are whole inside the page", () => {
    const groups = groupPageRules([...groupA, ...groupB], { page: 1, hasMore: false, now: NOW });
    assert.equal(groups.get("row:row-a").complete, true);
    assert.equal(groups.get("row:row-a").summary.text, "15%");
    assert.equal(groups.get("row:row-b").summary.text, "7%");
  });

  it("refuses an average for a group that continues on the next page", () => {
    const groups = groupPageRules([...groupA, ...groupB], { page: 1, hasMore: true, now: NOW });
    assert.equal(groups.get("row:row-a").complete, true);
    assert.equal(groups.get("row:row-b").complete, false);
    assert.equal(groups.get("row:row-b").summary, null);
    assert.match(groups.get("row:row-b").incompleteReason, /next page/);
  });

  it("refuses an average for a group that started on the previous page", () => {
    const groups = groupPageRules([...groupA, ...groupB], { page: 2, hasMore: false, now: NOW });
    assert.equal(groups.get("row:row-a").complete, false);
    assert.match(groups.get("row:row-a").incompleteReason, /previous page/);
    assert.equal(groups.get("row:row-b").complete, true);
  });

  it("groups by the SupplierCampaign row, never by the supplier-side campaign id", () => {
    const rows = [
      { ...percentRule("x", 10), supplierCampaignId: "row-1", sourceCampaignId: "56577" },
      { ...percentRule("y", 30), supplierCampaignId: "row-2", sourceCampaignId: "56577" },
    ];
    const groups = groupPageRules(rows, { page: 1, hasMore: false, now: NOW });
    assert.equal(groups.size, 2);
    assert.equal(groups.get("row:row-1").summary.text, "10%");
    assert.equal(groups.get("row:row-2").summary.text, "30%");
  });
});

describe("rule value and state helpers", () => {
  it("keeps unit semantics on every value", () => {
    assert.equal(formatRuleValue(percentRule("a", 9)).text, "9%");
    assert.equal(formatRuleValue(fixedRule("b", 200, "INR")).text, "INR 200");
    const noCurrency = formatRuleValue(fixedRule("c", 25, null));
    assert.equal(noCurrency.text, "25");
    assert.equal(noCurrency.currencyMissing, true);
    assert.equal(formatRuleValue({ ratePercent: null, fixedAmount: null }).available, false);
  });

  it("refines but never contradicts the backend rule status", () => {
    assert.equal(ruleLifecycle(percentRule("a", 5), NOW), LIFECYCLE.CURRENT);
    assert.equal(ruleLifecycle(percentRule("b", 5, { effectiveFrom: FUTURE }), NOW), LIFECYCLE.SCHEDULED);
    assert.equal(ruleLifecycle(percentRule("c", 5, { ruleStatus: "EXPIRED" }), NOW), LIFECYCLE.EXPIRED);
    assert.equal(ruleLifecycle({ ruleStatus: null }, NOW), LIFECYCLE.UNKNOWN);
  });

  it("reports the backend review state without calling it finance readiness", () => {
    const flagged = percentRule("a", 5, { fieldMappingOutcome: "REVIEW_REQUIRED", reviewReasons: ["payout_basis_unknown"] });
    assert.equal(ruleLifecycle(flagged, NOW), LIFECYCLE.CURRENT);
    assert.equal(reviewState(flagged), REVIEW_STATE.REVIEW_REQUIRED);
    assert.equal(needsReview(flagged), true);
    assert.equal(reviewState(percentRule("b", 5)), REVIEW_STATE.NO_REVIEW_FLAGGED);
    assert.equal(reviewState({ fieldMappingOutcome: null, reviewReasons: [] }), REVIEW_STATE.UNKNOWN);
  });
});

describe("finance readiness is never derived", () => {
  it("exposes finance readiness only as unavailable", () => {
    assert.equal(FINANCE_READY_UNAVAILABLE, "Not available (backend)");
  });

  it("offers no function that computes a finance-ready verdict", async () => {
    const contract = await import("./commissionRuleContract.js");
    assert.equal(contract.financeReadiness, undefined);
    assert.equal(contract.READINESS, undefined);
    assert.equal(contract.FINANCE_READY, undefined);
  });

  it("a healthy mapping outcome does not become finance ready", () => {
    const rule = percentRule("a", 5, { fieldMappingOutcome: "MAPPED", mappingStatus: "MAPPED" });
    assert.equal(reviewState(rule), REVIEW_STATE.NO_REVIEW_FLAGGED);
    assert.equal(needsReview(rule), false);
    assert.ok(!ruleWarnings(rule).some((w) => /finance/i.test(w)));
  });

  it("having no review reasons does not become finance ready", () => {
    const rule = percentRule("a", 5, { reviewReasons: [] });
    assert.equal(needsReview(rule), false);
    assert.equal(reviewState(rule), REVIEW_STATE.NO_REVIEW_FLAGGED);
  });

  it("an active persisted rule does not become finance ready", () => {
    const rule = percentRule("a", 5, { ruleStatus: "ACTIVE", projected: false });
    assert.equal(ruleLifecycle(rule, NOW), LIFECYCLE.CURRENT);
    assert.equal(rule.projected, false);
    assert.ok(!ruleWarnings(rule).some((w) => /finance/i.test(w)));
  });

  it("keeps the review warning free of finance-readiness wording", () => {
    const flagged = percentRule("a", 5, { fieldMappingOutcome: "REVIEW_REQUIRED", reviewReasons: ["payout_basis_unknown"] });
    const warnings = ruleWarnings(flagged);
    assert.ok(warnings.includes("Flagged for review by the backend"));
    assert.ok(!warnings.some((w) => /finance/i.test(w)));
  });
});
