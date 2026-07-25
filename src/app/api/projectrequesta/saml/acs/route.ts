import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prOrganizations, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildServiceProvider, buildIdentityProvider } from "@/lib/projectrequesta/saml";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { getPrMemberships } from "@/lib/projectrequesta/access";
import { logAudit } from "@/lib/audit";

function redirectWithError(req: NextRequest, message: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("ssoError", message);
  return NextResponse.redirect(url);
}

// Assertion Consumer Service: the IdP POSTs the signed SAMLResponse here after the user
// authenticates. This does NOT auto-provision a new Executa account or a new ProjectRequesta org
// membership from the assertion alone -- the person must already have a Executa login (email
// match) AND already hold a role in the org they're signing into (granted the normal way, via
// that org's Members page). SSO here is an alternate *authentication* path onto an account
// that already exists, not an account-creation path; provisioning accounts straight from an
// unfamiliar IdP's attributes is a bigger trust decision than this scaffold takes on.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return redirectWithError(req, "Malformed SSO response.");

  const samlResponse = form.get("SAMLResponse");
  const relayState = form.get("RelayState");
  const orgId = typeof relayState === "string" ? relayState : "";
  if (typeof samlResponse !== "string" || !orgId) {
    return redirectWithError(req, "Malformed SSO response.");
  }

  const [org] = await db.select().from(prOrganizations).where(eq(prOrganizations.id, orgId));
  if (!org || !org.ssoEnabled) return redirectWithError(req, "SSO is not enabled for this organization.");

  const idp = await buildIdentityProvider(org);
  if (!idp) return redirectWithError(req, "Could not load this organization's IdP metadata.");

  const sp = buildServiceProvider(req.url);

  let email: string | undefined;
  try {
    const result = await sp.parseLoginResponse(idp, "post", {
      body: { SAMLResponse: samlResponse, RelayState: relayState as string },
    });
    // NameID is the standard identifier; some IdPs are configured to send email as a NameID
    // of format "emailAddress", others put it in an attribute instead -- fall back to a
    // common attribute name so this isn't brittle to one specific IdP's defaults.
    email = result.extract.nameID || (result.extract.attributes?.email as string | undefined);
  } catch (err) {
    console.error("SAML assertion validation failed:", err);
    return redirectWithError(req, "Your identity provider's response could not be verified.");
  }

  if (!email) return redirectWithError(req, "Identity provider did not return an email address.");

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!user) {
    return redirectWithError(req, "No Executa account matches this identity. Ask your ProjectRequesta org admin to invite you first.");
  }
  if (user.disabledAt) return redirectWithError(req, "This account has been disabled.");

  const memberships = await getPrMemberships(user.id);
  const isMember = memberships.some((m) => m.prOrganizationId === orgId);
  if (!isMember) {
    return redirectWithError(req, "Your account is not a member of this organization on ProjectRequesta.");
  }

  const token = await createSessionToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  });

  await logAudit({
    actor: user,
    action: "projectrequesta.saml.login",
    entityType: "pr_organization",
    entityId: orgId,
    prOrganizationId: orgId,
  });

  const res = NextResponse.redirect(new URL("/projectrequesta", req.url));
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
