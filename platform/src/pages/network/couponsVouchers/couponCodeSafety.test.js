import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODE_STATE,
  REDACTED,
  URL_AS_CODE_LABEL,
  couponCodeState,
  hasSensitiveParams,
  isSensitiveParam,
  isUrlLike,
  redactUrlSecrets,
  safeCouponTitle,
} from "./couponCodeSafety.js";
import { couponWarnings } from "./couponContract.js";

// The shape of the live OPTIMISE record that prompted this hotfix. The token value here is
// invented for the test; the real one is never read, logged or reproduced.
const URL_CODE = "https://www.atlys.com/en-AE/redeem?partner=assembly&token=tkn_live_abc123XYZ";
const TOKEN_VALUE = "tkn_live_abc123XYZ";

describe("coupon code classification", () => {
  it("uses exactly the wording the review specified", () => {
    assert.equal(URL_AS_CODE_LABEL, "URL supplied instead of code");
  });

  it("renders a normal coupon code unchanged", () => {
    const { state, raw } = couponCodeState({ couponCode: "SAVE10" });
    assert.equal(state, CODE_STATE.CODE);
    assert.equal(raw, "SAVE10");
    assert.equal(safeCouponTitle({ couponCode: "SAVE10" }), "SAVE10");
  });

  it("never treats a URL-shaped value as a code", () => {
    for (const value of [
      URL_CODE,
      "https://example.com/redeem?token=abc123",
      "http://example.com/x",
      "//example.com/x",
      "www.example.com/redeem",
    ]) {
      assert.equal(isUrlLike(value), true, value);
      assert.equal(couponCodeState({ couponCode: value }).state, CODE_STATE.URL_SUPPLIED, value);
    }
  });

  it("does not mistake an ordinary code for a URL", () => {
    for (const value of ["SAVE10", "HTTP20", "WWW5", "50OFF", "SUMMER-2026"]) {
      assert.equal(isUrlLike(value), false, value);
      assert.equal(couponCodeState({ couponCode: value }).state, CODE_STATE.CODE, value);
    }
  });

  it("reports an absent code as absent rather than inventing one", () => {
    assert.equal(couponCodeState({ couponCode: null }).state, CODE_STATE.NONE);
    assert.equal(couponCodeState({ couponCode: "   " }).state, CODE_STATE.NONE);
    assert.equal(couponCodeState({}).state, CODE_STATE.NONE);
  });
});

describe("drawer title", () => {
  it("falls back to the supplier coupon id instead of the URL", () => {
    const title = safeCouponTitle({ couponCode: URL_CODE, supplierCouponId: "257864" });
    assert.equal(title, "Coupon 257864");
    assert.ok(!title.includes("http"));
    assert.ok(!title.includes(TOKEN_VALUE));
  });

  it("falls back to the brand when there is no id", () => {
    assert.equal(safeCouponTitle({ couponCode: URL_CODE, brandName: "Atlys" }), "Atlys — Coupon");
  });

  it("prefers a real title over an id, but never a URL-shaped one", () => {
    assert.equal(safeCouponTitle({ couponCode: URL_CODE, title: "20% off visas", supplierCouponId: "1" }), "20% off visas");
    assert.equal(safeCouponTitle({ couponCode: URL_CODE, title: URL_CODE, supplierCouponId: "1" }), "Coupon 1");
  });

  it("never returns a URL for any input", () => {
    for (const coupon of [
      { couponCode: URL_CODE },
      { couponCode: URL_CODE, title: URL_CODE },
      { couponCode: URL_CODE, title: URL_CODE, brandName: "Atlys" },
      {},
      null,
    ]) {
      const title = safeCouponTitle(coupon);
      assert.equal(isUrlLike(title), false, title);
      assert.ok(!title.includes(TOKEN_VALUE), title);
    }
  });
});

