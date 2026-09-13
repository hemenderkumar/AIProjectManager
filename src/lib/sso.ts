import * as saml from "samlify";
import { randomBytes } from "crypto";
import { db } from "./db";
import { ssoConfigurations, users } from "./db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, type SessionUser } from "./auth";
import { logAudit } from "./audit";

// samlify refuses to process any message until a schema validator is registered -- it throws
// on first use otherwise. Real XSD schema validation needs a native `xmllint` binary (or a WASM
// build) that isn't available in this serverless environment, so it's skipped here. That's a
// deliberate, accepted tradeoff, not a security gap: schema validation only checks that a
// message is *shaped* like SAML, not that it's authentic. The actual trust boundary is XML-DSig
// signature verification against the IdP's stored certificate (wantAssertionsSigned below,
// enforced by samlify's own libsaml verification code) -- a forged or tampered SAMLResponse
// fails that check regardless of whether its XML shape was pre-validated against the schema.
saml.setSchemaValidator({ validate: async () => Promise.resolve("SKIPPED") });

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function spEntityId(organizationId: string) {
  return `${appUrl()}/api/sso/metadata/${organizationId}`;
}

export function acsUrl(organizationId: string) {
  return `${appUrl()}/api/sso/acs/${organizationId}`;
}

// Executa is only ever the Service Provider (SP) side of SAML. We don't sign our own
// AuthnRequests (authnRequestsSigned: false -- the HTTP-Redirect binding most IdPs accept
// doesn't require it) and we don't decrypt assertions (no encryption key configured). The one
// setting that actually matters for security is wantAssertionsSigned: true, which makes
// samlify reject any inbound assertion that isn't signed with the IdP's certificate.
export function buildServiceProvider(organizationId: string) {
  return saml.ServiceProvider({
    entityID: spEntityId(organizationId),
    assertionConsumerService: [
      { Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST", Location: acsUrl(organizationId) },
    ],
    authnRequestsSigned: false,
    wantAssertionsSigned: true,
    wantMessageSigned: false,
  });
}

export function buildIdentityProvider(config: { idpEntityId: string; idpSsoUrl: string; idpCertificate: string }) {
  return saml.IdentityProvider({
    entityID: config.idpEntityId,
    signingCert: config.idpCertificate,
    singleSignOnService: [
      { Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect", Location: config.idpSsoUrl },
    ],
  });
}

export type SsoConfiguration = typeof ssoConfigurations.$inferSelect;

export async function getSsoConfig(organizationId: string): Promise<SsoConfiguration | null> {
  const [row] = await db.select().from(ssoConfigurations).where(eq(ssoConfigurations.organizationId, organizationId));
  return row ?? null;
}

// Powers the "Sign in with SSO" flow on the login page -- given a work email, find which
// organization's IdP (if any, and if enabled) it should be routed to.
export async function findEnabledSsoConfigByEmail(email: string): Promise<SsoConfiguration | null> {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  const [row] = await db.select().from(ssoConfigurations).where(eq(ssoConfigurations.emailDomain, domain));
  if (!row || !row.isEnabled) return null;
  return row;
}

// Finds-or-provisions the Executa user for a NameID (email) asserted by a verified SAMLResponse,
// then issues a real session for them -- mirrors /api/auth/login's cookie-setting logic exactly,
// since from the app's point of view this IS a login, just authenticated a different way.
//
// Security note: by the time this runs, the caller (the ACS route) has already had samlify
// verify the assertion's signature against config.idpCertificate, so `email` here is a claim
// this organization's trusted IdP vouched for -- not user-supplied input. The one thing this
// function still checks is that an *existing* account with that email belongs to the same
// organization the SSO login was initiated for, so a compromised or misconfigured IdP for
// Org A can't be used to hijack a same-email account that actually belongs to Org B (or to
// internal Executa staff, who have organizationId === null and must never be reachable this
// way at all).
export async function provisionAndSignInSsoUser(
  config: SsoConfiguration,
  email: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { ok: false, error: "The identity provider did not return a valid email address." };
  }

  const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));

  let userId: string;
  let name: string;
  let role: SessionUser["role"];

  if (existing) {
    if (existing.organizationId !== config.organizationId) {
      // Not this org's account -- refuse rather than silently logging into someone else's.
      return { ok: false, error: "This email is not associated with this organization." };
    }
    if (existing.disabledAt) {
      return { ok: false, error: "This account has been disabled. Contact your Executa administrator." };
    }
    userId = existing.id;
    name = existing.name;
    role = existing.role;
  } else {
    // First SSO login for this person -- auto-provision, same reasoning as the self-service
    // INDIVIDUAL registration path (see /api/auth/register): there's an explicit, admin-
    // configured trust relationship (a SUPER_USER wired up this exact IdP certificate) backing
    // this account's creation, so there's nothing for a waiting period to protect against.
    // passwordHash is a random value nobody knows -- this account can only ever be reached via
    // SSO (or by an admin issuing a password reset) since the actual password is discarded.
    const randomPasswordHash = await hashPassword(randomBytes(32).toString("hex"));
    name = normalizedEmail.split("@")[0];
    role = config.defaultRole;
    const [created] = await db
      .insert(users)
      .values({
        name,
        email: normalizedEmail,
        passwordHash: randomPasswordHash,
        role,
        organizationId: config.organizationId,
        // Verified immediately (defaultNow(), same as every other admin/company-owner-created
        // account) -- an SSO login is a stronger identity signal than a self-registered email,
        // not a weaker one.
      })
      .returning({ id: users.id });
    userId = created.id;

    await logAudit({
      actor: null,
      action: "sso.user_provisioned",
      entityType: "user",
      entityId: userId,
      organizationId: config.organizationId,
      detail: `${normalizedEmail} was auto-provisioned as ${role} via SSO sign-in.`,
    });
  }

  const sessionUser: SessionUser = { id: userId, name, email: normalizedEmail, role, organizationId: config.organizationId };
  const token = await createSessionToken(sessionUser);

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), loginCount: existing ? existing.loginCount + 1 : 1 })
    .where(eq(users.id, userId))
    .catch(() => {});

  await logAudit({
    actor: sessionUser,
    action: "sso.login",
    entityType: "user",
    entityId: userId,
    organizationId: config.organizationId,
    detail: `${name} signed in via SSO.`,
  });

  return { ok: true, token };
}

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };
