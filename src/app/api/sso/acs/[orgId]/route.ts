import { NextRequest, NextResponse } from "next/server";
import {
  getSsoConfig,
  buildServiceProvider,
  buildIdentityProvider,
  provisionAndSignInSsoUser,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/sso";

// Assertion Consumer Service -- public (an IdP posts here with no Executa session of its own),
// but every inbound SAMLResponse is cryptographically verified before anything else happens:
// sp.parseLoginResponse below rejects the request outright (throws) unless it's a signed
// assertion from THIS organization's configured IdP certificate (see wantAssertionsSigned in
// lib/sso.ts), targets this SP's own entityID/ACS URL, and passes SAML's standard Conditions
// checks (NotBefore/NotOnOrAfter, audience restriction). Only after that succeeds does this
// route trust the asserted NameID enough to log someone in.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const config = await getSsoConfig(orgId);
  if (!config || !config.isEnabled) {
    return NextResponse.redirect(new URL("/login?error=sso_not_configured", req.url));
  }

  const form = await req.formData().catch(() => null);
  const samlResponse = form?.get("SAMLResponse");
  if (!samlResponse || typeof samlResponse !== "string") {
    return NextResponse.redirect(new URL("/login?error=sso_invalid_response", req.url));
  }

  const sp = buildServiceProvider(orgId);
  const idp = buildIdentityProvider(config);

  let email: string | undefined;
  try {
    const result = await sp.parseLoginResponse(idp, "post", { body: { SAMLResponse: samlResponse } });
    email = result.extract?.nameID;
  } catch (err) {
    // Signature verification failure, expired/replayed assertion, audience mismatch, etc. --
    // never leak the underlying samlify error to the browser; log it server-side only.
    console.error(`SSO ACS verification failed for org ${orgId}:`, err);
    return NextResponse.redirect(new URL("/login?error=sso_verification_failed", req.url));
  }

  if (!email) {
    return NextResponse.redirect(new URL("/login?error=sso_no_email", req.url));
  }

  // Defense in depth on top of the certificate check above: the asserted identity's domain
  // should match what this org registered as its SSO domain. Catches a misconfigured IdP
  // (wrong app connected, wrong org's cert reused) that's nonetheless correctly signed.
  const assertedDomain = email.split("@")[1]?.toLowerCase();
  if (assertedDomain !== config.emailDomain.toLowerCase()) {
    return NextResponse.redirect(new URL("/login?error=sso_domain_mismatch", req.url));
  }

  const outcome = await provisionAndSignInSsoUser(config, email);
  if (!outcome.ok) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(outcome.error)}`, req.url));
  }

  const res = NextResponse.redirect(new URL("/home", req.url));
  res.cookies.set(SESSION_COOKIE_NAME, outcome.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
