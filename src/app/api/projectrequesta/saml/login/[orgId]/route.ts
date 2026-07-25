import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildServiceProvider, buildIdentityProvider } from "@/lib/projectrequesta/saml";

// SP-initiated login: builds an AuthnRequest for the org's configured IdP and 302-redirects
// the browser there via the SAML redirect binding. The orgId travels in RelayState so the
// ACS callback (POST /api/projectrequesta/saml/acs) knows which org's membership to check the
// returning user against, since the SAMLResponse itself only identifies the user, not which
// ProjectRequesta org they're signing into.
export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;

  const [org] = await db.select().from(prOrganizations).where(eq(prOrganizations.id, orgId));
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.ssoEnabled || !org.samlIdpMetadataUrl) {
    return NextResponse.json({ error: "SSO is not configured for this organization" }, { status: 400 });
  }

  const idp = await buildIdentityProvider(org);
  if (!idp) {
    return NextResponse.json({ error: "Could not load this organization's IdP metadata" }, { status: 502 });
  }

  const sp = buildServiceProvider(req.url);
  const loginRequest = sp.createLoginRequest(idp, "redirect", { relayState: orgId });
  return NextResponse.redirect(loginRequest.context);
}
