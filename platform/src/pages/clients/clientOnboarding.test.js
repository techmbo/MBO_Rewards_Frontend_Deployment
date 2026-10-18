import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const WIZARD = readFileSync(new URL("./ClientSetupWizard.jsx", import.meta.url), "utf8");
/** Comments stripped: a doc comment saying "never localStorage" must not read as a use of it. */
const WIZARD_CODE = WIZARD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** JSX wraps prose across lines; compare rendered text, not source formatting. */
const WIZARD_TEXT = WIZARD.replace(/\s+/g, " ");
const CLIENTS = readFileSync(new URL("./ClientsPage.jsx", import.meta.url), "utf8");
const API = readFileSync(new URL("../../api.js", import.meta.url), "utf8");

/**
 * Admin client-onboarding contract, against backend 05e629c.
 *
 * Two of these guard a real incident each. A client could be made ACTIVE without any of the seven
 * activation prerequisites — once from the create form, once from a row action — and the wizard's
 * hand-written readiness list silently omitted the signed agreement, so the operator saw every row
 * green while the gate refused. Both are now driven by the backend's own answer.
 */

/** Keys accepted by updateClientBodySchema at 05e629c. It is STRICT: anything else is a 400. */
const PATCH_CLIENT_KEYS = new Set([
  "agreementDocumentUrl", "agreementEffectiveAt", "agreementRenewalAt", "agreementStatus",
  "apiEnvironmentConfig", "category", "country", "currency", "deliveryMethod", "industry",
  "legalName", "logoUrl", "name", "paymentCycle", "paymentTrigger", "status", "subCategory",
  "timezone",
]);

/** Enum values the backend accepts. Copied from the zod schemas, not invented. */
const BACKEND_ENUMS = {
  agreementStatus: ["NONE", "DRAFT", "SENT", "PENDING", "SIGNED"],
  deliveryMethod: ["PORTAL_ONLY", "API_ONLY", "API_AND_PORTAL"],
  paymentCycle: ["MONTHLY", "QUARTERLY"],
  paymentTrigger: ["AFTER_NETWORK_PAYMENT", "CONTRACT_SPECIFIC"],
};

/** The literal body object built by handleSaveOrganisation. */
function organisationPatchBody() {
  const start = WIZARD.indexOf("const body = {\n        name: orgForm.name.trim(),");
  assert.notEqual(start, -1, "handleSaveOrganisation's body literal moved");
  return WIZARD.slice(start, WIZARD.indexOf("};", start));
}

describe("1/2 — a client can only become ACTIVE through the activation gate", () => {
  it("1. the create form cannot choose ACTIVE, and always sends PROSPECT", () => {
    // Creation happens in the wizard's step 1 (the Add Client page), not a modal on the directory.
    assert.match(WIZARD, /postApi\("\/clients", \{ \.\.\.body, status: "PROSPECT" \}\)/, "create no longer pins the status");
    assert.ok(!/status: orgForm\.status/.test(WIZARD), "the create body takes its status from the form");
    assert.ok(
      !/status: form\.status/.test(CLIENTS),
      "the create body still takes its status from the form",
    );
    // The status <Select> is gone from the create form; STATUS_OPTIONS survives for FILTERING only.
    assert.ok(
      !/label="Status"[\s\S]{0,120}options=\{STATUS_OPTIONS\}/.test(CLIENTS),
      "the create form still renders a status selector",
    );
    assert.match(CLIENTS, /FILTER_DEFS|filters/, "status filtering was removed as collateral");
  });

  it("2. no row action PATCHes status ACTIVE", () => {
    assert.ok(!CLIENTS.includes("Set Active"), "the Set Active action is still present");
    assert.ok(
      !/\{\s*status:\s*"ACTIVE"\s*\}/.test(CLIENTS),
      "something still PATCHes status ACTIVE",
    );
    // Suspend and offboard are still allowed — the backend still accepts those.
    assert.match(CLIENTS, /\{ status: "SUSPENDED" \}/);
    assert.match(CLIENTS, /\{ status: "OFFBOARDED" \}/);
  });
});

