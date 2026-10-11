import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BACKEND_UNAVAILABLE_FIELDS,
  ERROR_CODE_LABELS,
  errorCodeLabel,
  knownErrorCode,
  ERROR_LABELS,
  ERROR_STATE,
  FORBIDDEN_PATHS,
  NO_RAW_REFERENCE,
  PRODUCT_FEEDS_PATH,
  PRODUCT_FEED_FIELDS,
  feedErrorState,
  feedWarnings,
  toProductFeedView,
} from "./productFeedContract.js";

/** Error shapes the backend can put in lastError. None may survive the projection. */
const RAW_ERRORS = [
  'Invalid `prisma.productFeed.findMany()` invocation in /var/task/src/modules/ops/productOps.service.js:161:22',
  "SELECT id, feed_url FROM product_feeds WHERE supplier = $1",
  "TypeError: Cannot read properties of undefined (reading 'feedUrl')\n    at ingest (/var/task/src/x.js:12:3)",
  "FTP login failed for user feeduser password hunter2 at sftp://feeds.example.test",
  "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345",
  "PrismaClientKnownRequestError: P2025 record not found",
];

function feedDto(extra = {}) {
  return {
    id: "pf-1",
    supplier: "OPTIMISE",
    feedName: "Optimise SG catalogue",
    feedExternalId: "feed-8891",
    status: "ACTIVE",
    lastSyncAt: "2026-09-01T10:00:00.000Z",
    campaignSourceId: "cs-77",
    itemCount: 1200,
    productCount: 1180,
    assignmentCount: 3,
    errorCount: 0,
    exceptionCount: 0,
    lastError: null,
    // Fields the raw endpoint would carry. They must never survive projection.
    feedUrl: "sftp://user:hunter2@feeds.example.test/catalogue.csv",
    metadata: { secret: "DECOY_FEED_SECRET" },
    compressedLocation: "/tmp/feed.gz",
    aid: "AID-1",
    ...extra,
  };
}

