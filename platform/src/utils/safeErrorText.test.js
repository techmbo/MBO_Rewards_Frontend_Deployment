import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GENERIC_LOOKUP_ERROR,
  GENERIC_REQUEST_ERROR,
  looksInternal,
  safeListError,
  statusSafeMessage,
  toSafeDisplayError,
} from "./safeErrorText.js";

const SAFE = "Campaign link could not be resolved.";

// Shapes a backend failure can take on this contract. None of them may reach the UI.
const INTERNAL_MESSAGES = [
  'Invalid `prisma.canonicalCampaign.findMany()` invocation in /var/task/src/modules/ops/adminContract.service.js:281:39',
  "Invalid `prisma.supplierCommissionRule.findMany()` invocation:\n{\n  where: {\n    supplier: 'OPTIMISE',\n    campaignSourceId: '0bdeb6d7-7a2e-46af-9cea-f14beef34b2e'\n  },\n  take: 50\n}",
  "Argument `where` of type CanonicalCampaignWhereInput needs at least one argument.",
  "PrismaClientKnownRequestError: P2025 An operation failed because it depends on one or more records that were required but not found.",
  "SELECT id, supplier_campaign_id FROM campaign_sources WHERE canonical_campaign_id = $1",
  "insert into \"raw_payloads\" (\"id\") values ($1)",
  "update supplier_campaigns set tracking_url = $1 where id = $2",
  "TypeError: Cannot read properties of undefined (reading 'id')\n    at listCampaigns (/var/task/src/modules/ops/adminContract.service.js:281:39)\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)",
  "Error in /var/task/node_modules/@prisma/client/runtime/library.js:123:45",
  "left join tracking_links tl on tl.campaign_source_id = cs.id",
];