describe("3 — the organisation PATCH matches the backend contract exactly", () => {
  it("3a. every key sent is one updateClientBodySchema accepts", () => {
    const body = organisationPatchBody();
    const keys = [...body.matchAll(/^\s{8}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1]);
    assert.ok(keys.length >= 14, `only ${keys.length} keys found — the body shape changed`);
    for (const key of keys) {
      assert.ok(PATCH_CLIENT_KEYS.has(key), `"${key}" is not accepted by the strict PATCH schema`);
    }
  });

  it("3b. all seven newly required fields are sent", () => {
    const body = organisationPatchBody();
    for (const key of [
      "agreementStatus", "agreementEffectiveAt", "agreementRenewalAt", "agreementDocumentUrl",
      "paymentCycle", "paymentTrigger", "deliveryMethod",
    ]) {
      assert.ok(new RegExp(`\\b${key}:`).test(body), `${key} is not in the PATCH body`);
    }
  });

  it("3c. the selector options use the backend's enum values and no others", () => {
    const blocks = {
      agreementStatus: WIZARD.slice(
        WIZARD.indexOf("const AGREEMENT_STATUS_OPTIONS"),
        WIZARD.indexOf("const DELIVERY_METHOD_OPTIONS"),
      ),
      deliveryMethod: WIZARD.slice(
        WIZARD.indexOf("const DELIVERY_METHOD_OPTIONS"),
        WIZARD.indexOf("const PAYMENT_CYCLE_OPTIONS"),
      ),
      paymentCycle: WIZARD.slice(
        WIZARD.indexOf("const PAYMENT_CYCLE_OPTIONS"),
        WIZARD.indexOf("const PAYMENT_TRIGGER_OPTIONS"),
      ),
      paymentTrigger: WIZARD.slice(
        WIZARD.indexOf("const PAYMENT_TRIGGER_OPTIONS"),
        WIZARD.indexOf("function dateInputValue"),
      ),
    };
    for (const [field, expected] of Object.entries(BACKEND_ENUMS)) {
      const block = blocks[field];
      assert.ok(block && block.length > 0, `${field} option block missing`);
      const values = [...block.matchAll(/value:\s*"([A-Z_]*)"/g)].map((m) => m[1]).filter(Boolean);
      assert.deepEqual(
        [...values].sort(),
        [...expected].sort(),
        `${field} options do not match the backend enum`,
      );
    }
  });

  it("3d. status is never sent by the organisation PATCH", () => {
    assert.ok(!/\bstatus:/.test(organisationPatchBody()), "the wizard PATCH sends a status");
  });
});

