import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const AUTH_CONTEXT = readFileSync(new URL("./AuthContext.jsx", import.meta.url), "utf8");
const APP_SHELL = readFileSync(
  new URL("../components/layout/AppShell.jsx", import.meta.url),
  "utf8",
);

describe("preview auth bypass — frontend", () => {
  it("holds no bypass flag of its own and asks the backend instead", () => {
    // A build-time flag could be set on the wrong environment. Asking the backend cannot be,
    // because a production backend always answers active:false.
    assert.ok(AUTH_CONTEXT.includes("/auth/dev-bypass-status"));
    assert.ok(!/ALLOW_DEV_AUTH_BYPASS/.test(AUTH_CONTEXT), "no env flag may be read client-side");
    assert.ok(!/import\.meta\.env\.[A-Z_]*BYPASS/.test(AUTH_CONTEXT));
    assert.ok(!/VITE_[A-Z_]*BYPASS/.test(AUTH_CONTEXT));
  });

  it("treats only an explicit boolean true as active", () => {
    assert.ok(AUTH_CONTEXT.includes("response?.active === true"));
  });

  it("falls back to normal login when the status call fails", () => {
    const fn = AUTH_CONTEXT.slice(
      AUTH_CONTEXT.indexOf("async function readDevBypassStatus"),
      AUTH_CONTEXT.indexOf("export function AuthProvider"),
    );
    assert.ok(fn.includes("catch"), "a failed status call must not enable the bypass");
    assert.ok(fn.includes("return false"));
  });

  it("only attempts the bypass when there is no stored token", () => {
    const bootstrap = AUTH_CONTEXT.slice(
      AUTH_CONTEXT.indexOf("async function bootstrap"),
      AUTH_CONTEXT.indexOf("setLoading(true);"),
    );
    const guardAt = bootstrap.indexOf("if (!token) {");
    const statusAt = bootstrap.indexOf("readDevBypassStatus()");
    assert.ok(guardAt > -1 && statusAt > guardAt, "the status check lives inside the no-token branch");
  });

  it("authentication still requires a token unless the bypass is active", () => {
    assert.ok(AUTH_CONTEXT.includes("isAuthenticated: Boolean(user && (token || devBypass))"));
    // Never simply Boolean(user): a user without either would authenticate.
    assert.ok(!/isAuthenticated: Boolean\(user\)/.test(AUTH_CONTEXT));
  });

  it("clears the bypass flag whenever a real token is present", () => {
    assert.ok(AUTH_CONTEXT.includes("setDevBypass(false)"));
    assert.ok(AUTH_CONTEXT.includes("setDevBypass(true)"));
  });

  it("no credential is synthesised client-side", () => {
    // Scoped to the bypass path: the real login() legitimately handles a password, which a
    // whole-file scan would flag. What matters is that the bypass mints nothing.
    const bypassBlock = AUTH_CONTEXT.slice(
      AUTH_CONTEXT.indexOf("const bypassActive"),
      AUTH_CONTEXT.indexOf("setDevBypass(false);\n        setLoading(false);"),
    );
    assert.ok(bypassBlock.length > 0, "the bypass block must be locatable");
    for (const banned of ["password", "signAccessToken", "jwt", "secret", "writeStoredToken", "setToken("]) {
      assert.ok(!bypassBlock.toLowerCase().includes(banned.toLowerCase()), banned);
    }
  });

  it("no fake token is ever written to storage anywhere", () => {
    // writeStoredToken is only reached from applySession and clearSession — the real flows.
    const callers = [...AUTH_CONTEXT.matchAll(/writeStoredToken\(/g)].length;
    assert.equal(callers, 3, "definition plus applySession plus clearSession only");
  });
});

describe("preview auth bypass — banner", () => {
  it("shows the required banner text", () => {
    assert.ok(APP_SHELL.includes("DEV AUTH BYPASS ACTIVE"));
    assert.ok(APP_SHELL.includes('role="alert"'));
  });

  it("renders the banner only while the bypass is active", () => {
    assert.ok(APP_SHELL.includes("{devBypass && <DevAuthBypassBanner />}"));
    assert.ok(APP_SHELL.includes("const { user, devBypass } = useAuth();"));
  });

  it("the banner is not hard-coded on", () => {
    assert.ok(!/\{true && <DevAuthBypassBanner/.test(APP_SHELL));
    assert.ok(!APP_SHELL.includes("<DevAuthBypassBanner />\n      <div"), "must be conditional");
  });
});