describe("toProductFeedView", () => {
  it("keeps exactly the contract's own fields", () => {
    const view = toProductFeedView(feedDto());
    for (const key of PRODUCT_FEED_FIELDS) assert.ok(key in view, `missing ${key}`);
    assert.equal(view.feedName, "Optimise SG catalogue");
    assert.equal(view.feedExternalId, "feed-8891");
    assert.equal(view.supplier, "OPTIMISE");
    assert.equal(view.status, "ACTIVE");
    assert.equal(view.itemCount, 1200);
    assert.equal(view.productCount, 1180);
    assert.equal(view.assignmentCount, 3);
    assert.equal(view.campaignSourceId, "cs-77");
  });

  it("never copies feedUrl, metadata or other raw-endpoint fields", () => {
    const view = toProductFeedView(feedDto());
    for (const key of ["feedUrl", "metadata", "compressedLocation", "aid"]) {
      assert.equal(key in view, false, `${key} leaked into the view`);
    }
    assert.ok(!JSON.stringify(view).includes("hunter2"));
    assert.ok(!JSON.stringify(view).includes("DECOY_FEED_SECRET"));
  });

  it("never copies lastError, whatever it contains", () => {
    for (const raw of RAW_ERRORS) {
      const view = toProductFeedView(feedDto({ lastError: raw }));
      assert.equal("lastError" in view, false, "lastError survived the projection");
      const serialized = JSON.stringify(view);
      // No token of the backend error reaches the view object. Words that are themselves contract
      // vocabulary ("supplier", "status", ...) are skipped: they are the view's own keys and
      // values, not evidence of a leak.
      const ownWords = new Set(
        JSON.stringify(view).toLowerCase().match(/[a-z]+/g) || [],
      );
      for (const token of raw.split(/[\s,{}()[\]"'`:]+/).filter((t) => t.length > 3)) {
        if (ownWords.has(token.toLowerCase())) continue;
        assert.ok(!serialized.includes(token), `token "${token}" leaked`);
      }
    }
  });

  it("carries only a boolean for the error signal", () => {
    assert.equal(toProductFeedView(feedDto({ lastError: RAW_ERRORS[0] })).hasError, true);
    assert.equal(toProductFeedView(feedDto({ lastError: null })).hasError, false);
    assert.equal(toProductFeedView(feedDto({ lastError: "   " })).hasError, false);
  });
});

describe("dual backend contract", () => {
  // The production backend returns raw `lastError`; the newer one returns `hasError` plus a
  // `safeErrorCode` and drops the text. Reading only one of them would report "no error" for
  // every failing feed while the two are out of step.
  it("reads the old contract: raw lastError means an error is present", () => {
    const view = toProductFeedView(feedDto({ lastError: "opaque raw error" }));
    assert.equal(view.hasError, true);
    assert.equal("lastError" in view, false, "the raw text is still never projected");
    assert.equal(feedErrorState(view), ERROR_STATE.PRESENT);
    assert.ok(!JSON.stringify(view).includes("opaque raw error"));
  });

  it("reads the new contract: hasError true means an error is present", () => {
    const dto = feedDto({ hasError: true, safeErrorCode: "AUTH_FAILED" });
    delete dto.lastError;
    const view = toProductFeedView(dto);
    assert.equal(view.hasError, true);
    assert.equal(feedErrorState(view), ERROR_STATE.PRESENT);
  });

  it("reads the new contract: hasError false means no error", () => {
    const dto = feedDto({ hasError: false });
    delete dto.lastError;
    const view = toProductFeedView(dto);
    assert.equal(view.hasError, false);
    assert.equal(feedErrorState(view), ERROR_STATE.NONE);
  });

  it("does not let a true hasError be overridden by an absent lastError", () => {
    // The regression this guards: preferring lastError would turn a real failure into "no error"
    // the moment the backend stops sending the text.
    const dto = feedDto({ hasError: true });
    delete dto.lastError;
    assert.equal(toProductFeedView(dto).hasError, true);
    assert.equal(feedErrorState(toProductFeedView(dto)), ERROR_STATE.PRESENT);
  });

  it("prefers the boolean when the two disagree", () => {
    assert.equal(toProductFeedView(feedDto({ hasError: false, lastError: "stale text" })).hasError, false);
    assert.equal(toProductFeedView(feedDto({ hasError: true, lastError: null })).hasError, true);
  });
});

describe("safeErrorCode rendering", () => {
  it("keeps only codes this UI knows how to label", () => {
    for (const code of Object.keys(ERROR_CODE_LABELS)) {
      assert.equal(knownErrorCode(code), code);
      assert.equal(typeof errorCodeLabel(code), "string");
    }
  });

  it("never renders an unknown or arbitrary server string", () => {
    for (const bad of ["WEIRD_NEW_CODE", "Invalid `prisma.productFeed.findMany()`", "<script>", "", null, 42, {}]) {
      assert.equal(knownErrorCode(bad), null, String(bad));
      assert.equal(errorCodeLabel(bad), null, String(bad));
    }
  });

  it("treats NONE as no code to show", () => {
    assert.equal(knownErrorCode("NONE"), null);
  });

  it("projects only a known code onto the view", () => {
    assert.equal(toProductFeedView(feedDto({ safeErrorCode: "TIMEOUT" })).safeErrorCode, "TIMEOUT");
    assert.equal(toProductFeedView(feedDto({ safeErrorCode: "raw text here" })).safeErrorCode, null);
    const view = toProductFeedView(feedDto({ safeErrorCode: "Invalid `prisma.x.findMany()` invocation" }));
    assert.ok(!JSON.stringify(view).includes("prisma"));
  });
});

describe("feedErrorState", () => {
  it("reports presence and absence only", () => {
    assert.equal(feedErrorState({ hasError: true }), ERROR_STATE.PRESENT);
    assert.equal(feedErrorState({ hasError: false }), ERROR_STATE.NONE);
    assert.equal(feedErrorState({}), ERROR_STATE.NONE);
    assert.equal(feedErrorState(null), ERROR_STATE.NONE);
  });

  it("returns a state, never any part of the text", () => {
    for (const raw of RAW_ERRORS) {
      const state = feedErrorState({ lastError: raw });
      assert.equal(state, ERROR_STATE.PRESENT);
      assert.ok(state === "PRESENT" || state === "NONE");
      assert.ok(!state.includes("prisma"));
    }
  });

  it("labels are fixed strings that carry no backend text", () => {
    assert.equal(ERROR_LABELS.NONE, "No error reported");
    assert.equal(ERROR_LABELS.PRESENT, "Error present");
  });
});

describe("counts", () => {
  it("never merges the error and exception counts", () => {
    const view = toProductFeedView(feedDto({ errorCount: 2, exceptionCount: 5 }));
    assert.equal(view.errorCount, 2);
    assert.equal(view.exceptionCount, 5);
    assert.equal("failedCount" in view, false);
    assert.equal("totalErrors" in view, false);
  });

  it("keeps item, product and assignment counts distinct", () => {
    const view = toProductFeedView(feedDto({ itemCount: 10, productCount: 4, assignmentCount: 1 }));
    assert.deepEqual([view.itemCount, view.productCount, view.assignmentCount], [10, 4, 1]);
  });
});

describe("warnings", () => {
  it("reports an error without describing it", () => {
    const warnings = feedWarnings(toProductFeedView(feedDto({ lastError: RAW_ERRORS[0], errorCount: 3 })));
    const errorWarning = warnings.find((w) => w.includes("reports an error"));
    assert.ok(errorWarning);
    assert.ok(!errorWarning.includes("prisma"));
    assert.ok(!errorWarning.includes("findMany"));
  });

  it("flags a feed with items but no linked product", () => {
    const warnings = feedWarnings(toProductFeedView(feedDto({ itemCount: 50, productCount: 0 })));
    assert.ok(warnings.some((w) => w.includes("no canonical product is linked")));
  });

  it("stays quiet for a healthy feed", () => {
    assert.deepEqual(feedWarnings(toProductFeedView(feedDto())), []);
  });
});

describe("contract honesty", () => {
  it("uses the safe admin endpoint and names the forbidden ones", () => {
    assert.equal(PRODUCT_FEEDS_PATH, "/ops/admin/product-feeds");
    assert.ok(FORBIDDEN_PATHS.includes("/ops/products"));
    assert.ok(FORBIDDEN_PATHS.includes("/ops/product-feeds"));
    assert.equal(FORBIDDEN_PATHS.includes(PRODUCT_FEEDS_PATH), false);
  });

  it("states the raw reference is not returned, not that none exists", () => {
    // The exact required wording: it describes the contract, not the existence of source data.
    assert.equal(NO_RAW_REFERENCE, "No raw payload reference is returned by this contract.");
    assert.ok(!/no raw payload exists/i.test(NO_RAW_REFERENCE));
    assert.ok(!/does not exist/i.test(NO_RAW_REFERENCE));
  });

  it("names every field the contract omits", () => {
    for (const field of ["Feed format / type", "Feed URL (presence or value)", "Raw payload reference"]) {
      assert.ok(BACKEND_UNAVAILABLE_FIELDS.includes(field), field);
    }
  });
});