describe("URL redaction", () => {
  it("redacts every sensitive parameter name the review listed", () => {
    for (const name of ["token", "auth", "key", "signature", "sig", "secret", "access_token", "api_key"]) {
      assert.equal(isSensitiveParam(name), true, name);
      const url = `https://example.com/r?${name}=abc123`;
      const shown = redactUrlSecrets(url);
      assert.ok(!shown.includes("abc123"), `${name} leaked: ${shown}`);
      assert.equal(shown, `https://example.com/r?${name}=${REDACTED}`);
    }
  });

  it("matches sensitive names whatever their casing or separators", () => {
    for (const name of ["Token", "ACCESS_TOKEN", "accessToken", "Api-Key", "APIKEY"]) {
      assert.equal(isSensitiveParam(name), true, name);
      assert.ok(!redactUrlSecrets(`https://e.com/r?${name}=abc123`).includes("abc123"), name);
    }
  });

  it("keeps a non-sensitive query readable", () => {
    const url = "https://example.com/r?campaign=spring";
    assert.equal(redactUrlSecrets(url), url);
    assert.equal(hasSensitiveParams(url), false);
  });

  it("redacts only the sensitive parameter and keeps the rest of the live URL shape", () => {
    const shown = redactUrlSecrets(URL_CODE);
    assert.equal(shown, `https://www.atlys.com/en-AE/redeem?partner=assembly&token=${REDACTED}`);
    assert.ok(shown.includes("partner=assembly"), "ordinary parameters stay readable");
    assert.ok(!shown.includes(TOKEN_VALUE));
    assert.equal(hasSensitiveParams(URL_CODE), true);
  });

  it("redacts token material carried in a fragment", () => {
    const shown = redactUrlSecrets("https://e.com/cb#access_token=abc123&state=ok");
    assert.ok(!shown.includes("abc123"), shown);
    assert.ok(shown.includes("state=ok"));
  });

  it("returns null for an empty value rather than a string", () => {
    assert.equal(redactUrlSecrets(null), null);
    assert.equal(redactUrlSecrets("   "), null);
  });
});

describe("data quality state", () => {
  it("warns truthfully without inventing a corrected code", () => {
    const warnings = couponWarnings({ couponCode: URL_CODE, campaign: { id: "sc-1" }, rawPayloadId: "rp-1", discountValue: "10%" });
    const urlWarning = warnings.find((w) => w.includes("coupon code field"));
    assert.ok(urlWarning, warnings.join(" | "));
    assert.ok(!urlWarning.includes("http"), urlWarning);
    assert.ok(!urlWarning.includes(TOKEN_VALUE));
    // It must not also claim nothing was recorded: a value IS stored, it is just not a code.
    assert.ok(!warnings.some((w) => w.startsWith("Neither a coupon code")), warnings.join(" | "));
  });

  it("still reports a record that has neither a code nor a link", () => {
    const warnings = couponWarnings({ campaign: { id: "sc-1" }, rawPayloadId: "rp-1", discountValue: "10%" });
    assert.ok(warnings.some((w) => w.startsWith("Neither a coupon code")), warnings.join(" | "));
  });

  it("leaves a normal coupon free of the URL warning", () => {
    const warnings = couponWarnings({ couponCode: "SAVE10", campaign: { id: "sc-1" }, rawPayloadId: "rp-1", discountValue: "10%" });
    assert.ok(!warnings.some((w) => w.includes("coupon code field")), warnings.join(" | "));
  });

  it("does not move the stored value into another field", () => {
    // The contract layer never rewrites the record: the raw value stays exactly where it was.
    const coupon = { couponCode: URL_CODE, couponLink: null, campaign: { id: "sc-1" }, rawPayloadId: "rp-1" };
    couponWarnings(coupon);
    assert.equal(coupon.couponCode, URL_CODE, "raw source value is untouched");
    assert.equal(coupon.couponLink, null, "no client-side promotion into couponLink");
  });
});
