import { describe, it, expect, vi } from "vitest";

// createSessionToken (called deep inside provisionAndSignInSsoUser) needs AUTH_SECRET --
// same requirement as auth.test.ts, must be set before the module under test is imported.
process.env.AUTH_SECRET = "test-only-secret-not-used-anywhere-real-12345";

vi.mock("@/lib/db", async () => {
  const { createMockDb } = await import("./mockDb");
  const instance = createMockDb();
  (globalThis as Record<string, unknown>).__testMockDb = instance;
  return { db: instance.db };
});

function queueResult(rows: Record<string, unknown>[]) {
  (globalThis as { __testMockDb?: { queueResult: (rows: Record<string, unknown>[]) => void } }).__testMockDb!.queueResult(rows);
}

import { findEnabledSsoConfigByEmail, provisionAndSignInSsoUser, type SsoConfiguration } from "@/lib/sso";

function makeConfig(overrides: Partial<SsoConfiguration> = {}): SsoConfiguration {
  return {
    id: "sso_1",
    organizationId: "org_a",
    isEnabled: true,
    emailDomain: "acme.com",
    idpEntityId: "https://idp.example.com/metadata",
    idpSsoUrl: "https://idp.example.com/sso",
    idpCertificate: "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
    defaultRole: "VIEWER",
    createdBy: "Test Admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// findEnabledSsoConfigByEmail is what routes an email typed into "Sign in with SSO" (see
// /api/sso/discover) to the right organization's IdP -- a bug here either sends someone to the
// wrong company's login flow or silently fails to offer SSO at all.
describe("findEnabledSsoConfigByEmail", () => {
  it("returns null without querying when the email has no domain", async () => {
    const result = await findEnabledSsoConfigByEmail("not-an-email");
    expect(result).toBeNull();
  });

  it("returns null when no configuration exists for the domain", async () => {
    queueResult([]);
    const result = await findEnabledSsoConfigByEmail("person@unknown.com");
    expect(result).toBeNull();
  });

  it("returns null when a configuration exists but is disabled", async () => {
    queueResult([{ emailDomain: "acme.com", isEnabled: false }]);
    const result = await findEnabledSsoConfigByEmail("person@acme.com");
    expect(result).toBeNull();
  });

  it("returns the config when enabled, matching case-insensitively", async () => {
    queueResult([{ emailDomain: "acme.com", isEnabled: true }]);
    const result = await findEnabledSsoConfigByEmail("Person@ACME.com");
    expect(result).toMatchObject({ emailDomain: "acme.com", isEnabled: true });
  });
});

// provisionAndSignInSsoUser is the actual trust boundary between "samlify verified this
// SAMLResponse's signature" and "this person is now logged in as a specific Executa account" --
// see the file-level comment in lib/sso.ts. The cross-org check in particular is the one
// regression that would matter most: it stops a same-email account belonging to a different
// organization (or to internal Executa staff) from being silently logged into via another
// org's SSO configuration.
describe("provisionAndSignInSsoUser", () => {
  it("rejects a malformed email without querying anything", async () => {
    const outcome = await provisionAndSignInSsoUser(makeConfig(), "not-an-email");
    expect(outcome.ok).toBe(false);
  });

  it("refuses to log in an existing account that belongs to a different organization", async () => {
    queueResult([{ id: "u1", email: "person@acme.com", organizationId: "org_b", role: "PM", name: "Person", disabledAt: null, loginCount: 3 }]);
    const outcome = await provisionAndSignInSsoUser(makeConfig({ organizationId: "org_a" }), "person@acme.com");
    expect(outcome.ok).toBe(false);
  });

  it("refuses to log in a disabled account", async () => {
    queueResult([{ id: "u1", email: "person@acme.com", organizationId: "org_a", role: "PM", name: "Person", disabledAt: new Date(), loginCount: 3 }]);
    const outcome = await provisionAndSignInSsoUser(makeConfig({ organizationId: "org_a" }), "person@acme.com");
    expect(outcome.ok).toBe(false);
  });

  it("issues a session token for an existing account in the matching organization", async () => {
    queueResult([{ id: "u1", email: "person@acme.com", organizationId: "org_a", role: "PM", name: "Person", disabledAt: null, loginCount: 3 }]);
    const outcome = await provisionAndSignInSsoUser(makeConfig({ organizationId: "org_a" }), "person@acme.com");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(typeof outcome.token).toBe("string");
  });

  it("auto-provisions a brand-new account at the configuration's defaultRole", async () => {
    queueResult([]); // no existing account with this email
    queueResult([{ id: "new_user_1" }]); // insert ... returning
    const outcome = await provisionAndSignInSsoUser(makeConfig({ organizationId: "org_a", defaultRole: "CONTRIBUTOR" }), "newperson@acme.com");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(typeof outcome.token).toBe("string");
  });
});