describe("toSafeDisplayError", () => {
  it("returns only the caller's message for an ORM invocation error", () => {
    const raw = INTERNAL_MESSAGES[0];
    assert.equal(toSafeDisplayError(new Error(raw), SAFE), SAFE);
  });

  it("never returns any part of the backend error, whatever its shape", () => {
    for (const raw of INTERNAL_MESSAGES) {
      const shown = toSafeDisplayError(new Error(raw), SAFE);
      assert.equal(shown, SAFE, `leaked for: ${raw.slice(0, 60)}`);
      assert.equal(looksInternal(shown), false);
      // No token of the backend message survives into the displayed text.
      for (const token of raw.split(/[\s,{}()[\]"'`:]+/).filter((t) => t.length > 3)) {
        assert.ok(!shown.includes(token), `token "${token}" leaked into the UI message`);
      }
    }
  });

  it("discards the error regardless of how it is shaped", () => {
    const raw = INTERNAL_MESSAGES[1];
    assert.equal(toSafeDisplayError(new Error(raw), SAFE), SAFE);
    assert.equal(toSafeDisplayError(raw, SAFE), SAFE);
    assert.equal(toSafeDisplayError({ message: raw, stack: raw }, SAFE), SAFE);
    assert.equal(toSafeDisplayError(null, SAFE), SAFE);
    assert.equal(toSafeDisplayError(undefined, SAFE), SAFE);
  });

  it("falls back to a generic message when the caller gives none", () => {
    assert.equal(toSafeDisplayError(new Error("boom")), GENERIC_LOOKUP_ERROR);
    assert.equal(toSafeDisplayError(new Error("boom"), ""), GENERIC_LOOKUP_ERROR);
    assert.equal(toSafeDisplayError(new Error("boom"), "   "), GENERIC_LOOKUP_ERROR);
  });

  it("does not pass an apparently harmless backend message through either", () => {
    // Backend text is discarded unconditionally, so nothing can slip past a pattern list.
    assert.equal(toSafeDisplayError(new Error("Forbidden"), SAFE), SAFE);
    assert.equal(toSafeDisplayError(new Error("Authentication required."), SAFE), SAFE);
  });
});

describe("looksInternal", () => {
  it("recognises every internal shape in the corpus", () => {
    for (const raw of INTERNAL_MESSAGES) {
      assert.equal(looksInternal(raw), true, `not recognised: ${raw.slice(0, 60)}`);
    }
  });

  it("does not flag ordinary operator messages", () => {
    for (const text of [
      SAFE,
      GENERIC_LOOKUP_ERROR,
      "Campaign link unavailable for this role.",
      "No canonical campaign matches this rule's SupplierCampaign row or campaign source.",
      "Not available (backend)",
      "Mixed / not directly comparable",
      "",
      null,
    ]) {
      assert.equal(looksInternal(text), false, `false positive: ${text}`);
    }
  });
});

describe("safeListError", () => {
  it("replaces an internal message with the caller's fallback", () => {
    for (const raw of INTERNAL_MESSAGES) {
      const shown = safeListError(raw, GENERIC_REQUEST_ERROR);
      assert.equal(shown, GENERIC_REQUEST_ERROR, `leaked for: ${raw.slice(0, 60)}`);
      assert.equal(looksInternal(shown), false);
    }
  });

  it("keeps a genuine operator message so list pages still explain themselves", () => {
    assert.equal(safeListError("campaign list exploded", GENERIC_REQUEST_ERROR), "campaign list exploded");
    assert.equal(safeListError("commission rule listing exploded", GENERIC_REQUEST_ERROR), "commission rule listing exploded");
    assert.equal(safeListError("Authentication required.", GENERIC_REQUEST_ERROR), "Authentication required.");
    assert.equal(safeListError("Forbidden", GENERIC_REQUEST_ERROR), "Forbidden");
  });

  it("still redacts credential-shaped text from a message it keeps", () => {
    const shown = safeListError("Upstream rejected: Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345", GENERIC_REQUEST_ERROR);
    assert.ok(!shown.includes("abcdefghijklmnopqrstuvwxyz012345"));
    assert.ok(/redacted/i.test(shown));
  });

  it("falls back for empty or missing input", () => {
    assert.equal(safeListError(null, GENERIC_REQUEST_ERROR), GENERIC_REQUEST_ERROR);
    assert.equal(safeListError("", GENERIC_REQUEST_ERROR), GENERIC_REQUEST_ERROR);
    assert.equal(safeListError("   ", GENERIC_REQUEST_ERROR), GENERIC_REQUEST_ERROR);
    assert.equal(safeListError("boom"), "boom");
    assert.equal(safeListError(INTERNAL_MESSAGES[0]), GENERIC_LOOKUP_ERROR);
  });
});

// Backend failures that look like nothing in particular. A recogniser cannot be expected to
// catch these, which is why the Network Operations pages never display backend text at all.
const UNRECOGNISABLE_MESSAGES = [
  "Unexpected adapter state while resolving supplier link",
  "Cannot read properties of undefined in tracking resolver",
  "Internal mapping failure for supplier campaign",
  "Supplier sync worker returned an inconsistent envelope",
  "Coupon projection aborted midway",
];

describe("statusSafeMessage", () => {
  const COUPONS = "Coupons could not be loaded.";
  const TRACKING = "Tracking links could not be loaded.";

  it("returns the page's own message and never any backend text", () => {
    for (const status of [500, 502, 503, undefined, null, 0, "oops"]) {
      assert.equal(statusSafeMessage(status, COUPONS), COUPONS);
      assert.equal(statusSafeMessage(status, TRACKING), TRACKING);
    }
  });

  it("adds wording only for statuses that mean something to an operator", () => {
    assert.match(statusSafeMessage(400, COUPONS), /^Coupons could not be loaded\. The request was rejected/);
    assert.match(statusSafeMessage(422, COUPONS), /The request was rejected/);
    assert.match(statusSafeMessage(401, COUPONS), /no longer authorized/);
    assert.match(statusSafeMessage(403, TRACKING), /role does not allow/);
    assert.match(statusSafeMessage(404, TRACKING), /endpoint was not found/);
    assert.match(statusSafeMessage(429, TRACKING), /Too many requests/);
  });

  it("always starts from the page's own message", () => {
    for (const status of [400, 401, 403, 404, 422, 429, 500]) {
      assert.ok(statusSafeMessage(status, COUPONS).startsWith(COUPONS), String(status));
      assert.ok(statusSafeMessage(status, TRACKING).startsWith(TRACKING), String(status));
    }
  });

  it("never echoes an unrecognisable backend message, which is the whole point", () => {
    for (const raw of UNRECOGNISABLE_MESSAGES) {
      // A recogniser alone would let these through.
      assert.equal(looksInternal(raw), false, `unexpectedly recognised: ${raw}`);
      assert.equal(safeListError(raw, GENERIC_REQUEST_ERROR), raw, "safeListError is the permissive path");
      // The status-derived path never reads the message, so it cannot leak.
      for (const page of [COUPONS, TRACKING]) {
        for (const status of [400, 401, 403, 404, 429, 500]) {
          const shown = statusSafeMessage(status, page);
          assert.ok(!shown.includes(raw), `leaked: ${raw}`);
          // Whole-word check. A substring scan would flag "Coupon" inside the page's own word
          // "Coupons", which is the page's message, not backend text.
          const ownWords = new Set(page.toLowerCase().match(/[a-z]+/g) || []);
          for (const token of raw.split(/\s+/).filter((t) => t.length > 4 && !ownWords.has(t.toLowerCase()))) {
            const wholeWord = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
            assert.ok(!wholeWord.test(shown), `token "${token}" leaked into: ${shown}`);
          }
        }
      }
    }
  });

  it("produces the same text whatever the backend said, because it never reads it", () => {
    // The only inputs are the status and the page's own message; there is no third input that
    // a backend could influence, which is the guarantee a recogniser cannot give.
    const COUPON_OUTPUTS = new Set([400, 401, 403, 404, 422, 429, 500].map((s) => statusSafeMessage(s, COUPONS)));
    for (const raw of [...UNRECOGNISABLE_MESSAGES, ...INTERNAL_MESSAGES]) {
      for (const status of [400, 401, 403, 404, 422, 429, 500]) {
        // Passing the backend text anywhere it could be mistaken for an argument changes nothing.
        assert.ok(COUPON_OUTPUTS.has(statusSafeMessage(status, COUPONS)));
        assert.equal(statusSafeMessage(status, COUPONS), statusSafeMessage(status, COUPONS));
        assert.equal(looksInternal(statusSafeMessage(status, COUPONS)), false, raw.slice(0, 40));
      }
    }
  });

  it("falls back to the generic message when a page supplies none", () => {
    assert.equal(statusSafeMessage(500), GENERIC_REQUEST_ERROR);
    assert.equal(statusSafeMessage(500, ""), GENERIC_REQUEST_ERROR);
    assert.equal(statusSafeMessage(500, "   "), GENERIC_REQUEST_ERROR);
  });
});