describe("4/5/6 — delivery method drives which access is required", () => {
  it("4/5. needsApi and needsPortal are derived exactly as the backend derives them", () => {
    assert.match(WIZARD, /const needsApi = deliveryMethod !== "PORTAL_ONLY";/);
    assert.match(WIZARD, /const needsPortal = deliveryMethod !== "API_ONLY";/);
  });

  it("5. PORTAL_ONLY hides the API credential section", () => {
    assert.match(WIZARD, /\{needsApi && \(\s*\n\s*<section/, "the API section is not gated");
  });

  it("4. API_ONLY hides the portal administrator section", () => {
    assert.match(WIZARD, /\{needsPortal && \(\s*\n\s*<section/, "the portal section is not gated");
  });

  it("6. API_AND_PORTAL satisfies both gates, so both sections render", () => {
    // With the derivations above, API_AND_PORTAL is the only value where both are true.
    const needsApi = (d) => d !== "PORTAL_ONLY";
    const needsPortal = (d) => d !== "API_ONLY";
    assert.deepEqual(
      BACKEND_ENUMS.deliveryMethod.filter((d) => needsApi(d) && needsPortal(d)),
      ["API_AND_PORTAL"],
    );
    assert.deepEqual(BACKEND_ENUMS.deliveryMethod.filter((d) => !needsApi(d)), ["PORTAL_ONLY"]);
    assert.deepEqual(BACKEND_ENUMS.deliveryMethod.filter((d) => !needsPortal(d)), ["API_ONLY"]);
  });
});

describe("7/8/9 — activation readiness comes from the backend", () => {
  it("7. the blocker list is the backend's, not a hand-written one", () => {
    assert.match(WIZARD, /onboarding\?\.activationBlockDetails/);
    assert.match(WIZARD, /onboarding\?\.activationBlocks/);
    // The old hardcoded rows that could drift from the gate are gone.
    for (const stale of [
      '["Client created", checklist.clientCreated]',
      '["API key issued", checklist.apiKeyIssued]',
      '["Portal login created", checklist.administratorConfigured]',
      '["Client activated", checklist.activated]',
    ]) {
      assert.ok(!WIZARD.includes(stale), `a hand-written readiness row survives: ${stale}`);
    }
  });

  it("7b. the agreement blocker can no longer be omitted", () => {
    // It is not enumerated in the UI at all — it arrives inside activationBlockDetails.
    assert.match(WIZARD, /<ActivationReadiness\s/);
    assert.match(WIZARD, /blockers=\{activationBlockers\}/);
    assert.match(WIZARD, /Activation requires agreement status/);
  });

  it("8. Activate is disabled while any blocker remains", () => {
    assert.match(WIZARD, /disabled=\{checklist\.activated \|\| activationBlockers\.length > 0\}/);
  });

  it("9. a structured 409 renders the blocker detail, not just the message", () => {
    assert.match(WIZARD, /err\?\.details\?\.activationBlockDetails/);
    assert.match(WIZARD, /err\?\.details\?\.activationBlocks/);
    assert.match(WIZARD, /setActivateBlockers\(details\)/);
    // The API layer must carry `details` through for any of that to arrive.
    assert.match(API, /\.\.\.\(data\?\.details && typeof data\.details === "object" \? data\.details : \{\}\)/);
    assert.match(API, /this\.details = details;/);
  });
});

describe("10/11/12 — invitation issue and reissue", () => {
  it("10. the invite mutation calls the onboarding admin endpoint", () => {
    assert.match(WIZARD, /postApi\(`\/clients\/\$\{setupClient\.id\}\/onboarding\/admin`, body\)/);
    // Exactly the two fields inviteAdminBodySchema accepts.
    const fn = WIZARD.slice(
      WIZARD.indexOf("async function handleSendInvite"),
      WIZARD.indexOf("async function handleCreatePortalLogin"),
    );
    assert.ok(fn.length > 0, "handleSendInvite moved");
    assert.match(fn, /const body = \{ email \};/);
    assert.match(fn, /if \(name\) body\.name = name;/);
    assert.ok(!/password/i.test(fn.replace(/setInviteForm[\s\S]{0,120}?\)\);/g, "")),
      "the invite path sends or handles a password");
  });

  it("11. the raw token is transient — no storage, no cache, no logging", () => {
    for (const forbidden of ["localStorage", "sessionStorage", "console.log", "console.error", "analytics", "gtag"]) {
      assert.ok(!WIZARD_CODE.includes(forbidden), `the wizard uses ${forbidden}`);
    }
    // Held in component state only, and dismissible.
    assert.match(WIZARD, /const \[inviteResult, setInviteResult\] = useState\(null\)/);
    assert.match(WIZARD, /onDismiss=\{\(\) => setInviteResult\(null\)\}/);
    // The token is never written into the onboarding state that survives a reload.
    assert.ok(
      !/setOnboarding\([^)]*inviteToken/.test(WIZARD),
      "the token is merged into reloadable state",
    );
  });

  it("12. the reissue warning is shown, and the link targets the client portal", () => {
    assert.match(WIZARD_TEXT, /Reissuing an invitation invalidates the previous invitation link\./);
    assert.equal(
      (WIZARD_TEXT.match(/Reissuing an invitation invalidates the previous invitation link\./g) || []).length,
      2,
      "the warning should appear both before issuing and on the revealed link",
    );
    assert.match(
      WIZARD,
      /"https:\/\/mbo-rewards-frontend\.vercel\.app\/mbointegratedPlatform\/set-password"/,
    );
    assert.match(WIZARD, /\?token=\$\{encodeURIComponent\(result\.token\)\}/);
    assert.match(WIZARD, /Copy invite link/);
  });

  it("12b. the admin-chosen-password path still exists, just not as the primary route", () => {
    assert.match(WIZARD, /handleCreatePortalLogin/);
    assert.match(WIZARD, /postApi\(`\/clients\/\$\{setupClient\.id\}\/portal-users`/);
  });
});

describe("13 — provisioning shows partial failure", () => {
  it("13. all three result buckets are rendered separately", () => {
    const comp = WIZARD.slice(
      WIZARD.indexOf("function ProvisionOutcome"),
      WIZARD.indexOf("function ApiKeyReveal"),
    );
    assert.ok(comp.length > 0, "ProvisionOutcome moved");
    for (const bucket of ["provisioned", "trackingPending", "failures"]) {
      assert.ok(comp.includes(`buckets.${bucket}`), `${bucket} is not rendered`);
    }
    assert.match(comp, /result\?\.provisionResults/);
    // A run with failures must not read as a clean success.
    assert.match(comp, /This run did not fully succeed/);
    assert.match(comp, /buckets\.failures\?\.length > 0 \|\| buckets\.trackingPending\?\.length > 0/);
    // Per-row reason and tracking state are surfaced.
    assert.match(comp, /row\.message/);
    assert.match(comp, /row\.trackingStatus/);
    assert.match(comp, /row\.published/);
    assert.match(WIZARD, /<ProvisionOutcome result=\{provisionResult\} \/>/);
  });
});
